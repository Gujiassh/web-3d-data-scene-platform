import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  parseSceneDocument,
  serializeSceneDocument,
  validateSceneDocument,
  type SceneDocument,
} from "./index.js";

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
    if (result.ok) expect(result.value.id).toBe("factory-demo");
  });

  it("validates the generated M0 factory fixture", () => {
    const result = parseSceneDocument(readFileSync(m0FixtureUrl, "utf8"));

    expect(result.ok).toBe(true);
    if (result.ok)
      expect(result.value.targets.map((target) => target.id)).toEqual(["press-01", "conveyor-01"]);
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
  return JSON.parse(readFileSync(fixtureUrl, "utf8")) as Record<string, unknown>;
}

function records(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new TypeError("Expected fixture array.");
  return value as Record<string, unknown>[];
}

function codes(result: ReturnType<typeof validateSceneDocument>): string[] {
  return result.diagnostics.map((diagnostic) => diagnostic.code);
}

function paths(result: ReturnType<typeof validateSceneDocument>): string[] {
  return result.diagnostics.map((diagnostic) => diagnostic.path);
}
