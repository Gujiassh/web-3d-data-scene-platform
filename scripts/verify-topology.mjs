import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const violations = [];
const forbiddenTokens = [
  "apps/factory-demo",
  "@web3d/factory-demo",
  "4174",
  "web3d.factory-demo.locale",
  "web3d.factory-demo.theme",
];
const historicalAllowlist = new Set([
  "specs/003-bilingual-ui/plan.md",
  "specs/003-bilingual-ui/tasks.md",
  "specs/004-theme-project-naming/plan.md",
  "specs/004-theme-project-naming/tasks.md",
  "specs/005-single-studio-data-binding/plan.md",
  "specs/005-single-studio-data-binding/quickstart.md",
  "specs/005-single-studio-data-binding/tasks.md",
]);

if (await exists("apps/factory-demo")) {
  violations.push("apps/factory-demo must not exist");
}

for (const file of await textFiles(root)) {
  const relative = path.relative(root, file).split(path.sep).join("/");
  if (relative === "scripts/verify-topology.mjs" || historicalAllowlist.has(relative)) continue;
  const text = await readFile(file, "utf8");
  for (const token of forbiddenTokens) {
    if (text.includes(token)) violations.push(`${relative} contains forbidden token ${token}`);
  }
}

const rootPackage = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
if (rootPackage.scripts?.dev !== "pnpm --filter @web3d/studio dev") {
  violations.push("root dev script must start only @web3d/studio");
}

const studioPackage = JSON.parse(
  await readFile(path.join(root, "apps/studio/package.json"), "utf8"),
);
if (!studioPackage.scripts?.dev?.includes("--port 4173 --strictPort")) {
  violations.push("Studio dev script must bind strict port 4173");
}

const playwright = await readFile(path.join(root, "playwright.config.ts"), "utf8");
if (!playwright.includes('baseURL: "http://127.0.0.1:4173"')) {
  violations.push("Playwright baseURL must target Studio on 4173");
}
if (/webServer\s*:\s*\[/.test(playwright)) {
  violations.push("Playwright must use one webServer object, not a server array");
}
if ((playwright.match(/\bcommand\s*:/g) ?? []).length !== 1) {
  violations.push("Playwright must define exactly one webServer command");
}

if (violations.length > 0) {
  process.stderr.write("Single-Studio topology verification failed:\n");
  for (const violation of violations) process.stderr.write(`- ${violation}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write("Single-Studio topology verification passed.\n");
}

async function exists(relative) {
  try {
    await access(path.join(root, relative));
    return true;
  } catch {
    return false;
  }
}

async function textFiles(directory) {
  const output = [];
  await walk(directory);
  return output.sort();

  async function walk(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      if (
        entry.isDirectory() &&
        [".git", "artifacts", "dist", "node_modules", "playwright-report", "test-results"].includes(
          entry.name,
        )
      ) {
        continue;
      }
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(target);
      } else if (entry.isFile() && /\.(?:c?js|mjs|json|md|ts|tsx|ya?ml)$/u.test(entry.name)) {
        output.push(target);
      }
    }
  }
}
