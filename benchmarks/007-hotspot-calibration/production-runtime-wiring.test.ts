import { BoxGeometry, Group, Mesh, MeshBasicMaterial, Vector3 } from "three";
import { describe, expect, it } from "vitest";

import {
  HotspotSurfaceIndex,
  type HotspotSurfaceAnchorReference,
} from "../../packages/runtime/src/hotspots/surface-index";

describe("007 production Runtime surface wiring", () => {
  const root = new Group();
  root.position.set(4, 5, 6);
  const surface = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial());
  root.add(surface);
  const index = new HotspotSurfaceIndex([
    {
      entityId: "entity-a",
      assetHash: "hash-a",
      nodesByIndex: new Map([[7, root]]),
      nodeIndexByHitObject: new Map([[surface, 7]]),
    },
  ]);

  it("resolves the benchmark fixture through the production world-frame API", () => {
    const position = new Vector3();
    const normal = new Vector3();

    expect(index.resolveAnchor(anchor(), position, normal).ok).toBe(true);
    expect(position.toArray()).toEqual([5, 7, 9]);
    expect(normal.toArray()).toEqual([0, 0, 1]);
  });

  it.each([
    ["entity", { entityId: "wrong-entity" }, "entity-not-registered"],
    ["asset hash", { assetHash: "wrong-hash" }, "asset-hash-mismatch"],
    ["node", { nodeIndex: 8 }, "node-not-registered"],
  ] as const)("rejects a mismatched %s with the production reason", (_, change, reason) => {
    const position = new Vector3(10, 11, 12);
    const normal = new Vector3(1, 0, 0);

    expect(index.resolveAnchor({ ...anchor(), ...change }, position, normal)).toEqual({
      ok: false,
      reason,
    });
    expect(position.toArray()).toEqual([10, 11, 12]);
    expect(normal.toArray()).toEqual([1, 0, 0]);
  });

  it("rejects duplicate production entity registrations", () => {
    expect(
      () =>
        new HotspotSurfaceIndex([
          registration("duplicate", "hash-a"),
          registration("duplicate", "hash-b"),
        ]),
    ).toThrow("Duplicate hotspot surface entity duplicate.");
  });
});

function anchor(): HotspotSurfaceAnchorReference {
  return {
    kind: "surface",
    entityId: "entity-a",
    assetHash: "hash-a",
    nodeIndex: 7,
    nodeLocalPosition: [1, 2, 3],
    nodeLocalNormal: [0, 0, 1],
  };
}

function registration(entityId: string, assetHash: string) {
  const node = new Group();
  const surface = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial());
  node.add(surface);
  return {
    entityId,
    assetHash,
    nodesByIndex: new Map([[0, node]]),
    nodeIndexByHitObject: new Map([[surface, 0]]),
  };
}
