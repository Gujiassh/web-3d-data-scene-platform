import { Matrix4, Vector3 } from "three";
import { describe, expect, it } from "vitest";

import {
  HotspotSurfaceIndexCandidate,
  type CalibrationSurfaceAnchor,
} from "./hotspot-surface-index-candidate";

describe("HotspotSurfaceIndexCandidate", () => {
  const matrix = new Matrix4().makeTranslation(4, 5, 6);
  const index = new HotspotSurfaceIndexCandidate([
    {
      entityId: "entity-a",
      assetHash: "hash-a",
      nodes: new Map([[7, matrix]]),
    },
  ]);

  it("resolves an exact entity, asset hash and node into world frames", () => {
    const position = new Vector3();
    const normal = new Vector3();

    expect(index.resolve(anchor(), position, normal)).toBe(true);
    expect(position.toArray()).toEqual([5, 7, 9]);
    expect(normal.toArray()).toEqual([0, 0, 1]);
  });

  it.each([
    ["entity", { entityId: "wrong-entity" }],
    ["asset hash", { assetHash: "wrong-hash" }],
    ["node", { nodeIndex: 8 }],
  ] as const)("rejects a mismatched %s without changing output vectors", (_, change) => {
    const position = new Vector3(10, 11, 12);
    const normal = new Vector3(1, 0, 0);

    expect(index.resolve({ ...anchor(), ...change }, position, normal)).toBe(false);
    expect(position.toArray()).toEqual([10, 11, 12]);
    expect(normal.toArray()).toEqual([1, 0, 0]);
  });

  it("rejects duplicate entity IDs", () => {
    expect(
      () =>
        new HotspotSurfaceIndexCandidate([
          { entityId: "duplicate", assetHash: "hash-a", nodes: new Map() },
          { entityId: "duplicate", assetHash: "hash-b", nodes: new Map() },
        ]),
    ).toThrow("Duplicate calibration entity duplicate.");
  });
});

function anchor(): CalibrationSurfaceAnchor {
  return {
    id: "hotspot-a",
    entityId: "entity-a",
    assetHash: "hash-a",
    nodeIndex: 7,
    nodeLocalPosition: new Vector3(1, 2, 3),
    nodeLocalNormal: new Vector3(0, 0, 1),
  };
}
