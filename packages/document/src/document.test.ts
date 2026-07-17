import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  parseSceneDocument,
  serializeSceneDocument,
  validateSceneDocument,
  type SceneDocument,
} from "./index.js";
import * as validationModule from "./validate.js";

const fixtureUrl = new URL(
  "../../../specs/001-product-foundation/contracts/scene.example.json",
  import.meta.url,
);
const m0FixtureUrl = new URL(
  "../../../tests/fixtures/m0-factory/public/m0-scene.json",
  import.meta.url,
);

describe("SceneDocument", () => {
  it("parses and validates the contract fixture", () => {
    const result = parseSceneDocument(readFileSync(fixtureUrl, "utf8"));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.id).toBe("factory-demo");
      expect(result.value.schemaVersion).toBe("1.3.0");
    }
  });

  it("validates the generated M0 factory fixture", () => {
    const generated = JSON.parse(readFileSync(m0FixtureUrl, "utf8")) as Record<string, unknown>;
    const result = parseSceneDocument(JSON.stringify(generated));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.schemaVersion).toBe("1.3.0");
      expect(result.value.environment.lighting).toEqual(standardLighting());
      expect(result.value.targets.map((target) => target.id)).toEqual(["press-01", "conveyor-01"]);
    }
  });

  it("migrates a valid 1.1 document to 1.3 without changing revision or authored fields", () => {
    const current = loadFixture();
    const legacy = loadLegacy1_1Fixture();
    const result = parseSceneDocument(JSON.stringify(legacy));

    expect(validateSceneDocument(legacy).ok).toBe(false);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({
      ...legacy,
      schemaVersion: "1.3.0",
      environment: {
        ...(legacy["environment"] as Record<string, unknown>),
        lighting: standardLighting(),
      },
    });
    expect(result.value.revision).toBe(current["revision"]);
  });

  it.each(["1.0.0", "1.1.0"] as const)(
    "canonicalizes legacy %s environment colors during migration",
    (version) => {
      const legacy = version === "1.0.0" ? loadLegacyFixture() : loadLegacy1_1Fixture();
      (legacy["environment"] as Record<string, unknown>)["background"] = "#a0b1c2";

      const result = parseSceneDocument(JSON.stringify(legacy));

      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.environment.background).toBe("#A0B1C2");
    },
  );

  it("validates legacy semantics before migration", () => {
    const validateLegacy = (
      validationModule as typeof validationModule & {
        readonly validateSceneDocument1_0?: (value: unknown) => DiagnosticResult;
      }
    ).validateSceneDocument1_0;
    expect(validateLegacy).toBeTypeOf("function");
    if (validateLegacy === undefined) return;

    const validateLegacy1_1 = (
      validationModule as typeof validationModule & {
        readonly validateSceneDocument1_1?: (value: unknown) => DiagnosticResult;
      }
    ).validateSceneDocument1_1;
    expect(validateLegacy1_1).toBeTypeOf("function");

    const cycle = loadLegacyFixture();
    records(cycle["entities"])[0]!["parentId"] = "press-01";
    expect(codes(validateLegacy(cycle))).toContain("ENTITY_CYCLE");
    expect(codes(parseSceneDocument(JSON.stringify(cycle)))).toContain("ENTITY_CYCLE");

    const missingReference = loadLegacyFixture();
    records(missingReference["bindings"])[0]!["sourceId"] = "missing-source";
    expect(codes(validateLegacy(missingReference))).toContain("BINDING_SOURCE_NOT_FOUND");
    expect(codes(parseSceneDocument(JSON.stringify(missingReference)))).toContain(
      "BINDING_SOURCE_NOT_FOUND",
    );

    const invalidThreshold = loadLegacyFixture();
    records(invalidThreshold["dataSources"])[0]!["offlineAfterMs"] = 5000;
    expect(codes(validateLegacy(invalidThreshold))).toContain("DATA_SOURCE_THRESHOLD_ORDER");
    expect(codes(parseSceneDocument(JSON.stringify(invalidThreshold)))).toContain(
      "DATA_SOURCE_THRESHOLD_ORDER",
    );

    const legacy1_1Cycle = loadLegacy1_1Fixture();
    records(legacy1_1Cycle["entities"])[0]!["parentId"] = "press-01";
    expect(codes(validateLegacy1_1!(legacy1_1Cycle))).toContain("ENTITY_CYCLE");
    expect(codes(parseSceneDocument(JSON.stringify(legacy1_1Cycle)))).toContain("ENTITY_CYCLE");
  });

  it("validates complete lighting structure and unit-vector semantics", () => {
    const missing = loadFixture();
    delete (missing["environment"] as Record<string, unknown>)["lighting"];
    expect(paths(validateSceneDocument(missing))).toContain("/environment/lighting");

    const invalidColor = loadFixture();
    lightingFill(invalidColor)["skyColor"] = "white";
    expect(codes(validateSceneDocument(invalidColor))).toContain("SCHEMA_VALIDATION_FAILED");

    const nonCanonicalColor = loadFixture();
    lightingFill(nonCanonicalColor)["skyColor"] = "#ffffff";
    expect(codes(validateSceneDocument(nonCanonicalColor))).toContain("SCHEMA_VALIDATION_FAILED");

    const invalidIntensity = loadFixture();
    lightingFill(invalidIntensity)["intensity"] = 5.01;
    expect(codes(validateSceneDocument(invalidIntensity))).toContain("SCHEMA_VALIDATION_FAILED");

    const invalidDirection = loadFixture();
    lightingKey(invalidDirection)["directionToLight"] = [1, 1, 1];
    const result = validateSceneDocument(invalidDirection);
    expect(codes(result)).toContain("LIGHTING_DIRECTION_NOT_UNIT");
    expect(paths(result)).toContain("/environment/lighting/key/directionToLight");
  });

  it("returns stable diagnostics for malformed structure", () => {
    const input = loadFixture();
    delete input["name"];

    expect(codes(validateSceneDocument(input))).toContain("SCHEMA_REQUIRED");
    expect(paths(validateSceneDocument(input))).toContain("/name");
  });

  it("detects entity cycles", () => {
    const input = loadFixture();
    const entities = records(input["entities"]);
    entities[0]!["parentId"] = "press-01";

    expect(codes(validateSceneDocument(input))).toContain("ENTITY_CYCLE");
  });

  it("detects stale binding references", () => {
    const input = loadFixture();
    const binding = records(input["bindings"])[0]!;
    binding["targetId"] = "missing-target";
    binding["sourceId"] = "missing-source";
    binding["ruleSetId"] = "missing-rules";

    expect(codes(validateSceneDocument(input))).toEqual(
      expect.arrayContaining([
        "BINDING_TARGET_NOT_FOUND",
        "BINDING_SOURCE_NOT_FOUND",
        "BINDING_RULE_SET_NOT_FOUND",
      ]),
    );
  });

  it("detects enabled binding write conflicts", () => {
    const input = loadFixture();
    const bindings = records(input["bindings"]);
    bindings.push({
      ...bindings[0],
      id: "press-01-color-binding-2",
      writes: ["color"],
    });

    expect(codes(validateSceneDocument(input))).toContain("BINDING_WRITE_CONFLICT");
  });

  it("keeps legacy non-canonical binding pointers globally valid", () => {
    const input = loadFixture();
    records(input["bindings"])[0]!["pointer"] = "/machines/legacy~2status";

    expect(validateSceneDocument(input).ok).toBe(true);
  });

  it("detects duplicate IDs and asset, target, and threshold inconsistencies", () => {
    const input = loadFixture();
    records(input["views"])[0]!["id"] = "factory-root";
    records(input["targets"])[0]!["assetHash"] = "b".repeat(64);
    records(input["targets"])[0]!["nodeIndex"] = 8;
    records(input["dataSources"])[0]!["offlineAfterMs"] = 5000;

    expect(codes(validateSceneDocument(input))).toEqual(
      expect.arrayContaining([
        "DUPLICATE_ID",
        "TARGET_ASSET_HASH_MISMATCH",
        "TARGET_NODE_INDEX_OUT_OF_RANGE",
        "DATA_SOURCE_THRESHOLD_ORDER",
      ]),
    );
  });

  it("rejects runtime-only properties structurally", () => {
    const input = loadFixture();
    input["currentSelection"] = "press-01";

    const result = validateSceneDocument(input);
    expect(codes(result)).toContain("SCHEMA_ADDITIONAL_PROPERTY");
    expect(paths(result)).toContain("/currentSelection");
  });

  it("rejects asset references on groups and missing comparison values", () => {
    const input = loadFixture();
    records(input["entities"])[0]!["assetId"] = "asset-press";
    delete records(records(input["ruleSets"])[0]!["rules"])[0]!["when"];
    records(records(input["ruleSets"])[0]!["rules"])[0]!["when"] = {
      fact: "value",
      operator: "eq",
    };

    expect(codes(validateSceneDocument(input))).toContain("SCHEMA_VALIDATION_FAILED");
  });

  it("requires binding writes to match effects and rejects unknown label tokens", () => {
    const input = loadFixture();
    records(input["bindings"])[0]!["writes"] = ["visibility"];
    const ruleSet = records(input["ruleSets"])[0]!;
    const firstRule = records(ruleSet["rules"])[0]!;
    const effects = records(firstRule["effects"]);
    effects.push({ type: "label", template: "{{unsafeHtml}}" });

    expect(codes(validateSceneDocument(input))).toEqual(
      expect.arrayContaining(["BINDING_WRITES_MISMATCH", "RULE_LABEL_TOKEN_INVALID"]),
    );
  });

  it("serializes deterministically without mutating top-level arrays", () => {
    const result = validateSceneDocument(loadFixture());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const reversed = {
      ...result.value,
      entities: [...result.value.entities].reverse(),
    } satisfies SceneDocument;
    const before = reversed.entities.map((entity) => entity.id);

    expect(serializeSceneDocument(reversed)).toBe(serializeSceneDocument(result.value));
    expect(reversed.entities.map((entity) => entity.id)).toEqual(before);
  });
});

function loadFixture(): Record<string, unknown> {
  const fixture = JSON.parse(readFileSync(fixtureUrl, "utf8")) as Record<string, unknown>;
  fixture["schemaVersion"] = "1.3.0";
  return fixture;
}

function loadLegacyFixture(): Record<string, unknown> {
  const legacy = loadLegacy1_1Fixture();
  legacy["schemaVersion"] = "1.0.0";
  const environment = legacy["environment"];
  if (environment === null || typeof environment !== "object" || Array.isArray(environment)) {
    throw new TypeError("Expected fixture environment.");
  }
  delete (environment as Record<string, unknown>)["backgroundMode"];
  return legacy;
}

function loadLegacy1_1Fixture(): Record<string, unknown> {
  const legacy = loadFixture();
  legacy["schemaVersion"] = "1.1.0";
  const environment = legacy["environment"];
  if (environment === null || typeof environment !== "object" || Array.isArray(environment)) {
    throw new TypeError("Expected fixture environment.");
  }
  delete (environment as Record<string, unknown>)["lighting"];
  return legacy;
}

function standardLighting(): Record<string, unknown> {
  return {
    fill: { skyColor: "#FFFFFF", groundColor: "#65706A", intensity: 1.8 },
    key: {
      color: "#FFFFFF",
      intensity: 2.2,
      directionToLight: [0.37904902178945177, 0.7580980435789035, 0.5306686305052324],
    },
  };
}

function lightingFill(document: Record<string, unknown>): Record<string, unknown> {
  return lightingPart(document, "fill");
}

function lightingKey(document: Record<string, unknown>): Record<string, unknown> {
  return lightingPart(document, "key");
}

function lightingPart(document: Record<string, unknown>, part: "fill" | "key") {
  const environment = document["environment"] as Record<string, unknown>;
  const lighting = environment["lighting"] as Record<string, unknown>;
  return lighting[part] as Record<string, unknown>;
}

function records(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new TypeError("Expected fixture array.");
  return value as Record<string, unknown>[];
}

interface DiagnosticResult {
  readonly diagnostics: readonly { readonly code: string }[];
}

function codes(result: DiagnosticResult): string[] {
  return result.diagnostics.map((diagnostic) => diagnostic.code);
}

function paths(result: ReturnType<typeof validateSceneDocument>): string[] {
  return result.diagnostics.map((diagnostic) => diagnostic.path);
}
