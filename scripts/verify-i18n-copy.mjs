import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import ts from "typescript";

const roots = ["apps/studio/src", "apps/shared"];
const userFacingAttributes = new Set(["alt", "aria-label", "placeholder", "title"]);
const allowedTechnicalText = new Set([
  "/machines/*/status",
  "GLB",
  "glTF",
  "SHA-256",
  "X",
  "Y",
  "Z",
  "EN",
  "document=valid storage=indexeddb authoring=ready",
  "edit",
  "中",
]);
const allowedDeveloperErrors = new Set([
  "Studio root element was not found.",
  "StudioI18nProvider is missing.",
]);
const violations = [];

for (const root of roots) {
  for (const file of await productionFiles(root)) await inspect(file);
}

if (violations.length > 0) {
  process.stderr.write("Raw user-facing copy found outside app i18n catalogs:\n");
  for (const violation of violations) process.stderr.write(`- ${violation}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`i18n copy verification passed (${roots.join(", ")}).\n`);
}

async function inspect(file) {
  const sourceText = await readFile(file, "utf8");
  const source = ts.createSourceFile(
    file,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );

  visit(source);

  function visit(node) {
    if (ts.isJsxText(node)) record(node, node.text);

    if (ts.isJsxAttribute(node) && userFacingAttributes.has(node.name.getText(source))) {
      if (node.initializer && ts.isStringLiteral(node.initializer)) {
        record(node.initializer, node.initializer.text);
      } else if (node.initializer && ts.isJsxExpression(node.initializer)) {
        inspectDisplayExpression(node.initializer.expression);
      }
      return;
    }

    if (ts.isJsxExpression(node) && isJsxChild(node)) inspectDisplayExpression(node.expression);
    if (ts.isNewExpression(node) && node.expression.getText(source) === "Error") {
      inspectFixedError(node.arguments?.[0]);
    }
    ts.forEachChild(node, visit);
  }

  function inspectFixedError(expression) {
    if (!expression) return;
    const fragments = [];
    collect(expression);
    const text = fragments.join(" ").replace(/\s+/g, " ").trim();
    if (!hasHumanCopy(text) || allowedDeveloperErrors.has(text)) return;
    const position = source.getLineAndCharacterOfPosition(expression.getStart(source));
    violations.push(
      `${file}:${position.line + 1}:${position.character + 1} fixed Error ${JSON.stringify(text)}`,
    );

    function collect(node) {
      if (
        ts.isStringLiteral(node) ||
        ts.isNoSubstitutionTemplateLiteral(node) ||
        ts.isTemplateHead(node) ||
        ts.isTemplateMiddle(node) ||
        ts.isTemplateTail(node)
      ) {
        fragments.push(node.text);
      }
      ts.forEachChild(node, collect);
    }
  }

  function inspectDisplayExpression(expression) {
    if (!expression) return;
    walk(expression);

    function walk(node) {
      if (
        node !== expression &&
        (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node))
      ) {
        return;
      }
      if (
        (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
        !isTechnicalLookupKey(node)
      ) {
        record(node, node.text);
      }
      if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
        record(node, node.text);
      }
      ts.forEachChild(node, walk);
    }
  }

  function record(node, rawText) {
    const text = rawText.replace(/\s+/g, " ").trim();
    if (!hasHumanCopy(text) || allowedTechnicalText.has(text)) return;
    const position = source.getLineAndCharacterOfPosition(node.getStart(source));
    violations.push(
      `${file}:${position.line + 1}:${position.character + 1} ${JSON.stringify(text)}`,
    );
  }
}

function isJsxChild(node) {
  return ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent);
}

function isTechnicalLookupKey(node) {
  if (ts.isElementAccessExpression(node.parent) && node.parent.argumentExpression === node) {
    return true;
  }
  if (!ts.isBinaryExpression(node.parent)) return false;
  return (
    node.parent.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken ||
    node.parent.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsEqualsToken
  );
}

function hasHumanCopy(text) {
  return /[A-Za-z\u3400-\u9fff]/u.test(text);
}

async function productionFiles(root) {
  const output = [];
  await walk(root);
  return output.sort();

  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(target);
      else if (
        entry.isFile() &&
        (target.endsWith(".ts") || target.endsWith(".tsx")) &&
        !target.endsWith(".test.ts") &&
        !target.endsWith(".test.tsx")
      ) {
        output.push(target);
      }
    }
  }
}
