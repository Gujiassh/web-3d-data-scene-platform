import type { LightEntity, SceneDocument, SceneEntity } from "@web3d/document";
import { describe, expect, it } from "vitest";

import { classifyLightOnlySourceUpdate } from "./light-only-source-update";

describe("classifyLightOnlySourceUpdate", () => {
  it("accepts exact light add, update, and remove changes", () => {
    const group = groupEntity("group-a");
    const point = pointLight("point-a", 25);
    const current = scene([group, point], 4);

    const added = pointLight("point-b", 10);
    expect(
      classifyLightOnlySourceUpdate(current, {
        ...current,
        revision: 5,
        entities: [group, point, added],
      }),
    ).toEqual({ lights: [point, added] });

    const updated = pointLight("point-a", 50);
    expect(
      classifyLightOnlySourceUpdate(current, {
        ...current,
        revision: 5,
        entities: [group, updated],
      }),
    ).toEqual({ lights: [updated] });

    expect(
      classifyLightOnlySourceUpdate(current, {
        ...current,
        revision: 5,
        entities: [group],
      }),
    ).toEqual({ lights: [] });
  });

  it("rejects revision-only, project-switch, non-light, and top-level changes", () => {
    const group = groupEntity("group-a");
    const point = pointLight("point-a", 25);
    const current = scene([group, point], 4);

    expect(classifyLightOnlySourceUpdate(current, { ...current, revision: 5 })).toBeNull();
    expect(
      classifyLightOnlySourceUpdate(current, {
        ...current,
        id: "other-document",
        revision: 1,
      }),
    ).toBeNull();
    expect(
      classifyLightOnlySourceUpdate(current, {
        ...current,
        revision: 5,
        entities: [{ ...group, name: "Changed group" }, point],
      }),
    ).toBeNull();
    expect(
      classifyLightOnlySourceUpdate(current, {
        ...current,
        revision: 5,
        environment: { ...current.environment, grid: !current.environment.grid },
      }),
    ).toBeNull();
  });

  it("rejects any reordering of retained entities, including lights", () => {
    const group = groupEntity("group-a");
    const pointA = pointLight("point-a", 25);
    const pointB = pointLight("point-b", 10);
    const current = scene([group, pointA, pointB], 4);

    expect(
      classifyLightOnlySourceUpdate(current, {
        ...current,
        revision: 5,
        entities: [group, pointB, pointA],
      }),
    ).toBeNull();
  });
});

function scene(entities: readonly SceneEntity[], revision: number): SceneDocument {
  return {
    schemaVersion: "1.3.0",
    id: "light-document",
    name: "Light document",
    revision,
    assets: [],
    entities,
    targets: [],
    dataSources: [],
    bindings: [],
    ruleSets: [],
    annotations: [],
    views: [],
    environment: {
      backgroundMode: "theme",
      background: "#F4F6F5",
      grid: true,
      unit: "m",
      upAxis: "Y",
      lighting: {
        fill: { skyColor: "#DDE7EA", groundColor: "#58636B", intensity: 1.1 },
        key: { color: "#FFFFFF", intensity: 2.4, directionToLight: [4, 7, 5] },
      },
    },
  };
}

function groupEntity(id: string): SceneEntity {
  return {
    id,
    type: "group",
    parentId: null,
    name: id,
    visible: true,
    locked: false,
    transform: identityTransform(),
    metadata: {},
  };
}

function pointLight(id: string, intensity: number): LightEntity {
  return {
    id,
    type: "light",
    parentId: null,
    name: id,
    visible: true,
    locked: false,
    transform: identityTransform(),
    metadata: {},
    light: { kind: "point", color: "#FFFFFF", intensity, range: null },
  };
}

function identityTransform() {
  return {
    position: [0, 2, 0] as const,
    rotation: [0, 0, 0, 1] as const,
    scale: [1, 1, 1] as const,
  };
}
