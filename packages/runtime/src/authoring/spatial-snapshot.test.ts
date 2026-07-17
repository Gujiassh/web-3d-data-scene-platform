import type { SceneDocument, SceneEntity, Transform } from "@web3d/document";
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, type Object3D } from "three";
import { describe, expect, it, vi } from "vitest";

import type { RuntimeEntity, RuntimeGeneration } from "../viewer/runtime-generation";
import { createEntitySpatialSnapshots } from "./spatial-snapshot";

describe("createEntitySpatialSnapshots", () => {
  it("returns stable revision-bound world measurements as deeply immutable values", () => {
    const fixture = spatialFixture();

    const snapshots = createEntitySpatialSnapshots(fixture.document, fixture.generation, [
      "empty-group",
      "asset-entity",
      "asset-entity",
      "parent-group",
    ]);

    expect(snapshots.map((snapshot) => snapshot.entityId)).toEqual([
      "asset-entity",
      "empty-group",
      "parent-group",
    ]);
    expect(snapshots[0]).toMatchObject({
      documentId: "spatial-document",
      documentRevision: 7,
      entityId: "asset-entity",
      parentId: "parent-group",
      localTransform: { position: [2, 0, 0] },
      worldPivot: [12, 0, 0],
      worldBounds: { min: [11, -1, -1], max: [13, 1, 1] },
      visible: true,
      locked: true,
    });
    expect(snapshots[0]?.worldMatrix).toHaveLength(16);
    expect(snapshots[0]?.worldMatrix[12]).toBe(12);
    expect(snapshots[1]).toMatchObject({
      entityId: "empty-group",
      worldPivot: [-3, 0, 0],
      worldBounds: null,
    });
    expect(snapshots[2]?.worldBounds).toEqual({ min: [11, -1, -1], max: [13, 1, 1] });
    expect(Object.isFrozen(snapshots)).toBe(true);
    expect(Object.isFrozen(snapshots[0])).toBe(true);
    expect(Object.isFrozen(snapshots[0]?.localTransform)).toBe(true);
    expect(Object.isFrozen(snapshots[0]?.localTransform.position)).toBe(true);
    expect(Object.isFrozen(snapshots[0]?.worldMatrix)).toBe(true);
    expect(Object.isFrozen(snapshots[0]?.worldBounds?.min)).toBe(true);
  });

  it("uses effective hierarchy visibility and excludes hidden geometry from group bounds", () => {
    const fixture = spatialFixture();

    const snapshots = createEntitySpatialSnapshots(fixture.document, fixture.generation, [
      "parent-group",
      "hidden-child",
      "hidden-parent",
      "hidden-descendant",
    ]);

    expect(snapshots[0]).toMatchObject({
      entityId: "hidden-child",
      visible: false,
      worldPivot: [15, 0, 0],
      worldBounds: null,
    });
    expect(snapshots[1]).toMatchObject({
      entityId: "hidden-descendant",
      visible: false,
      worldPivot: [21, 0, 0],
      worldBounds: null,
    });
    expect(snapshots[2]).toMatchObject({
      entityId: "hidden-parent",
      visible: false,
      worldPivot: [20, 0, 0],
      worldBounds: null,
    });
    expect(snapshots[3]).toMatchObject({
      entityId: "parent-group",
      visible: true,
      worldBounds: { min: [11, -1, -1], max: [13, 1, 1] },
    });
  });

  it("rejects an uncommitted runtime preview as a stable stale measurement", () => {
    const fixture = spatialFixture();
    const object = fixture.generation.entities.get("asset-entity")?.object;
    if (object === undefined) throw new Error("Fixture entity is missing.");
    object.position.x += 1;

    expect(() =>
      createEntitySpatialSnapshots(fixture.document, fixture.generation, [
        "empty-group",
        "asset-entity",
      ]),
    ).toThrowError(
      expect.objectContaining({
        name: "StaleSpatialMeasurementError",
        documentId: fixture.document.id,
        documentRevision: fixture.document.revision,
        message: expect.stringContaining("runtime transforms do not match"),
      }),
    );
  });

  it("returns canonical authored local transforms within epsilon and at its exact boundary", () => {
    const within = spatialFixture();
    const withinObject = within.generation.entities.get("asset-entity")?.object;
    const authored = within.document.entities.find((entity) => entity.id === "asset-entity");
    if (withinObject === undefined || authored === undefined) {
      throw new Error("Fixture entity is missing.");
    }
    withinObject.position.y = 5e-10;
    const withinSnapshot = createEntitySpatialSnapshots(within.document, within.generation, [
      "asset-entity",
    ])[0];
    expect(withinSnapshot?.localTransform).toEqual(authored.transform);
    expect(withinSnapshot?.localTransform).not.toBe(authored.transform);
    expect(withinSnapshot?.worldPivot[1]).toBe(5e-10);
    expect(Object.isFrozen(withinSnapshot?.localTransform)).toBe(true);

    const boundary = spatialFixture();
    const boundaryObject = boundary.generation.entities.get("asset-entity")?.object;
    if (boundaryObject === undefined) throw new Error("Fixture entity is missing.");
    boundaryObject.quaternion.x = 1e-9;
    expect(
      createEntitySpatialSnapshots(boundary.document, boundary.generation, ["asset-entity"])[0]
        ?.localTransform.rotation,
    ).toEqual([0, 0, 0, 1]);
  });

  it("rejects a runtime local transform immediately outside epsilon", () => {
    const fixture = spatialFixture();
    const object = fixture.generation.entities.get("asset-entity")?.object;
    if (object === undefined) throw new Error("Fixture entity is missing.");
    object.quaternion.x = 1.0000001e-9;

    expect(() =>
      createEntitySpatialSnapshots(fixture.document, fixture.generation, ["asset-entity"]),
    ).toThrowError(expect.objectContaining({ name: "StaleSpatialMeasurementError" }));
  });

  it("rejects a missing or disposed generation without returning partial snapshots", () => {
    const fixture = spatialFixture();

    expect(() =>
      createEntitySpatialSnapshots(fixture.document, fixture.generation, [
        "asset-entity",
        "missing-entity",
      ]),
    ).toThrow("missing-entity");

    fixture.generation.dispose();
    expect(() =>
      createEntitySpatialSnapshots(fixture.document, fixture.generation, ["asset-entity"]),
    ).toThrow("disposed");
  });
});

function spatialFixture(): { document: SceneDocument; generation: RuntimeGeneration } {
  const parentEntity = groupEntity("parent-group", null, transform([10, 0, 0]));
  const assetEntity: SceneEntity = {
    id: "asset-entity",
    type: "asset",
    parentId: parentEntity.id,
    name: "Asset",
    visible: true,
    locked: true,
    transform: transform([2, 0, 0]),
    assetId: "asset",
    metadata: {},
  };
  const hiddenChildEntity: SceneEntity = {
    ...assetEntity,
    id: "hidden-child",
    name: "Hidden child",
    visible: false,
    locked: false,
    transform: transform([5, 0, 0]),
  };
  const emptyEntity = groupEntity("empty-group", null, transform([-3, 0, 0]));
  const hiddenParentEntity: SceneEntity = {
    ...groupEntity("hidden-parent", null, transform([20, 0, 0])),
    visible: false,
  };
  const hiddenDescendantEntity: SceneEntity = {
    ...assetEntity,
    id: "hidden-descendant",
    parentId: hiddenParentEntity.id,
    name: "Hidden descendant",
    locked: false,
    transform: transform([1, 0, 0]),
  };
  const document: SceneDocument = {
    schemaVersion: "1.3.0",
    id: "spatial-document",
    name: "Spatial document",
    revision: 7,
    assets: [],
    entities: [
      parentEntity,
      assetEntity,
      hiddenChildEntity,
      emptyEntity,
      hiddenParentEntity,
      hiddenDescendantEntity,
    ],
    targets: [],
    dataSources: [],
    bindings: [],
    ruleSets: [],
    annotations: [],
    views: [],
    environment: {
      backgroundMode: "custom",
      background: "#FFFFFF",
      grid: false,
      unit: "m",
      upAxis: "Y",
      lighting: standardLighting(),
    },
  };

  const root = new Group();
  const parentObject = objectFor(parentEntity);
  const assetObject = objectFor(assetEntity);
  const hiddenChildObject = objectFor(hiddenChildEntity);
  const emptyObject = objectFor(emptyEntity);
  const hiddenParentObject = objectFor(hiddenParentEntity);
  const hiddenDescendantObject = objectFor(hiddenDescendantEntity);
  assetObject.add(new Mesh(new BoxGeometry(2, 2, 2), new MeshBasicMaterial()));
  hiddenChildObject.add(new Mesh(new BoxGeometry(10, 10, 10), new MeshBasicMaterial()));
  hiddenDescendantObject.add(new Mesh(new BoxGeometry(2, 2, 2), new MeshBasicMaterial()));
  root.add(parentObject, emptyObject, hiddenParentObject);
  parentObject.add(assetObject, hiddenChildObject);
  hiddenParentObject.add(hiddenDescendantObject);
  const entities = new Map<string, RuntimeEntity>([
    [parentEntity.id, { entity: parentEntity, object: parentObject }],
    [assetEntity.id, { entity: assetEntity, object: assetObject }],
    [hiddenChildEntity.id, { entity: hiddenChildEntity, object: hiddenChildObject }],
    [emptyEntity.id, { entity: emptyEntity, object: emptyObject }],
    [hiddenParentEntity.id, { entity: hiddenParentEntity, object: hiddenParentObject }],
    [hiddenDescendantEntity.id, { entity: hiddenDescendantEntity, object: hiddenDescendantObject }],
  ]);
  return {
    document,
    generation: {
      root,
      authoredLights: stubAuthoredLights(),
      entities,
      targets: new Map(),
      diagnostics: [],
      entityForObject: vi.fn(),
      targetForObject: vi.fn(),
      dispose: vi.fn(() => root.clear()),
    },
  };
}

function stubAuthoredLights(): RuntimeGeneration["authoredLights"] {
  return {
    stage: vi.fn(() => ({ commit: vi.fn(), dispose: vi.fn() })),
    setAuthoringMode: vi.fn(),
    entityForObject: vi.fn(),
    dispose: vi.fn(),
  };
}

function standardLighting(): SceneDocument["environment"]["lighting"] {
  return {
    fill: { skyColor: "#FFFFFF", groundColor: "#65706A", intensity: 1.8 },
    key: {
      color: "#FFFFFF",
      intensity: 2.2,
      directionToLight: [0.37904902178945177, 0.7580980435789035, 0.5306686305052324],
    },
  };
}

function groupEntity(id: string, parentId: string | null, value: Transform): SceneEntity {
  return {
    id,
    type: "group",
    parentId,
    name: id,
    visible: true,
    locked: false,
    transform: value,
    metadata: {},
  };
}

function transform(position: readonly [number, number, number]): Transform {
  return { position, rotation: [0, 0, 0, 1], scale: [1, 1, 1] };
}

function objectFor(entity: SceneEntity): Object3D {
  const object = new Group();
  object.position.fromArray(entity.transform.position);
  object.quaternion.fromArray(entity.transform.rotation);
  object.scale.fromArray(entity.transform.scale);
  object.visible = entity.visible;
  return object;
}
