import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import validate from "../src/generated/scene-document.validator.js";
import validate1_0 from "../src/generated/scene-document-1.0.validator.js";

const generatedPath = fileURLToPath(
  new URL("../src/generated/scene-document.validator.js", import.meta.url),
);
const fixturePath = fileURLToPath(
  new URL("../../../specs/001-product-foundation/contracts/scene.example.json", import.meta.url),
);
const legacyGeneratedPath = fileURLToPath(
  new URL("../src/generated/scene-document-1.0.validator.js", import.meta.url),
);
const [generated, legacyGenerated, fixture] = await Promise.all([
  readFile(generatedPath, "utf8"),
  readFile(legacyGeneratedPath, "utf8"),
  readFile(fixturePath, "utf8"),
]);

if (
  [generated, legacyGenerated].some((source) => /\brequire\s*\(|new Function\s*\(/u.test(source))
) {
  throw new Error("Standalone validator contains a runtime compiler or CommonJS require.");
}

if (!validate(JSON.parse(fixture))) {
  throw new Error("Standalone validator rejected the canonical SceneDocument fixture.");
}
const legacyFixture = JSON.parse(fixture);
legacyFixture.schemaVersion = "1.0.0";
delete legacyFixture.environment.backgroundMode;
if (!validate1_0(legacyFixture)) {
  throw new Error("Standalone legacy validator rejected the 1.0 SceneDocument fixture.");
}

process.stdout.write("standalone-validator-ok\n");
