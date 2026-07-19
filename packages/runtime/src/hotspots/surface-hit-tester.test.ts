import { Group, Mesh, Vector3, type Object3D } from "three";
import { describe, expect, it } from "vitest";

import { HotspotSurfaceHitTester } from "./surface-hit-tester";
import { HotspotSurfaceIndex } from "./surface-index";

describe("HotspotSurfaceHitTester", () => {
  it("builds exact world and node-local evidence for a formally registered descendant", () => {
    const node = new Group();
    node.position.set(10, 0, 0);
    node.scale.set(2, 1, 1);
    const surface = new Mesh();
    surface.rotation.z = Math.PI / 2;
    node.add(surface);
    node.updateMatrixWorld(true);
    const tester = createTester(node, surface);
    const localNormal = new Vector3(1, 1, 0).normalize();
    const hitPoint = new Vector3(1, 2, 3).applyMatrix4(node.matrixWorld);

    const result = tester.test(
      { object: surface, point: hitPoint, face: { normal: localNormal } },
      { documentId: "document-a", revision: 12 },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.evidence).toMatchObject({
      documentId: "document-a",
      revision: 12,
      entityId: "entity-a",
      assetHash: "hash-a",
      nodeIndex: 7,
      worldPosition: [12, 2, 3],
      nodeLocalPosition: [1, 2, 3],
    });
    expect(result.evidence.worldNormal[0]).toBeCloseTo(-1 / Math.sqrt(5), 12);
    expect(result.evidence.worldNormal[1]).toBeCloseTo(2 / Math.sqrt(5), 12);
    expect(result.evidence.worldNormal[2]).toBeCloseTo(0, 12);
    expect(result.evidence.nodeLocalNormal[0]).toBeCloseTo(-1 / Math.sqrt(2), 12);
    expect(result.evidence.nodeLocalNormal[1]).toBeCloseTo(1 / Math.sqrt(2), 12);
    expect(result.evidence.nodeLocalNormal[2]).toBeCloseTo(0, 12);
    expect(Math.hypot(...result.evidence.worldNormal)).toBeCloseTo(1, 12);
    expect(Math.hypot(...result.evidence.nodeLocalNormal)).toBeCloseTo(1, 12);
    expect(Object.isFrozen(result.evidence)).toBe(true);
    expect(Object.isFrozen(result.evidence.nodeLocalPosition)).toBe(true);
  });

  it("rejects an informal descendant instead of walking to registered ancestors", () => {
    const node = new Group();
    const registered = new Mesh();
    const informal = new Mesh();
    node.add(registered, informal);
    const tester = createTester(node, registered);

    expect(tester.test(hit(informal), authority())).toEqual({
      ok: false,
      reason: "object-not-registered",
    });
  });

  it("rejects missing and invalid face normals", () => {
    const mesh = new Mesh();
    const tester = createTester(mesh, mesh);

    expect(tester.test({ object: mesh, point: new Vector3() }, authority())).toEqual({
      ok: false,
      reason: "face-normal-missing",
    });
    expect(
      tester.test(
        { object: mesh, point: new Vector3(), face: { normal: new Vector3() } },
        authority(),
      ),
    ).toEqual({ ok: false, reason: "invalid-frame" });
  });

  it("rejects non-invertible hit-object and node transforms", () => {
    const node = new Group();
    const surface = new Mesh();
    node.add(surface);
    const tester = createTester(node, surface);

    surface.scale.set(0, 1, 1);
    expect(tester.test(hit(surface), authority())).toEqual({
      ok: false,
      reason: "non-invertible-transform",
    });

    surface.scale.set(1, 1, 1);
    node.scale.set(1, 0, 1);
    expect(tester.test(hit(surface), authority())).toEqual({
      ok: false,
      reason: "non-invertible-transform",
    });
  });

  it("rejects non-finite hit frames", () => {
    const mesh = new Mesh();
    const tester = createTester(mesh, mesh);

    expect(
      tester.test(
        {
          object: mesh,
          point: new Vector3(Number.NaN, 0, 0),
          face: { normal: new Vector3(0, 1, 0) },
        },
        authority(),
      ),
    ).toEqual({ ok: false, reason: "invalid-frame" });
  });
});

function createTester(node: Object3D, surface: Object3D): HotspotSurfaceHitTester {
  return new HotspotSurfaceHitTester(
    new HotspotSurfaceIndex([
      {
        entityId: "entity-a",
        assetHash: "hash-a",
        nodesByIndex: new Map([[7, node]]),
        nodeIndexByHitObject: new Map([[surface, 7]]),
      },
    ]),
  );
}

function hit(object: Object3D) {
  return {
    object,
    point: new Vector3(1, 2, 3),
    face: { normal: new Vector3(0, 1, 0) },
  };
}

function authority() {
  return { documentId: "document-a", revision: 1 };
}
