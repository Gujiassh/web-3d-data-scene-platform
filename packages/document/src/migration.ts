import type { SceneLighting } from "./types.js";

export const STANDARD_SCENE_LIGHTING: SceneLighting = Object.freeze({
  fill: Object.freeze({
    skyColor: "#FFFFFF",
    groundColor: "#65706A",
    intensity: 1.8,
  }),
  key: Object.freeze({
    color: "#FFFFFF",
    intensity: 2.2,
    directionToLight: Object.freeze([
      0.37904902178945177, 0.7580980435789035, 0.5306686305052324,
    ] as const),
  }),
});

export function migrateSceneDocument1_0(value: unknown): unknown {
  const document = requireRecord(value, "Legacy SceneDocument");
  const environment = requireRecord(document["environment"], "Legacy scene environment");
  return {
    ...document,
    schemaVersion: "1.1.0",
    environment: {
      ...environment,
      backgroundMode: "custom",
    },
  };
}

export function migrateSceneDocument1_1(value: unknown): unknown {
  const document = requireRecord(value, "Legacy SceneDocument");
  const environment = requireRecord(document["environment"], "Legacy scene environment");
  return {
    ...document,
    schemaVersion: "1.2.0",
    environment: {
      ...environment,
      background: canonicalLegacyColor(environment["background"], "Legacy scene background"),
      lighting: cloneStandardLighting(),
    },
  };
}

export function migrateSceneDocument1_2(value: unknown): unknown {
  const document = requireRecord(value, "Legacy SceneDocument");
  return { ...document, schemaVersion: "1.3.0" };
}

export function migrateSceneDocument1_3(value: unknown): unknown {
  const document = requireRecord(value, "Legacy SceneDocument");
  const annotations = requireArray(document["annotations"], "Legacy SceneDocument annotations");
  return {
    ...document,
    schemaVersion: "1.4.0",
    annotations: annotations.map((value, index) => {
      const annotation = requireRecord(value, `Legacy annotation ${index}`);
      return {
        id: annotation["id"],
        title: annotation["title"],
        visible: true,
        locked: false,
        anchor: {
          kind: "legacy",
          targetId: annotation["targetId"],
          localOffset: annotation["localOffset"],
        },
        content: {
          kind: "host-content",
          key: annotation["contentKey"],
        },
        action: { type: "show-content" },
      };
    }),
  };
}

function cloneStandardLighting(): SceneLighting {
  return {
    fill: { ...STANDARD_SCENE_LIGHTING.fill },
    key: {
      ...STANDARD_SCENE_LIGHTING.key,
      directionToLight: [...STANDARD_SCENE_LIGHTING.key.directionToLight],
    },
  };
}

function canonicalLegacyColor(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^#[A-Fa-f0-9]{6}$/u.test(value)) {
    throw new TypeError(`${label} must be a six-digit hex color.`);
  }
  return value.toUpperCase();
}

function requireRecord(value: unknown, label: string): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object.`);
  }
  return value as Readonly<Record<string, unknown>>;
}

function requireArray(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array.`);
  return value;
}
