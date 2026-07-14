import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import validate from "../src/generated/scene-document.validator.js";

const generatedPath = fileURLToPath(
  new URL("../src/generated/scene-document.validator.js", import.meta.url),
);
const fixturePath = fileURLToPath(
  new URL("../../../specs/001-product-foundation/contracts/scene.example.json", import.meta.url),
);
const [generated, fixture] = await Promise.all([
  readFile(generatedPath, "utf8"),
  readFile(fixturePath, "utf8"),
]);

if (/\brequire\s*\(|new Function\s*\(/u.test(generated)) {
  throw new Error("Standalone validator contains a runtime compiler or CommonJS require.");
}

if (!validate(JSON.parse(fixture))) {
  throw new Error("Standalone validator rejected the canonical SceneDocument fixture.");
}

process.stdout.write("standalone-validator-ok\n");
