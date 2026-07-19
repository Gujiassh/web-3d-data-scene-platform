import {
  BatchedMesh,
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  SkinnedMesh,
  Vector3,
  type Object3D,
} from "three";
import { describe, expect, it } from "vitest";

import {
  HotspotSurfaceIndex,
  type HotspotSurfaceAnchorReference,
  type HotspotSurfaceEntityRegistration,
  type UnsupportedHotspotSurfaceReason,
} from "./surface-index";

describe("HotspotSurfaceIndex", () => {
  it("resolves only the exact entity, asset hash and formal glTF node", () => {
    const mesh = new Mesh();
    mesh.position.set(4, 5, 6);
    const index = createIndex(mesh);
    const worldPosition = new Vector3();
    const worldNormal = new Vector3();

    expect(index.resolveAnchor(anchor(), worldPosition, worldNormal)).toMatchObject({
      ok: true,
      identity: { entityId: "entity-a", assetHash: "hash-a", nodeIndex: 7 },
      node: mesh,
    });
    expect(worldPosition.toArray()).toEqual([5, 7, 9]);
    expect(worldNormal.toArray()).toEqual([0, 0, 1]);

    for (const [change, reason] of [
      [{ entityId: "wrong-entity" }, "entity-not-registered"],
      [{ assetHash: "wrong-hash" }, "asset-hash-mismatch"],
      [{ nodeIndex: 8 }, "node-not-registered"],
    ] as const) {
      worldPosition.set(10, 11, 12);
      worldNormal.set(1, 0, 0);
      expect(index.resolveAnchor({ ...anchor(), ...change }, worldPosition, worldNormal)).toEqual({
        ok: false,
        reason,
      });
      expect(worldPosition.toArray()).toEqual([10, 11, 12]);
      expect(worldNormal.toArray()).toEqual([1, 0, 0]);
    }
  });

  it("uses explicit descendant evidence without parent, name or traversal inference", () => {
    const node = new Group();
    const registeredDescendant = new Mesh();
    const informalDescendant = new Mesh();
    registeredDescendant.name = "shared-name";
    informalDescendant.name = "shared-name";
    node.add(registeredDescendant, informalDescendant);
    const index = new HotspotSurfaceIndex([
      registration(node, new Map([[registeredDescendant, 7]])),
    ]);

    expect(index.lookupHitObject(registeredDescendant)).toMatchObject({
      ok: true,
      identity: { entityId: "entity-a", assetHash: "hash-a", nodeIndex: 7 },
      node,
      surface: registeredDescendant,
    });
    expect(index.lookupHitObject(informalDescendant)).toEqual({
      ok: false,
      reason: "object-not-registered",
    });
    expect(index.lookupHitObject(node)).toEqual({
      ok: false,
      reason: "object-not-registered",
    });
  });

  it.each(unsupportedSurfaces())(
    "rejects explicitly associated $reason surfaces",
    ({ object, reason }) => {
      const index = createIndex(object);

      expect(index.lookupHitObject(object)).toEqual({
        ok: false,
        reason: "unsupported-surface",
        unsupportedReason: reason,
      });
      expect(index.resolveAnchor(anchor(), new Vector3(), new Vector3())).toEqual({
        ok: false,
        reason: "unsupported-surface",
      });
    },
  );

  it("does not infer a surface from a formally indexed node", () => {
    const node = new Mesh();
    const index = new HotspotSurfaceIndex([registration(node, new Map())]);

    expect(index.resolveAnchor(anchor(), new Vector3(), new Vector3())).toEqual({
      ok: false,
      reason: "surface-not-registered",
    });
  });

  it("rejects non-invertible transforms without changing output vectors", () => {
    const mesh = new Mesh();
    mesh.scale.set(1, 0, 1);
    const index = createIndex(mesh);
    const worldPosition = new Vector3(8, 9, 10);
    const worldNormal = new Vector3(0, 1, 0);

    expect(index.resolveAnchor(anchor(), worldPosition, worldNormal)).toEqual({
      ok: false,
      reason: "non-invertible-transform",
    });
    expect(worldPosition.toArray()).toEqual([8, 9, 10]);
    expect(worldNormal.toArray()).toEqual([0, 1, 0]);
  });

  it("uses the normal matrix for non-uniform rigid-node scale", () => {
    const mesh = new Mesh();
    mesh.scale.set(2, 3, 4);
    const index = createIndex(mesh);
    const worldPosition = new Vector3();
    const worldNormal = new Vector3();
    const localComponent = 1 / Math.sqrt(2);

    const result = index.resolveAnchor(
      anchor({
        nodeLocalPosition: [1, 2, 3],
        nodeLocalNormal: [localComponent, localComponent, 0],
      }),
      worldPosition,
      worldNormal,
    );

    expect(result.ok).toBe(true);
    expect(worldPosition.toArray()).toEqual([2, 6, 12]);
    expect(worldNormal.x).toBeCloseTo(3 / Math.sqrt(13), 12);
    expect(worldNormal.y).toBeCloseTo(2 / Math.sqrt(13), 12);
    expect(worldNormal.z).toBeCloseTo(0, 12);
    expect(worldNormal.length()).toBeCloseTo(1, 12);
  });

  it("rejects duplicate entity/object evidence and unknown node associations", () => {
    const first = new Mesh();
    const second = new Mesh();

    expect(
      () =>
        new HotspotSurfaceIndex([
          registration(first),
          { ...registration(second), assetHash: "hash-b" },
        ]),
    ).toThrow("Duplicate hotspot surface entity entity-a.");

    expect(
      () =>
        new HotspotSurfaceIndex([
          registration(first),
          {
            entityId: "entity-b",
            assetHash: "hash-b",
            nodesByIndex: new Map([[9, second]]),
            nodeIndexByHitObject: new Map([[first, 9]]),
          },
        ]),
    ).toThrow("A hotspot hit object cannot be registered more than once.");

    expect(() => new HotspotSurfaceIndex([registration(first, new Map([[first, 8]]))])).toThrow(
      "unknown glTF node 8",
    );
  });
});

function createIndex(object: Object3D): HotspotSurfaceIndex {
  return new HotspotSurfaceIndex([registration(object)]);
}

function registration(
  node: Object3D,
  nodeIndexByHitObject: ReadonlyMap<Object3D, number> = new Map([[node, 7]]),
): HotspotSurfaceEntityRegistration {
  return {
    entityId: "entity-a",
    assetHash: "hash-a",
    nodesByIndex: new Map([[7, node]]),
    nodeIndexByHitObject,
  };
}

function anchor(
  overrides: Partial<HotspotSurfaceAnchorReference> = {},
): HotspotSurfaceAnchorReference {
  return {
    kind: "surface",
    entityId: "entity-a",
    assetHash: "hash-a",
    nodeIndex: 7,
    nodeLocalPosition: [1, 2, 3],
    nodeLocalNormal: [0, 0, 1],
    ...overrides,
  };
}

function unsupportedSurfaces(): readonly {
  readonly object: Object3D;
  readonly reason: UnsupportedHotspotSurfaceReason;
}[] {
  const morphGeometry = new BufferGeometry();
  morphGeometry.morphAttributes.position = [
    new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3),
  ];
  const material = new MeshBasicMaterial();
  return [
    { object: new Group(), reason: "not-mesh" },
    { object: new SkinnedMesh(new BufferGeometry(), material), reason: "skinned-mesh" },
    { object: new Mesh(morphGeometry, material), reason: "morph-target-mesh" },
    { object: new InstancedMesh(new BufferGeometry(), material, 1), reason: "instanced-mesh" },
    { object: new BatchedMesh(1, 3, 3, material), reason: "batched-mesh" },
  ];
}
