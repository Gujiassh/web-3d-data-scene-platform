import {
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  Raycaster,
  SkinnedMesh,
  Uint16BufferAttribute,
  Vector3,
  type Material,
  type Object3D,
} from "three";
import { describe, expect, it, vi } from "vitest";

import { disposeObject3D } from "./dispose-object";
import { resolveVisualCoplanarOverlaps } from "./visual-coplanar-overlaps";

describe("resolveVisualCoplanarOverlaps", () => {
  it("suppresses a later same-material oriented duplicate without changing indexes or raycasts", () => {
    const material = new MeshBasicMaterial();
    const first = mesh(triangleGeometry([[0, 0, 0]]), material);
    const secondGeometry = triangleGeometry([
      [3, 0, 0],
      [0, 0, 0],
    ]);
    const originalIndexes = [...secondGeometry.index!.array];
    const second = mesh(secondGeometry, material);
    const fixture = visualFixture([first, second]);

    const result = suppress(fixture);

    expect(result).toEqual({ suppressedTriangles: 1, offsetTriangles: 0, affectedMeshes: 1 });
    expect(first.geometry.groups).toEqual([]);
    expect(second.geometry).not.toBe(secondGeometry);
    expect([...second.geometry.index!.array]).toEqual(originalIndexes);
    expect(second.geometry.groups).toEqual([
      { start: 0, count: 3, materialIndex: 0 },
      { start: 3, count: 3, materialIndex: 1 },
    ]);
    expect(Array.isArray(second.material)).toBe(true);
    expect((second.material as Material[])[0]).toBe(material);
    expect((second.material as Material[])[1]?.visible).toBe(false);

    fixture.scene.updateMatrixWorld(true);
    const hits = new Raycaster(new Vector3(0.2, 0.2, 1), new Vector3(0, 0, -1))
      .intersectObjects([first, second])
      .map((hit) => ({ object: hit.object, faceIndex: hit.faceIndex }));
    expect(hits).toContainEqual({ object: first, faceIndex: 0 });
    expect(hits).toContainEqual({ object: second, faceIndex: 1 });
  });

  it("accepts equivalent node transforms within the fixed coordinate precision", () => {
    const material = new MeshBasicMaterial();
    const first = mesh(triangleGeometry([[0, 0, 0]]), material);
    const second = mesh(triangleGeometry([[0, 0, 0]]), material);
    second.position.x = 1e-7;
    const fixture = visualFixture([first, second]);

    expect(suppress(fixture)).toEqual({
      suppressedTriangles: 1,
      offsetTriangles: 0,
      affectedMeshes: 1,
    });
  });

  it("leaves triangles that collapse after coordinate canonicalization unchanged", () => {
    const material = new MeshBasicMaterial();
    const tiny = new BufferGeometry();
    tiny.setAttribute("position", new Float32BufferAttribute([0, 0, 0, 4e-7, 0, 0, 0, 4e-7, 0], 3));
    tiny.setIndex([0, 1, 2]);
    const fixture = visualFixture([mesh(tiny, material), mesh(tiny.clone(), material)]);

    expect(suppress(fixture)).toEqual({
      suppressedTriangles: 0,
      offsetTriangles: 0,
      affectedMeshes: 0,
    });
  });

  it.each([
    {
      name: "planes outside the fixed precision",
      arrange() {
        const material = new MeshBasicMaterial();
        const first = mesh(triangleGeometry([[0, 0, 0]]), material);
        const second = mesh(triangleGeometry([[0, 0, 0]]), material);
        second.position.z = 2e-6;
        return [first, second];
      },
    },
    {
      name: "triangles that only share an edge",
      arrange() {
        const material = new MeshBasicMaterial();
        const first = triangleGeometry([[0, 0, 0]]);
        const second = new BufferGeometry();
        second.setAttribute("position", new Float32BufferAttribute([1, 0, 0, 0, 1, 0, 1, 1, 0], 3));
        second.setIndex([0, 1, 2]);
        return [mesh(first, material), mesh(second, material)];
      },
    },
    {
      name: "coplanar triangles below the coverage threshold",
      arrange() {
        const material = new MeshBasicMaterial();
        const first = mesh(triangleGeometry([[0, 0, 0]]), material);
        const second = mesh(triangleGeometry([[0, 0, 0]]), material);
        second.position.x = 0.1;
        return [first, second];
      },
    },
    {
      name: "duplicates within one formal node",
      arrange() {
        const material = new MeshBasicMaterial();
        return [
          mesh(
            triangleGeometry([
              [0, 0, 0],
              [0, 0, 0],
            ]),
            material,
          ),
        ];
      },
    },
  ])("leaves $name unchanged", ({ arrange }) => {
    const fixture = visualFixture(arrange());
    const geometries = fixture.meshes.map((candidate) => candidate.geometry);
    const materials = fixture.meshes.map((candidate) => candidate.material);

    expect(suppress(fixture)).toEqual({
      suppressedTriangles: 0,
      offsetTriangles: 0,
      affectedMeshes: 0,
    });
    expect(fixture.meshes.map((candidate) => candidate.geometry)).toEqual(geometries);
    expect(fixture.meshes.map((candidate) => candidate.material)).toEqual(materials);
  });

  it.each([
    {
      name: "different materials",
      firstMaterial: new MeshBasicMaterial({ color: 0xff0000 }),
      secondMaterial: new MeshBasicMaterial({ color: 0x00ff00 }),
      reverseSecond: false,
    },
    {
      name: "opposite winding",
      firstMaterial: new MeshBasicMaterial({ side: DoubleSide }),
      secondMaterial: null,
      reverseSecond: true,
    },
  ])("pushes a later mostly-covered face behind the earlier $name surface", (options) => {
    const secondMaterial = options.secondMaterial ?? options.firstMaterial;
    const first = mesh(triangleGeometry([[0, 0, 0]]), options.firstMaterial);
    const second = mesh(triangleGeometry([[0, 0, 0]], options.reverseSecond), secondMaterial);
    const fixture = visualFixture([first, second]);

    expect(suppress(fixture)).toEqual({
      suppressedTriangles: 0,
      offsetTriangles: 1,
      affectedMeshes: 1,
    });
    expect(first.geometry.groups).toEqual([]);
    expect(first.material).toBe(options.firstMaterial);
    expect(second.geometry.groups).toEqual([{ start: 0, count: 3, materialIndex: 2 }]);
    expect(Array.isArray(second.material)).toBe(true);
    const secondMaterials = second.material as Material[];
    expect(secondMaterials[0]).toBe(secondMaterial);
    expect(secondMaterials[2]).toMatchObject({
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });

    fixture.scene.updateMatrixWorld(true);
    const hits = new Raycaster(new Vector3(0.2, 0.2, 1), new Vector3(0, 0, -1))
      .intersectObjects([first, second])
      .map((hit) => ({ object: hit.object, faceIndex: hit.faceIndex }));
    expect(hits).toContainEqual({ object: first, faceIndex: 0 });
    expect(hits).toContainEqual({ object: second, faceIndex: 0 });
  });

  it("pushes a later face behind a fully covering triangle with different vertices", () => {
    const material = new MeshBasicMaterial();
    const covering = new BufferGeometry();
    covering.setAttribute(
      "position",
      new Float32BufferAttribute([-1, -1, 0, 2, -1, 0, -1, 2, 0], 3),
    );
    covering.setIndex([0, 1, 2]);
    const covered = triangleGeometry([[0, 0, 0]]);
    const fixture = visualFixture([mesh(covering, material), mesh(covered, material)]);

    expect(suppress(fixture)).toEqual({
      suppressedTriangles: 0,
      offsetTriangles: 1,
      affectedMeshes: 1,
    });
    expect(fixture.meshes[1]!.geometry.groups).toEqual([{ start: 0, count: 3, materialIndex: 2 }]);
  });

  it("keeps traversal priority when the later covered face sorts first spatially", () => {
    const material = new MeshBasicMaterial();
    const first = triangleGeometry([[0, 0, 0]]);
    const later = new BufferGeometry();
    later.setAttribute(
      "position",
      new Float32BufferAttribute([-0.01, 0, 0, 0.99, 0, 0, -0.01, 1, 0], 3),
    );
    later.setIndex([0, 1, 2]);
    const fixture = visualFixture([mesh(first, material), mesh(later, material)]);

    expect(suppress(fixture)).toEqual({
      suppressedTriangles: 0,
      offsetTriangles: 1,
      affectedMeshes: 1,
    });
    expect(fixture.meshes[0]!.geometry.groups).toEqual([]);
    expect(fixture.meshes[1]!.geometry.groups).toEqual([{ start: 0, count: 3, materialIndex: 2 }]);
  });

  it("assigns distinct bounded priorities to three overlapping layers", () => {
    const materials = [
      new MeshBasicMaterial({ color: 0xff0000 }),
      new MeshBasicMaterial({ color: 0x00ff00 }),
      new MeshBasicMaterial({ color: 0x0000ff }),
    ];
    const meshes = materials.map((material) => mesh(triangleGeometry([[0, 0, 0]]), material));
    const fixture = visualFixture(meshes);

    expect(suppress(fixture)).toEqual({
      suppressedTriangles: 0,
      offsetTriangles: 2,
      affectedMeshes: 2,
    });
    expect(meshes[0]!.material).toBe(materials[0]);
    expect((meshes[1]!.material as Material[])[2]).toMatchObject({
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });
    expect((meshes[2]!.material as Material[])[2]).toMatchObject({
      polygonOffsetFactor: 2,
      polygonOffsetUnits: 2,
    });
  });

  it("keeps duplicate triangles in different animated branches", () => {
    const material = new MeshBasicMaterial();
    const first = mesh(triangleGeometry([[0, 0, 0]]), material);
    const second = mesh(triangleGeometry([[0, 0, 0]]), material);
    const fixture = visualFixture([first, second], { animatedBranches: true });

    expect(suppress(fixture)).toEqual({
      suppressedTriangles: 0,
      offsetTriangles: 0,
      affectedMeshes: 0,
    });
  });

  it("fails closed for morph, skinned, instanced, grouped, and partial-draw geometry", () => {
    const material = new MeshBasicMaterial();
    const baseline = mesh(triangleGeometry([[0, 0, 0]]), material);
    const morphGeometry = triangleGeometry([[0, 0, 0]]);
    morphGeometry.morphAttributes.position = [
      new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3),
    ];
    const morph = mesh(morphGeometry, material);
    const skinned = new SkinnedMesh(triangleGeometry([[0, 0, 0]]), material);
    const instanced = new InstancedMesh(triangleGeometry([[0, 0, 0]]), material, 1);
    const groupedGeometry = triangleGeometry([[0, 0, 0]]);
    groupedGeometry.addGroup(0, 3, 0);
    const grouped = mesh(groupedGeometry, material);
    const partialGeometry = triangleGeometry([[0, 0, 0]]);
    partialGeometry.setDrawRange(0, 0);
    const partial = mesh(partialGeometry, material);
    const fixture = visualFixture([baseline, morph, skinned, instanced, grouped, partial]);

    expect(suppress(fixture)).toEqual({
      suppressedTriangles: 0,
      offsetTriangles: 0,
      affectedMeshes: 0,
    });
  });

  it("does not dispose a replaced geometry while another asset object still references it", () => {
    const material = new MeshBasicMaterial();
    const first = mesh(triangleGeometry([[0, 0, 0]]), material);
    const shared = triangleGeometry([[0, 0, 0]]);
    const second = mesh(shared, material);
    const fixture = visualFixture([first, second]);
    const collisionReference = mesh(shared, material);
    fixture.collision.add(collisionReference);
    const sharedDispose = vi.fn();
    shared.addEventListener("dispose", sharedDispose);

    expect(suppress(fixture)).toEqual({
      suppressedTriangles: 1,
      offsetTriangles: 0,
      affectedMeshes: 1,
    });
    expect(second.geometry).not.toBe(shared);
    expect(collisionReference.geometry).toBe(shared);
    expect(sharedDispose).not.toHaveBeenCalled();

    disposeObject3D(fixture.scene);
    expect(sharedDispose).toHaveBeenCalledOnce();
  });

  it("disposes detached geometry immediately and runtime-only resources with the asset", () => {
    const material = new MeshBasicMaterial();
    const first = mesh(triangleGeometry([[0, 0, 0]]), material);
    const detached = triangleGeometry([[0, 0, 0]]);
    const second = mesh(detached, material);
    const fixture = visualFixture([first, second]);
    const detachedDispose = vi.fn();
    detached.addEventListener("dispose", detachedDispose);

    expect(suppress(fixture)).toEqual({
      suppressedTriangles: 1,
      offsetTriangles: 0,
      affectedMeshes: 1,
    });
    expect(detachedDispose).toHaveBeenCalledOnce();
    const clonedGeometry = second.geometry;
    const hiddenMaterial = (second.material as Material[])[1]!;
    const clonedDispose = vi.fn();
    const hiddenDispose = vi.fn();
    clonedGeometry.addEventListener("dispose", clonedDispose);
    hiddenMaterial.addEventListener("dispose", hiddenDispose);

    disposeObject3D(fixture.scene);
    expect(clonedDispose).toHaveBeenCalledOnce();
    expect(hiddenDispose).toHaveBeenCalledOnce();
  });
});

function suppress(fixture: VisualFixture) {
  return resolveVisualCoplanarOverlaps(
    fixture.visual,
    fixture.nodesByIndex,
    fixture.nodeIndexByObject,
    fixture.gltfJson,
  );
}

function visualFixture(
  meshes: Mesh[],
  options: { readonly animatedBranches?: boolean } = {},
): VisualFixture {
  const scene = new Group();
  const root = namedGroup("ROOT");
  const visual = namedGroup("VISUAL");
  const collision = namedGroup("COLLISION");
  const nodesByIndex = new Map<number, Object3D>([
    [0, root],
    [1, visual],
    [2, collision],
  ]);
  const nodeIndexByObject = new Map<Object3D, number>();
  const animatedNodeIndexes: number[] = [];
  for (const [index, candidate] of meshes.entries()) {
    const nodeIndex = 10 + index * 2;
    if (options.animatedBranches === true) {
      const branchIndex = nodeIndex + 1;
      const branch = namedGroup(`MOTION_${String(index)}`);
      branch.add(candidate);
      visual.add(branch);
      nodesByIndex.set(branchIndex, branch);
      animatedNodeIndexes.push(branchIndex);
    } else {
      visual.add(candidate);
    }
    nodesByIndex.set(nodeIndex, candidate);
    nodeIndexByObject.set(candidate, nodeIndex);
  }
  root.add(visual, collision);
  scene.add(root);
  return {
    scene,
    visual,
    collision,
    meshes,
    nodesByIndex,
    nodeIndexByObject,
    gltfJson: {
      animations:
        animatedNodeIndexes.length === 0
          ? []
          : [
              {
                channels: animatedNodeIndexes.map((node) => ({ target: { node } })),
              },
            ],
    },
  };
}

function triangleGeometry(
  origins: readonly (readonly [number, number, number])[],
  reverse = false,
): BufferGeometry {
  const positions: number[] = [];
  const indexes: number[] = [];
  for (const [triangle, [x, y, z]] of origins.entries()) {
    positions.push(x, y, z, x + 1, y, z, x, y + 1, z);
    const start = triangle * 3;
    indexes.push(start, reverse ? start + 2 : start + 1, reverse ? start + 1 : start + 2);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setIndex(new Uint16BufferAttribute(indexes, 1));
  return geometry;
}

function mesh(geometry: BufferGeometry, material: Material): Mesh {
  return new Mesh(geometry, material);
}

function namedGroup(name: string): Group {
  const group = new Group();
  group.name = name;
  return group;
}

interface VisualFixture {
  readonly scene: Group;
  readonly visual: Group;
  readonly collision: Group;
  readonly meshes: readonly Mesh[];
  readonly nodesByIndex: ReadonlyMap<number, Object3D>;
  readonly nodeIndexByObject: ReadonlyMap<Object3D, number>;
  readonly gltfJson: unknown;
}
