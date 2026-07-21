import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import ts from "typescript";

const directory = path.resolve(process.argv[2] ?? "");
if (process.argv[2] === undefined) {
  throw new Error("Usage: rewrite-declaration-imports.mjs <declaration-directory>");
}

for (const file of await declarationFiles(directory)) {
  const sourceText = await readFile(file, "utf8");
  const sourceFile = ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true);
  const edits = [];

  visit(sourceFile);
  if (edits.length === 0) continue;

  let output = sourceText;
  for (const edit of edits.toSorted((left, right) => right.start - left.start)) {
    output = `${output.slice(0, edit.start)}${edit.value}${output.slice(edit.end)}`;
  }
  await writeFile(file, output, "utf8");

  function visit(node) {
    if (
      ts.isStringLiteral(node) &&
      isModuleSpecifier(node.parent, node) &&
      needsJavaScriptExtension(node.text)
    ) {
      edits.push({
        start: node.getStart(sourceFile) + 1,
        end: node.getEnd() - 1,
        value: `${node.text}.js`,
      });
    }
    ts.forEachChild(node, visit);
  }
}

async function declarationFiles(root) {
  const output = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) output.push(...(await declarationFiles(target)));
    else if (entry.isFile() && entry.name.endsWith(".d.ts")) output.push(target);
  }
  return output;
}

function isModuleSpecifier(parent, node) {
  return (
    ((ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent)) &&
      parent.moduleSpecifier === node) ||
    (ts.isLiteralTypeNode(parent) &&
      ts.isImportTypeNode(parent.parent) &&
      parent.parent.argument === parent)
  );
}

function needsJavaScriptExtension(specifier) {
  return specifier.startsWith(".") && path.posix.extname(specifier) === "";
}
