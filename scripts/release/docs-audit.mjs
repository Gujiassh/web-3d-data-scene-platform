import { access, readFile } from "node:fs/promises";
import path from "node:path";

const requiredFiles = [
  "README.md",
  "LICENSE",
  "THIRD_PARTY_NOTICES.md",
  "CONTRIBUTING.md",
  "SECURITY.md",
  "CODE_OF_CONDUCT.md",
  "CHANGELOG.md",
  "docs/architecture.md",
  "docs/protocols.md",
  "docs/tutorial-smart-home.md",
  "docs/ssot/brand-and-discovery.md",
  "docs/ssot/release-readiness.md",
  "docs/ssot/validator-generation.md",
  "specs/009-performance-usability-open-source/acceptance.md",
  "specs/010-sceneweave-brand-discovery/spec.md",
  "specs/010-sceneweave-brand-discovery/acceptance.md",
  "specs/011-atomic-validator-generation/spec.md",
  "specs/011-atomic-validator-generation/acceptance.md",
];

export async function auditReleaseDocs(root) {
  const checkedLinks = [];
  for (const relative of requiredFiles) {
    const sourcePath = path.join(root, relative);
    await access(sourcePath);
    if (!relative.endsWith(".md")) continue;
    const source = await readFile(sourcePath, "utf8");
    for (const target of localMarkdownTargets(source)) {
      const targetPath = path.resolve(path.dirname(sourcePath), target);
      if (!isWithin(root, targetPath)) {
        throw new Error(`Documentation link escapes repository: ${relative} -> ${target}`);
      }
      try {
        await access(targetPath);
      } catch {
        throw new Error(`Documentation link is missing: ${relative} -> ${target}`);
      }
      checkedLinks.push(`${relative} -> ${path.relative(root, targetPath)}`);
    }
  }
  return { files: requiredFiles.length, localLinks: checkedLinks.length, checkedLinks };
}

export function localMarkdownTargets(source) {
  return [...source.matchAll(/\]\(([^)]+)\)/gu)]
    .map((match) => match[1]?.trim() ?? "")
    .filter(
      (target) =>
        target !== "" && !target.startsWith("#") && !/^(?:https?:|mailto:)/iu.test(target),
    )
    .map((target) => target.replace(/^<|>$/gu, "").split("#", 1)[0])
    .map((target) => decodeURIComponent(target));
}

function isWithin(root, target) {
  const relative = path.relative(root, target);
  return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}
