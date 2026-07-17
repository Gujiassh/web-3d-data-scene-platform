import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  parseSceneDocument,
  validateSceneDocument,
  validateSceneDocument1_0,
  validateSceneDocument1_1,
  validateSceneDocument1_2,
} from "./index.js";

const fixtureUrl = new URL(
  "../../../specs/001-product-foundation/contracts/scene.example.json",
  import.meta.url,
);

describe("SceneDocument 1.3 light entities", () => {
  it("accepts canonical root point and spot entities", () => {
    const document = currentFixture();
    document.entities.push(pointLight("point-01"), spotLight("spot-01"));

    const result = validateSceneDocument(document);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.schemaVersion).toBe("1.3.0");
    expect(result.value.entities.slice(-2)).toEqual([pointLight("point-01"), spotLight("spot-01")]);
  });

  it.each([
    [
      "top-level point discriminator",
      (entity: EntityRecord) => {
        entity.type = "point";
      },
    ],
    [
      "non-root parent",
      (entity: EntityRecord) => {
        entity.parentId = "factory-root";
      },
    ],
    [
      "lowercase color",
      (entity: EntityRecord) => {
        light(entity).color = "#ffffff";
      },
    ],
    [
      "negative intensity",
      (entity: EntityRecord) => {
        light(entity).intensity = -1;
      },
    ],
    [
      "non-finite intensity",
      (entity: EntityRecord) => {
        light(entity).intensity = Number.POSITIVE_INFINITY;
      },
    ],
    [
      "NaN intensity",
      (entity: EntityRecord) => {
        light(entity).intensity = Number.NaN;
      },
    ],
    [
      "intensity above cap",
      (entity: EntityRecord) => {
        light(entity).intensity = 1000.001;
      },
    ],
    [
      "zero range",
      (entity: EntityRecord) => {
        light(entity).range = 0;
      },
    ],
    [
      "negative range",
      (entity: EntityRecord) => {
        light(entity).range = -1;
      },
    ],
    [
      "non-finite range",
      (entity: EntityRecord) => {
        light(entity).range = Number.POSITIVE_INFINITY;
      },
    ],
    [
      "persisted unit",
      (entity: EntityRecord) => {
        light(entity).unit = "candela";
      },
    ],
    [
      "persisted decay",
      (entity: EntityRecord) => {
        light(entity).decay = 2;
      },
    ],
    [
      "persisted shadow",
      (entity: EntityRecord) => {
        light(entity).castShadow = false;
      },
    ],
    [
      "transient helper state",
      (entity: EntityRecord) => {
        entity["helperVisible"] = true;
      },
    ],
    [
      "non-finite position",
      (entity: EntityRecord) => {
        entity.transform!["position"] = [0, Number.POSITIVE_INFINITY, 0];
      },
    ],
  ] as const)("rejects invalid point contract: %s", (_name, mutate) => {
    const document = currentFixture();
    const entity = pointLight("point-01");
    mutate(entity);
    document.entities.push(entity);

    expect(validateSceneDocument(document).ok).toBe(false);
  });

  it.each([
    [
      "zero angle",
      (entity: EntityRecord) => {
        light(entity).angleRadians = 0;
      },
    ],
    [
      "angle above pi/2",
      (entity: EntityRecord) => {
        light(entity).angleRadians = Math.PI / 2 + 1e-9;
      },
    ],
    [
      "non-finite angle",
      (entity: EntityRecord) => {
        light(entity).angleRadians = Number.POSITIVE_INFINITY;
      },
    ],
    [
      "negative penumbra",
      (entity: EntityRecord) => {
        light(entity).penumbra = -0.01;
      },
    ],
    [
      "penumbra above one",
      (entity: EntityRecord) => {
        light(entity).penumbra = 1.01;
      },
    ],
    [
      "NaN penumbra",
      (entity: EntityRecord) => {
        light(entity).penumbra = Number.NaN;
      },
    ],
    [
      "point-only shape",
      (entity: EntityRecord) => {
        delete light(entity).angleRadians;
      },
    ],
  ] as const)("rejects invalid spot contract: %s", (_name, mutate) => {
    const document = currentFixture();
    const entity = spotLight("spot-01");
    mutate(entity);
    document.entities.push(entity);

    expect(validateSceneDocument(document).ok).toBe(false);
  });

  it("enforces exact light transform invariants", () => {
    const cases: readonly [string, EntityRecord, string][] = [
      [
        "point rotation",
        pointLight("point-01", { rotation: [0, Math.SQRT1_2, 0, Math.SQRT1_2] }),
        "LIGHT_POINT_ROTATION_NOT_IDENTITY",
      ],
      ["point scale", pointLight("point-02", { scale: [1, 2, 1] }), "LIGHT_SCALE_NOT_IDENTITY"],
      ["spot scale", spotLight("spot-01", { scale: [0.5, 1, 1] }), "LIGHT_SCALE_NOT_IDENTITY"],
      [
        "spot rotation",
        spotLight("spot-02", { rotation: [0, 0, 0, 2] }),
        "LIGHT_ROTATION_NOT_NORMALIZED",
      ],
    ];

    for (const [, entity, expectedCode] of cases) {
      const document = currentFixture();
      document.entities.push(entity);
      expect(codes(validateSceneDocument(document))).toContain(expectedCode);
    }
  });

  it("rejects a ninth light, a child owned by a light, and a light target", () => {
    const overLimit = currentFixture();
    overLimit.entities.push(
      ...Array.from({ length: 9 }, (_, index) => pointLight(`point-${index + 1}`)),
    );
    expect(codes(validateSceneDocument(overLimit))).toContain("LIGHT_ENTITY_LIMIT_EXCEEDED");

    const child = currentFixture();
    child.entities.push(pointLight("point-parent"));
    child.entities[0] = { ...child.entities[0]!, parentId: "point-parent" };
    const childResult = validateSceneDocument(child);
    expect(codes(childResult)).toContain("ENTITY_PARENT_LIGHT");
    expect(paths(childResult)).toContain("/entities/0/parentId");

    const target = currentFixture();
    target.entities.push(pointLight("point-target"));
    target.targets[0] = { ...target.targets[0]!, entityId: "point-target" };
    expect(codes(validateSceneDocument(target))).toContain("TARGET_ENTITY_NOT_ASSET");
  });
});

describe("SceneDocument frozen migration chain", () => {
  it("keeps an independent frozen 1.2 validator", () => {
    const legacy = legacyFixture("1.2.0");

    expect(validateSceneDocument1_2(legacy).ok).toBe(true);
    expect(validateSceneDocument(legacy).ok).toBe(false);

    const withLight = structuredClone(legacy);
    withLight.entities.push(pointLight("point-01"));
    expect(validateSceneDocument1_2(withLight).ok).toBe(false);
  });

  it.each(["1.0.0", "1.1.0", "1.2.0"] as const)(
    "validates and migrates %s through every frozen version to current",
    (version) => {
      const legacy = legacyFixture(version);
      const result = parseSceneDocument(JSON.stringify(legacy));

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.schemaVersion).toBe("1.3.0");
      expect(result.value.revision).toBe(legacy.revision);
    },
  );

  it("changes only schemaVersion in the 1.2 to 1.3 migration", () => {
    const legacy = legacyFixture("1.2.0");
    const result = parseSceneDocument(JSON.stringify(legacy));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect({ ...result.value, schemaVersion: "1.2.0" }).toEqual(legacy);
  });

  it("rejects invalid structural and semantic 1.1 and 1.2 inputs before later migration", () => {
    const invalid1_1Structure = legacyFixture("1.1.0");
    invalid1_1Structure.environment.unexpected = true;
    expect(validateSceneDocument1_1(invalid1_1Structure).ok).toBe(false);
    expect(parseSceneDocument(JSON.stringify(invalid1_1Structure)).ok).toBe(false);

    const invalid1_1Semantics = legacyFixture("1.1.0");
    invalid1_1Semantics.entities[0]!.parentId = "missing-parent";
    expect(codes(validateSceneDocument1_1(invalid1_1Semantics))).toContain(
      "ENTITY_PARENT_NOT_FOUND",
    );
    expect(codes(parseSceneDocument(JSON.stringify(invalid1_1Semantics)))).toContain(
      "ENTITY_PARENT_NOT_FOUND",
    );

    const invalid1_2Structure = legacyFixture("1.2.0");
    invalid1_2Structure.environment.background = "#ffffff";
    expect(validateSceneDocument1_2(invalid1_2Structure).ok).toBe(false);
    expect(parseSceneDocument(JSON.stringify(invalid1_2Structure)).ok).toBe(false);

    const invalid1_2Semantics = legacyFixture("1.2.0");
    const lighting = invalid1_2Semantics.environment.lighting as Record<string, unknown>;
    const key = lighting["key"] as Record<string, unknown>;
    key["directionToLight"] = [1, 1, 1];
    expect(codes(validateSceneDocument1_2(invalid1_2Semantics))).toContain(
      "LIGHTING_DIRECTION_NOT_UNIT",
    );
    expect(codes(parseSceneDocument(JSON.stringify(invalid1_2Semantics)))).toContain(
      "LIGHTING_DIRECTION_NOT_UNIT",
    );
  });

  it("continues validating the raw frozen 1.0 contract", () => {
    expect(validateSceneDocument1_0(legacyFixture("1.0.0")).ok).toBe(true);
  });
});

interface FixtureRecord extends Record<string, unknown> {
  schemaVersion: string;
  revision: number;
  entities: EntityRecord[];
  targets: EntityRecord[];
  environment: Record<string, unknown>;
}

type EntityRecord = Record<string, unknown> & {
  id?: string;
  type?: unknown;
  parentId?: unknown;
  transform?: Record<string, unknown>;
};

function currentFixture(): FixtureRecord {
  const fixture = rawFixture();
  fixture.schemaVersion = "1.3.0";
  return fixture;
}

function legacyFixture(version: "1.0.0" | "1.1.0" | "1.2.0"): FixtureRecord {
  const fixture = rawFixture();
  fixture.schemaVersion = version;
  if (version !== "1.2.0") delete fixture.environment["lighting"];
  if (version === "1.0.0") delete fixture.environment["backgroundMode"];
  return fixture;
}

function rawFixture(): FixtureRecord {
  return JSON.parse(readFileSync(fixtureUrl, "utf8")) as FixtureRecord;
}

function pointLight(
  id: string,
  transform: Partial<{ position: number[]; rotation: number[]; scale: number[] }> = {},
): EntityRecord {
  return {
    id,
    type: "light",
    parentId: null,
    name: `Point ${id}`,
    visible: true,
    locked: false,
    transform: {
      position: transform.position ?? [0, 2, 0],
      rotation: transform.rotation ?? [0, 0, 0, 1],
      scale: transform.scale ?? [1, 1, 1],
    },
    metadata: {},
    light: { kind: "point", color: "#FFFFFF", intensity: 25, range: null },
  };
}

function spotLight(
  id: string,
  transform: Partial<{ position: number[]; rotation: number[]; scale: number[] }> = {},
): EntityRecord {
  return {
    ...pointLight(id, transform),
    name: `Spot ${id}`,
    light: {
      kind: "spot",
      color: "#FFFFFF",
      intensity: 10,
      range: null,
      angleRadians: Math.PI / 4,
      penumbra: 1 / 3,
    },
  };
}

function light(entity: EntityRecord): Record<string, unknown> {
  return entity["light"] as Record<string, unknown>;
}

interface DiagnosticResult {
  readonly diagnostics: readonly { readonly code: string; readonly path: string }[];
}

function codes(result: DiagnosticResult): string[] {
  return result.diagnostics.map((diagnostic) => diagnostic.code);
}

function paths(result: DiagnosticResult): string[] {
  return result.diagnostics.map((diagnostic) => diagnostic.path);
}
