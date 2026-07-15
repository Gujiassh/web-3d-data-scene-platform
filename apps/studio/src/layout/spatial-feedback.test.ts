import { describe, expect, it } from "vitest";

import type { EntitySpatialSnapshot } from "@web3d/runtime";

import {
  activeAxis,
  positionDelta,
  selectionPivot,
  transformSpatialFeedback,
} from "./spatial-feedback";
import { matrixFromTransform } from "./spatial-math";
import { DISABLED_TRANSFORM_SETTINGS, type SpatialFeedback } from "./types";

describe("spatial feedback", () => {
  it("derives position delta and a single active axis without guessing multi-axis motion", () => {
    const before = {
      position: [1, 2, 3],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
    } as const;
    const after = { ...before, position: [1, 5, 3] as const };
    expect(positionDelta(before, after)).toEqual([0, 3, 0]);
    expect(activeAxis([0, 3, 0])).toBe("y");
    expect(activeAxis([1, 3, 0])).toBe("free");
    expect(activeAxis([0, 0, 0])).toBe("free");
  });

  it("reports nonzero translate, rotate, and scale preview deltas", () => {
    const before = {
      position: [0, 0, 0],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
    } as const;
    const base = feedback();

    const translated = transformSpatialFeedback(
      "translate",
      before,
      { ...before, position: [2, 0, 0] },
      base,
      DISABLED_TRANSFORM_SETTINGS,
      snapshot("source", 0),
    );
    expect(translated.deltaPosition).toEqual([2, 0, 0]);
    expect(translated.activeAxis).toBe("x");

    const rotated = transformSpatialFeedback(
      "rotate",
      before,
      {
        ...before,
        rotation: [0, 0, Math.sin(Math.PI / 4), Math.cos(Math.PI / 4)],
      },
      base,
      DISABLED_TRANSFORM_SETTINGS,
      snapshot("source", 0),
    );
    expect(rotated.deltaRotationRadians).toBeCloseTo(Math.PI / 2);
    expect(rotated.activeAxis).toBe("z");

    const scaled = transformSpatialFeedback(
      "scale",
      before,
      { ...before, scale: [1, 1.5, 1] },
      base,
      DISABLED_TRANSFORM_SETTINGS,
      snapshot("source", 0),
    );
    expect(scaled.deltaScale).toEqual([0, 0.5, 0]);
    expect(scaled.activeAxis).toBe("y");
  });

  it("uses combined bounds center for multi-selection and entity origin for one root", () => {
    const a = snapshot("a", 0);
    const b = snapshot("b", 4);
    expect(selectionPivot([b, a], "b")).toEqual({
      pivotKind: "selection-bounds-center",
      pivotWorld: [2, 0, 0],
    });
    expect(selectionPivot([b], "b")).toEqual({
      pivotKind: "entity-origin",
      pivotWorld: [4, 0, 0],
    });
  });

  it("reports world translation axis and current moving pivot under a rotated scaled parent", () => {
    const before = {
      position: [0, 0, 0],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
    } as const;
    const after = { ...before, position: [1, 0, 0] as const };
    const parent = matrixFromTransform({
      position: [0, 0, 0],
      rotation: [0, 0, Math.sin(Math.PI / 4), Math.cos(Math.PI / 4)],
      scale: [2, 1, 1],
    });
    const source = {
      ...snapshot("source", 0),
      worldMatrix: parent.toArray() as unknown as EntitySpatialSnapshot["worldMatrix"],
      localTransform: before,
    };

    const result = transformSpatialFeedback(
      "translate",
      before,
      after,
      feedback(),
      DISABLED_TRANSFORM_SETTINGS,
      source,
    );
    expect(result.deltaPosition![0]).toBeCloseTo(0);
    expect(result.deltaPosition![1]).toBeCloseTo(2);
    expect(result.activeAxis).toBe("y");
    expect(result.pivotWorld?.[0]).toBeCloseTo(0);
    expect(result.pivotWorld?.[1]).toBeCloseTo(2);

    const rotated = transformSpatialFeedback(
      "rotate",
      before,
      {
        ...before,
        rotation: [Math.sin(Math.PI / 4), 0, 0, Math.cos(Math.PI / 4)],
      },
      feedback(),
      DISABLED_TRANSFORM_SETTINGS,
      source,
    );
    expect(rotated.deltaRotationRadians).toBeCloseTo(Math.PI / 2);
    expect(rotated.activeAxis).toBe("y");

    const scaled = transformSpatialFeedback(
      "scale",
      before,
      { ...before, scale: [1.5, 1, 1] },
      feedback(),
      DISABLED_TRANSFORM_SETTINGS,
      source,
    );
    expect(scaled.deltaScale).toEqual([0.5, 0, 0]);
    expect(scaled.activeAxis).toBe("x");
  });
});

function feedback(): SpatialFeedback {
  return {
    activity: "idle",
    pivotKind: "entity-origin",
    pivotWorld: [0, 0, 0],
    activeAxis: "free",
    deltaPosition: null,
    deltaRotationRadians: null,
    deltaScale: null,
    settings: DISABLED_TRANSFORM_SETTINGS,
    sourceAnchor: null,
    targetAnchor: null,
  };
}

function snapshot(entityId: string, x: number): EntitySpatialSnapshot {
  return {
    documentId: "scene",
    documentRevision: 1,
    entityId,
    parentId: null,
    localTransform: {
      position: [x, 0, 0],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
    },
    worldMatrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, 0, 0, 1],
    worldBounds: { min: [x - 1, -1, -1], max: [x + 1, 1, 1] },
    worldPivot: [x, 0, 0],
    visible: true,
    locked: false,
  };
}
