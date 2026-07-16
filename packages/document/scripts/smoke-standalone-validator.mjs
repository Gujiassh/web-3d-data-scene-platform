import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import validate from "../src/generated/scene-document.validator.js";
import validate1_0 from "../src/generated/scene-document-1.0.validator.js";
import validate1_1 from "../src/generated/scene-document-1.1.validator.js";

const generatedPath = fileURLToPath(
  new URL("../src/generated/scene-document.validator.js", import.meta.url),
);
const fixturePath = fileURLToPath(
  new URL("../../../specs/001-product-foundation/contracts/scene.example.json", import.meta.url),
);
const legacyGeneratedPath = fileURLToPath(
  new URL("../src/generated/scene-document-1.0.validator.js", import.meta.url),
);
const legacy1_1GeneratedPath = fileURLToPath(
  new URL("../src/generated/scene-document-1.1.validator.js", import.meta.url),
);
const [generated, legacyGenerated, legacy1_1Generated, fixture] = await Promise.all([
  readFile(generatedPath, "utf8"),
  readFile(legacyGeneratedPath, "utf8"),
  readFile(legacy1_1GeneratedPath, "utf8"),
  readFile(fixturePath, "utf8"),
]);

if (
  [generated, legacyGenerated, legacy1_1Generated].some((source) =>
    /\brequire\s*\(|new Function\s*\(/u.test(source),
  )
) {
  throw new Error("Standalone validator contains a runtime compiler or CommonJS require.");
}

if (!validate(JSON.parse(fixture))) {
  throw new Error("Standalone validator rejected the canonical SceneDocument fixture.");
}
const legacy1_1Fixture = JSON.parse(fixture);
legacy1_1Fixture.schemaVersion = "1.1.0";
delete legacy1_1Fixture.environment.lighting;
if (!validate1_1(legacy1_1Fixture)) {
  throw new Error("Standalone legacy validator rejected the 1.1 SceneDocument fixture.");
}
const legacy1_0Fixture = JSON.parse(JSON.stringify(legacy1_1Fixture));
legacy1_0Fixture.schemaVersion = "1.0.0";
delete legacy1_0Fixture.environment.backgroundMode;
if (!validate1_0(legacy1_0Fixture)) {
  throw new Error("Standalone legacy validator rejected the 1.0 SceneDocument fixture.");
}

process.stdout.write("standalone-validator-ok\n");
