import { describe, expect, it } from "vitest";

import type { LightEntity, SceneDocument } from "@web3d/document";

import {
  buildAddLightCommand,
  buildDuplicateLightCommand,
  countAuthoredLights,
  lightSupportsTool,
} from "./model";

describe("Studio light authoring model", () => {
  it("projects calibrated point and spot snapshots from the exact Runtime frame", () => {
    const document = scene();
    const frame = { position: [0, 2, 0], target: [0, 0, 0] } as const;

    const point = buildAddLightCommand(document, "point", frame, "light-point").after;
    const spot = buildAddLightCommand(
      { ...document, entities: [point] },
      "spot",
      frame,
      "light-spot",
    ).after;

    expect(point).toMatchObject({
      name: "Point light 1",
      parentId: null,
      transform: { position: [0, 2, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
      light: { kind: "point", color: "#FFFFFF", intensity: 25, range: null },
    });
    expect(spot).toMatchObject({
      name: "Spot light 1",
      transform: { position: [0, 2, 0], scale: [1, 1, 1] },
      light: {
        kind: "spot",
        color: "#FFFFFF",
        intensity: 10,
        range: null,
        angleRadians: Math.PI / 4,
        penumbra: 1 / 3,
      },
    });
    expect(spot.transform.rotation[0]).toBeCloseTo(-Math.SQRT1_2, 14);
    expect(spot.transform.rotation.slice(1, 3)).toEqual([0, 0]);
    expect(spot.transform.rotation[3]).toBeCloseTo(Math.SQRT1_2, 14);
  });

  it("uses the lowest available suffix and duplicates through one unlocked add snapshot", () => {
    const source = point("source", "Point light 1", true);
    const document = scene([source, point("other", "Point light 3", false)]);
    const command = buildDuplicateLightCommand(document, source, "copy");

    expect(command.type).toBe("add-light-entity");
    expect(command.after).toMatchObject({
      id: "copy",
      name: "Point light 2",
      locked: false,
      transform: { position: [1, 2, 3], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
    });
    expect(source.locked).toBe(true);
    expect(countAuthoredLights(document)).toBe(2);
  });

  it("allows only the approved tools for each light kind", () => {
    const pointLight = point("point", "Point light 1", false);
    const spotLight = buildAddLightCommand(
      scene(),
      "spot",
      { position: [0, 2, 0], target: [0, 0, 0] },
      "spot",
    ).after;

    expect(
      ["select", "translate", "rotate", "scale"].map((tool) =>
        lightSupportsTool(pointLight, tool as "select" | "translate" | "rotate" | "scale"),
      ),
    ).toEqual([true, true, false, false]);
    expect(
      ["select", "translate", "rotate", "scale"].map((tool) =>
        lightSupportsTool(spotLight, tool as "select" | "translate" | "rotate" | "scale"),
      ),
    ).toEqual([true, true, true, false]);
  });
});

function scene(entities: readonly LightEntity[] = []): SceneDocument {
  return {
    schemaVersion: "1.3.0",
    id: "scene-a",
    name: "Scene A",
    revision: 0,
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
        fill: { skyColor: "#FFFFFF", groundColor: "#65706A", intensity: 1.8 },
        key: { color: "#FFFFFF", intensity: 2.2, directionToLight: [0, 1, 0] },
      },
    },
  };
}

function point(id: string, name: string, locked: boolean): LightEntity {
  return {
    id,
    type: "light",
    parentId: null,
    name,
    visible: true,
    locked,
    transform: { position: [0, 2, 3], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
    metadata: {},
    light: { kind: "point", color: "#FFFFFF", intensity: 25, range: null },
  };
}
