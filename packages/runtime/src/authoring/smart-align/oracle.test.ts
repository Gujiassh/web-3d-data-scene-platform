import { describe, expect, it } from "vitest";

import type { EntitySpatialSnapshot, EntityWorldBounds } from "../../types";
import {
  activeSmartAlignAxes,
  buildSmartAlignReferenceIndex,
  findSmartAlignCandidate,
  smartAlignThreshold,
  snapWorldPositionToStep,
  type SmartAlignAnchor,
  type SmartAlignReferenceIndex,
} from "./oracle";

const RELATION_ORDER = [
  ["center", "center"],
  ["min", "min"],
  ["max", "max"],
  ["center", "min"],
  ["center", "max"],
  ["min", "center"],
  ["max", "center"],
  ["min", "max"],
  ["max", "min"],
] as const satisfies readonly (readonly [SmartAlignAnchor, SmartAlignAnchor])[];

describe("smart-align oracle", () => {
  it("uses relation order, hierarchy depth and stable ids deterministically", () => {
    const snapshots = [
      snapshot("moving", null, bounds(9, 11)),
      snapshot("z-parent", null, bounds(9, 11)),
      snapshot("b-child", "z-parent", bounds(9, 11)),
      snapshot("a-child", "z-parent", bounds(9, 11)),
    ];
    const index = buildSmartAlignReferenceIndex(snapshots, "moving", ["moving"]);

    expect(findSmartAlignCandidate(index, bounds(9, 11), "x", 1)).toMatchObject({
      movingAnchor: "center",
      referenceAnchor: "center",
      referenceEntityId: "a-child",
      relationRank: 0,
      delta: 0,
    });
  });

  it.each(
    RELATION_ORDER.map(([movingAnchor, referenceAnchor], relationRank) => ({
      movingAnchor,
      referenceAnchor,
      relationRank,
    })),
  )(
    "maps $movingAnchor-$referenceAnchor to relation rank $relationRank",
    ({ movingAnchor, referenceAnchor, relationRank }) => {
      const index = syntheticReferenceIndex([
        {
          movingAnchor,
          referenceAnchor,
          entityId: "reference",
          hierarchyDepth: 4,
        },
      ]);

      expect(findSmartAlignCandidate(index, relationTestBounds(), "x", 1)).toMatchObject({
        movingAnchor,
        referenceAnchor,
        referenceEntityId: "reference",
        relationRank,
        delta: 1,
      });
    },
  );

  it.each(
    RELATION_ORDER.slice(0, -1).map((earlier, relationRank) => ({
      earlier,
      later: RELATION_ORDER[relationRank + 1]!,
      relationRank,
    })),
  )(
    "ranks relation $relationRank ahead of the adjacent relation at equal absolute delta",
    ({ earlier, later, relationRank }) => {
      const index = syntheticReferenceIndex([
        {
          movingAnchor: earlier[0],
          referenceAnchor: earlier[1],
          entityId: "z-earlier-relation",
          hierarchyDepth: 4,
        },
        {
          movingAnchor: later[0],
          referenceAnchor: later[1],
          entityId: "a-later-relation",
          hierarchyDepth: 4,
        },
      ]);

      expect(findSmartAlignCandidate(index, relationTestBounds(), "x", 1)).toMatchObject({
        movingAnchor: earlier[0],
        referenceAnchor: earlier[1],
        referenceEntityId: "z-earlier-relation",
        relationRank,
        delta: 1,
      });
    },
  );

  it("prefers an entity over origin at the same delta and is independent of input order", () => {
    const values = [
      snapshot("moving", null, bounds(-1, 1)),
      snapshot("reference", null, bounds(-2, 0)),
    ];
    for (const snapshots of [values, values.toReversed()]) {
      const index = buildSmartAlignReferenceIndex(snapshots, "moving", ["moving"]);
      expect(findSmartAlignCandidate(index, bounds(-1, 1), "x", 0)).toMatchObject({
        movingAnchor: "center",
        referenceEntityId: "reference",
        referenceAnchor: "max",
      });
    }
  });

  it("excludes moving hierarchy and every other selected subtree but keeps locked references", () => {
    const snapshots = [
      snapshot("ancestor", null, bounds(0, 2)),
      snapshot("moving", "ancestor", bounds(4, 6)),
      snapshot("moving-child", "moving", bounds(5, 7)),
      snapshot("selected", null, bounds(4, 6)),
      snapshot("selected-child", "selected", bounds(4, 6)),
      snapshot("locked-reference", null, bounds(4, 6), { locked: true }),
      snapshot("hidden-reference", null, bounds(4, 6), { visible: false }),
      snapshot("empty-reference", null, null),
    ];
    const index = buildSmartAlignReferenceIndex(snapshots, "moving", ["moving", "selected"]);

    expect(new Set(index.x.map((anchor) => anchor.entityId))).toEqual(
      new Set(["locked-reference"]),
    );
  });

  it("applies the exact threshold boundary and rejects invalid camera inputs", () => {
    const threshold = smartAlignThreshold(10, 45, 800);
    expect(threshold).not.toBeNull();
    expect(threshold).toBeCloseTo((16 * 10 * Math.tan(Math.PI / 8)) / 800, 12);
    expect(smartAlignThreshold(0, 45, 800)).toBeNull();
    expect(smartAlignThreshold(-1, 45, 800)).toBeNull();
    expect(smartAlignThreshold(10, 45, 0)).toBeNull();

    const exact = threshold!;
    const index = buildSmartAlignReferenceIndex(
      [
        snapshot("moving", null, bounds(10, 12)),
        snapshot("reference", null, bounds(12 + exact, 14 + exact)),
      ],
      "moving",
      ["moving"],
    );
    expect(findSmartAlignCandidate(index, bounds(10, 12), "x", exact)).not.toBeNull();
    expect(findSmartAlignCandidate(index, bounds(10, 12), "x", exact - 1e-9)).toBeNull();
  });

  it("maps axis, plane and free handles without enabling unrelated axes", () => {
    expect(activeSmartAlignAxes("X")).toEqual(["x"]);
    expect(activeSmartAlignAxes("YZ")).toEqual(["y", "z"]);
    expect(activeSmartAlignAxes("XYZ")).toEqual(["x", "y", "z"]);
    expect(activeSmartAlignAxes(null)).toEqual([]);
  });

  it("matches Three world-grid rounding for active axes including negative ties", () => {
    expect(snapWorldPositionToStep([-0.75, 1.26, 2.49], ["x", "z"], 0.5)).toEqual([
      -0.5, 1.26, 2.5,
    ]);
    expect(snapWorldPositionToStep([1.1, 2.2, 3.3], [], 0.5)).toEqual([1.1, 2.2, 3.3]);
    expect(() => snapWorldPositionToStep([0, 0, 0], ["x"], 0)).toThrow();
  });
});

interface SyntheticReference {
  readonly movingAnchor: SmartAlignAnchor;
  readonly referenceAnchor: SmartAlignAnchor;
  readonly entityId: string;
  readonly hierarchyDepth: number;
}

function syntheticReferenceIndex(
  references: readonly SyntheticReference[],
): SmartAlignReferenceIndex {
  const x = references
    .map((reference) => {
      const coordinate = relationAnchorCoordinate(reference.movingAnchor) + 1;
      return {
        anchor: reference.referenceAnchor,
        coordinate,
        entityId: reference.entityId,
        hierarchyDepth: reference.hierarchyDepth,
        referencePoint: [coordinate, 0, 0] as const,
      };
    })
    .toSorted((left, right) => left.coordinate - right.coordinate);
  return { x, y: [], z: [] } as unknown as SmartAlignReferenceIndex;
}

function relationTestBounds(): EntityWorldBounds {
  return { min: [100, -1, -1], max: [300, 1, 1] };
}

function relationAnchorCoordinate(anchor: SmartAlignAnchor): number {
  if (anchor === "min") return 100;
  if (anchor === "max") return 300;
  return 200;
}

function bounds(minimumX: number, maximumX: number): EntityWorldBounds {
  return { min: [minimumX, -1, -1], max: [maximumX, 1, 1] };
}

function snapshot(
  entityId: string,
  parentId: string | null,
  worldBounds: EntityWorldBounds | null,
  patch: Partial<Pick<EntitySpatialSnapshot, "visible" | "locked">> = {},
): EntitySpatialSnapshot {
  return {
    documentId: "scene",
    documentRevision: 1,
    entityId,
    parentId,
    localTransform: { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
    worldMatrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    worldBounds,
    worldPivot: [0, 0, 0],
    visible: patch.visible ?? true,
    locked: patch.locked ?? false,
  };
}
