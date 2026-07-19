import { Box3, Matrix4, Vector3 } from "three";
import { describe, expect, it } from "vitest";

import {
  createDocumentHistory,
  executeDocumentCommand,
  executeHistoryCommand,
  redoHistoryCommand,
  undoHistoryCommand,
  type SceneDocument,
  type SceneEntity,
  type Transform,
} from "@web3d/document";
import type { EntitySpatialSnapshot } from "@web3d/runtime";

import type { StableIdFactory } from "../session/command-builders";
import {
  planAlign,
  planBoundsAnchorSnap,
  planCreateGroup,
  planDistribute,
  planDuplicateSubtrees,
  planReparent,
} from "./layout-planners";
import { matrixFromTransform } from "./spatial-math";
import { LayoutPlanningError } from "./types";

describe("layout planners", () => {
  it("creates one centered Group and preserves member world poses", () => {
    const document = scene([group("a", 0), group("b", 4)]);
    const planned = planCreateGroup(context(document, ["b", "a"], "b"), {
      id: "group-new",
      name: "Group",
    });

    expect(planned.command).toMatchObject({
      type: "create-group",
      group: {
        id: "group-new",
        parentId: null,
        transform: { position: [2, 0, 0] },
      },
      members: [
        { entityId: "a", after: { parentId: "group-new", transform: { position: [-2, 0, 0] } } },
        { entityId: "b", after: { parentId: "group-new", transform: { position: [2, 0, 0] } } },
      ],
    });
    expect(planned.nextSelection).toEqual({
      entityIds: ["group-new"],
      primaryEntityId: "group-new",
    });
    const applied = executeDocumentCommand(document, planned.command);
    expect(applied.revision).toBe(document.revision + 1);
    expect(applied.entities.find((entity) => entity.id === "a")?.parentId).toBe("group-new");
    expect(applied.entities.find((entity) => entity.id === "b")?.transform.position).toEqual([
      2, 0, 0,
    ]);
  });

  it("reparents to one explicit unlocked Group while preserving world pose", () => {
    const destination = group("destination", 10);
    const document = scene([entity("a", 0), destination]);
    const planned = planReparent(
      context(document, ["a"], "a", [snapshot(destination)]),
      "destination",
    );

    expect(planned.command).toMatchObject({
      type: "reparent-entities",
      changes: [
        {
          entityId: "a",
          before: { parentId: null, transform: { position: [0, 0, 0] } },
          after: { parentId: "destination", transform: { position: [-10, 0, 0] } },
        },
      ],
    });
    expectFailure(
      () =>
        planReparent(
          context(document, ["a"], "a", [
            { ...snapshot(destination), documentRevision: document.revision + 1 },
          ]),
          "destination",
        ),
      "snapshot-stale",
    );
  });

  it("aligns world AABB anchors to the explicit primary root", () => {
    const document = scene([entity("a", 0), entity("b", 4)]);
    const planned = planAlign(context(document, ["a", "b"], "a"), "x", "center");

    expect(planned.command).toMatchObject({
      type: "transform-entities",
      changes: [
        { entityId: "a", after: { position: [0, 0, 0] } },
        { entityId: "b", after: { position: [0, 0, 0] } },
      ],
    });
    expect(planned.feedback.activeAxis).toBe("x");
  });

  it("distributes equal clear gaps using coordinate and stable-ID order", () => {
    const document = scene([entity("c", 10), entity("b", 3), entity("a", 0)]);
    const planned = planDistribute(context(document, ["c", "b", "a"], "b"), "x");
    const command = planned.command;
    expect(command.type).toBe("transform-entities");
    if (command.type !== "transform-entities") return;
    expect(command.changes.find((change) => change.entityId === "a")?.after.position[0]).toBe(0);
    expect(command.changes.find((change) => change.entityId === "b")?.after.position[0]).toBe(5);
    expect(command.changes.find((change) => change.entityId === "c")?.after.position[0]).toBe(10);
  });

  it("uses stable ID rather than document or selection order for equal-coordinate ties", () => {
    const first = scene([entity("c", 10), entity("b", 0), entity("a", 0)]);
    const second = { ...first, entities: [...first.entities].reverse() };
    const firstPlan = planDistribute(context(first, ["c", "b", "a"], "b"), "x");
    const secondPlan = planDistribute(context(second, ["b", "a", "c"], "b"), "x");
    if (
      firstPlan.command.type !== "transform-entities" ||
      secondPlan.command.type !== "transform-entities"
    ) {
      throw new Error("Expected transform commands.");
    }
    const positions = (changes: typeof firstPlan.command.changes) =>
      Object.fromEntries(changes.map((change) => [change.entityId, change.after.position[0]]));
    expect(positions(firstPlan.command.changes)).toEqual(positions(secondPlan.command.changes));
    expect(positions(firstPlan.command.changes)).toEqual({ a: 0, b: 5, c: 10 });
  });

  it("keeps repeated world align byte-exact under a decimal non-uniform parent", () => {
    const parent = group("parent", 1.125, {
      rotation: [0, Math.sin(Math.PI / 12), 0, Math.cos(Math.PI / 12)],
      scale: [1.25, 0.75, 1.5],
    });
    const a = childEntity("a", "parent", [-4.125, 0, -1.5], [1, 0.8, 1.25]);
    const b = childEntity("b", "parent", [-0.75, 0, 2.25], [0.8, 1.2, 1.1]);
    const c = childEntity("c", "parent", [3.5, 0, -0.25], [1.4, 0.75, 0.9]);
    const original = scene([parent, c, a, b]);
    const first = planAlign(
      nestedContext(original, ["c", "b", "a"], "b", parent.transform),
      "z",
      "min",
    );
    let history = executeHistoryCommand(createDocumentHistory(original), first.command);

    history = executeHistoryCommand(history, { type: "rename-document", name: "Temporary" });
    history = undoHistoryCommand(history);
    const aligned = history.document;
    const second = planAlign(
      nestedContext(aligned, ["c", "b", "a"], "b", parent.transform),
      "z",
      "min",
    );
    if (second.command.type !== "transform-entities") {
      throw new Error("Expected transform command.");
    }
    for (const change of second.command.changes) {
      expect(change.after).toBe(change.before);
      expect(JSON.stringify(change.after)).toBe(JSON.stringify(change.before));
    }

    const beforeNoOp = history;
    const redoStack = history.redoStack;
    const afterNoOp = executeHistoryCommand(history, second.command);
    expect(afterNoOp).toBe(beforeNoOp);
    expect(afterNoOp.document.revision).toBe(aligned.revision);
    expect(afterNoOp.redoStack).toBe(redoStack);
    expect(redoHistoryCommand(afterNoOp).document.name).toBe("Temporary");
  });

  it("keeps repeated equal-gap distribution and fixed outers byte-exact", () => {
    const parent = group("parent", -0.375, {
      scale: [1.5, 0.625, 1.25],
    });
    const a = childEntity("a", "parent", [-4, 0, -1.5], [1, 1, 1]);
    const b = childEntity("b", "parent", [-0.75, 0, 2.25], [0.8, 1.2, 1.1]);
    const d = childEntity("d", "parent", [7.25, 0, 1.5], [0.65, 1.5, 1.25]);
    const original = scene([d, parent, b, a]);
    const first = planDistribute(
      nestedContext(original, ["d", "b", "a"], "b", parent.transform),
      "x",
    );
    const changedHistory = executeHistoryCommand(createDocumentHistory(original), first.command);
    const distributed = changedHistory.document;
    const second = planDistribute(
      nestedContext(distributed, ["d", "b", "a"], "b", parent.transform),
      "x",
    );
    if (second.command.type !== "transform-entities") {
      throw new Error("Expected transform command.");
    }
    for (const change of second.command.changes) {
      expect(change.after).toBe(change.before);
      expect(JSON.stringify(change.after)).toBe(JSON.stringify(change.before));
    }
    for (const fixedId of ["a", "d"]) {
      const fixed = second.command.changes.find((change) => change.entityId === fixedId)!;
      expect(JSON.stringify(fixed.after)).toBe(JSON.stringify(fixed.before));
    }

    const afterNoOp = executeHistoryCommand(changedHistory, second.command);
    expect(afterNoOp).toBe(changedHistory);
    expect(afterNoOp.document.revision).toBe(distributed.revision);
  });

  it("builds one atomic multi-root duplicate with complete maps and selects new roots", () => {
    const locked = { ...entity("locked", 0), locked: true } as SceneEntity;
    const document: SceneDocument = {
      ...scene([locked, entity("free", 4)]),
      targets: [
        {
          id: "target-locked",
          entityId: "locked",
          name: "Target",
          businessId: "business-kept-only-on-source",
          assetHash: "hash",
          nodeIndex: null,
          metadata: {},
        },
      ],
    };
    const planned = planDuplicateSubtrees(
      context(document, ["locked", "free"], "locked"),
      [2, 0, 0],
      sequentialIds(),
    );

    expect(planned.command.type).toBe("duplicate-subtrees");
    if (planned.command.type !== "duplicate-subtrees") return;
    expect(planned.command.items).toHaveLength(2);
    expect(planned.command.items[0]?.rootPlacement.after.transform.position).toEqual([6, 0, 0]);
    expect(planned.command.items[1]?.rootPlacement.after.transform.position).toEqual([2, 0, 0]);
    expect(planned.command.items[1]?.targetIdMap).toEqual({
      "target-locked": "target-target-locked-3",
    });
    expect(planned.nextSelection).toEqual({
      entityIds: ["entity-free-1", "entity-locked-2"],
      primaryEntityId: "entity-locked-2",
    });
  });

  it("applies duplicate offset in world space without changing a transformed parent", () => {
    const parent = group("parent", 0, {
      rotation: [0, 0, Math.sin(Math.PI / 4), Math.cos(Math.PI / 4)],
      scale: [2, 1, 1],
    });
    const child = { ...entity("child", 1), parentId: "parent" } as SceneEntity;
    const document = scene([parent, child]);
    const parentWorld = matrixFromTransform(parent.transform);
    const childWorld = parentWorld.clone().multiply(matrixFromTransform(child.transform));
    const planned = planDuplicateSubtrees(
      {
        document,
        selectedEntityIds: ["child"],
        primaryEntityId: "child",
        snapshots: [snapshot(child, childWorld)],
      },
      [1, 0, 0],
      sequentialIds(),
    );
    if (planned.command.type !== "duplicate-subtrees")
      throw new Error("Expected duplicate command.");
    const placement = planned.command.items[0]!.rootPlacement.after;
    expect(placement.parentId).toBe("parent");
    const nextWorld = parentWorld.clone().multiply(matrixFromTransform(placement.transform));
    const beforePosition = new Vector3().setFromMatrixPosition(childWorld);
    const afterPosition = new Vector3().setFromMatrixPosition(nextWorld);
    expect(afterPosition.x - beforePosition.x).toBeCloseTo(1);
    expect(afterPosition.y - beforePosition.y).toBeCloseTo(0);
    expect(afterPosition.z - beforePosition.z).toBeCloseTo(0);
  });

  it("snaps explicit source and target anchors with one transform command", () => {
    const target = entity("target", 10);
    const document = scene([entity("source", 0), target]);
    const planned = planBoundsAnchorSnap(
      context(document, ["source"], "source", [snapshot(target)]),
      "maxX",
      "target",
      "minX",
    );

    expect(planned.command).toMatchObject({
      type: "transform-entities",
      changes: [{ entityId: "source", after: { position: [8, 0, 0] } }],
    });
    expect(planned.feedback.deltaPosition).toEqual([8, 0, 0]);
  });

  it("rejects mixed parents, hidden bounds, stale snapshots and cycles", () => {
    const parent = group("parent", 0);
    const child = { ...group("child", 0), parentId: "parent" } as SceneEntity;
    const hidden = { ...entity("hidden", 4), visible: false } as SceneEntity;
    const document = scene([parent, child, hidden]);

    expectFailure(
      () => planAlign(context(document, ["child", "hidden"], "child"), "x", "min"),
      "mixed-parents",
    );
    expectFailure(
      () => planAlign(context(document, ["parent", "hidden"], "parent"), "x", "min"),
      "selection-hidden",
    );
    const stale = context(document, ["parent"], "parent");
    stale.snapshots[0] = { ...stale.snapshots[0]!, documentRevision: 99 };
    expectFailure(() => planReparent(stale, "child"), "snapshot-stale");
    expectFailure(
      () =>
        planReparent(
          context(document, ["parent"], "parent", [
            snapshot(child, matrixFromTransform(child.transform)),
          ]),
          "child",
        ),
      "target-cycle",
    );
  });

  it("rejects a reparent local matrix with non-representable shear", () => {
    const rotation = [0, 0, Math.sin(Math.PI / 8), Math.cos(Math.PI / 8)] as const;
    const destination = group("destination", 0, {
      rotation,
      scale: [2, 1, 1],
    });
    const source = entity("source", 0);
    const document = scene([source, destination]);
    expectFailure(
      () =>
        planReparent(
          context(document, ["source"], "source", [snapshot(destination)]),
          "destination",
        ),
      "non-representable-transform",
    );
  });

  it("uses effective snapshot visibility without making reparent stale", () => {
    const source = entity("source", 0);
    const destination = group("destination", 10);
    const document = scene([source, destination]);
    const effectivelyHidden = { ...snapshot(source), visible: false };
    const destinationSnapshot = snapshot(destination);
    const hiddenContext = {
      document,
      selectedEntityIds: ["source"],
      primaryEntityId: "source",
      snapshots: [effectivelyHidden, destinationSnapshot],
    };

    expect(() => planReparent(hiddenContext, "destination")).not.toThrow();
    expectFailure(
      () =>
        planCreateGroup(
          { ...hiddenContext, selectedEntityIds: ["source", "destination"] },
          { id: "new", name: "Group" },
        ),
      "selection-hidden",
    );
    expectFailure(
      () => planBoundsAnchorSnap(hiddenContext, "center", "destination", "center"),
      "selection-hidden",
    );
    expectFailure(
      () =>
        planBoundsAnchorSnap(
          {
            ...hiddenContext,
            snapshots: [snapshot(source), { ...destinationSnapshot, visible: false }],
          },
          "center",
          "destination",
          "center",
        ),
      "target-hidden",
    );
  });

  it("uses the shared epsilon for common-parent snapshot agreement", () => {
    const a = entity("a", 0);
    const b = entity("b", 4);
    const document = scene([a, b]);
    const aSnapshot = snapshot(a);
    const insideWorld = new Matrix4()
      .makeTranslation(5e-10, 0, 0)
      .multiply(matrixFromTransform(b.transform));
    expect(() =>
      planCreateGroup(
        {
          document,
          selectedEntityIds: ["a", "b"],
          primaryEntityId: "a",
          snapshots: [aSnapshot, snapshot(b, insideWorld)],
        },
        { id: "inside", name: "Group" },
      ),
    ).not.toThrow();

    const outsideWorld = new Matrix4()
      .makeTranslation(2e-9, 0, 0)
      .multiply(matrixFromTransform(b.transform));
    expectFailure(
      () =>
        planCreateGroup(
          {
            document,
            selectedEntityIds: ["a", "b"],
            primaryEntityId: "a",
            snapshots: [aSnapshot, snapshot(b, outsideWorld)],
          },
          { id: "outside", name: "Group" },
        ),
      "snapshot-stale",
    );
  });
});

function scene(entities: readonly SceneEntity[]): SceneDocument {
  return {
    schemaVersion: "1.4.0",
    id: "scene",
    name: "Scene",
    revision: 7,
    assets: [
      {
        id: "asset",
        name: "Layout fixture asset",
        uri: "asset://e123f3d64ec60f136d8673478eb2fd2ce28f56bcb5fb94cef5a7377b9605efe8",
        mediaType: "model/gltf-binary",
        sha256: "e123f3d64ec60f136d8673478eb2fd2ce28f56bcb5fb94cef5a7377b9605efe8",
        byteLength: 1216,
      },
    ],
    entities,
    targets: [],
    dataSources: [],
    bindings: [],
    ruleSets: [],
    annotations: [],
    views: [],
    environment: {
      backgroundMode: "custom",
      background: "#FFFFFF",
      grid: true,
      unit: "m",
      upAxis: "Y",
      lighting: standardLighting(),
    },
  };
}

function standardLighting() {
  return {
    fill: { skyColor: "#FFFFFF", groundColor: "#65706A", intensity: 1.8 },
    key: {
      color: "#FFFFFF",
      intensity: 2.2,
      directionToLight: [0.37904902178945177, 0.7580980435789035, 0.5306686305052324] as const,
    },
  };
}

function entity(id: string, x: number): Extract<SceneEntity, { type: "asset" }> {
  return {
    id,
    type: "asset",
    assetId: "asset",
    parentId: null,
    name: id,
    visible: true,
    locked: false,
    transform: transform(x),
    metadata: {},
  };
}

function group(id: string, x: number, overrides: Partial<Transform> = {}): SceneEntity {
  return {
    id,
    type: "group",
    parentId: null,
    name: id,
    visible: true,
    locked: false,
    transform: { ...transform(x), ...overrides },
    metadata: {},
  };
}

function transform(x: number): Transform {
  return {
    position: [x, 0, 0],
    rotation: [0, 0, 0, 1],
    scale: [1, 1, 1],
  };
}

function childEntity(
  id: string,
  parentId: string,
  position: Transform["position"],
  scale: Transform["scale"],
): SceneEntity {
  return {
    ...entity(id, 0),
    parentId,
    transform: { position, rotation: [0, 0, 0, 1], scale },
  };
}

function nestedContext(
  document: SceneDocument,
  selectedEntityIds: readonly string[],
  primaryEntityId: string,
  parentTransform: Transform,
) {
  const parentWorld = matrixFromTransform(parentTransform);
  return {
    document,
    selectedEntityIds,
    primaryEntityId,
    snapshots: selectedEntityIds.map((entityId) => {
      const entity = document.entities.find((candidate) => candidate.id === entityId)!;
      const world = parentWorld.clone().multiply(matrixFromTransform(entity.transform));
      return snapshotForDocument(document, entity, world);
    }),
  };
}

function snapshotForDocument(
  document: SceneDocument,
  entity: SceneEntity,
  world: Matrix4,
): EntitySpatialSnapshot {
  const bounds = new Box3(
    new Vector3(-1.125, -0.5, -0.75),
    new Vector3(1.375, 0.5, 0.75),
  ).applyMatrix4(world);
  const pivot = new Vector3().setFromMatrixPosition(world);
  return {
    documentId: document.id,
    documentRevision: document.revision,
    entityId: entity.id,
    parentId: entity.parentId,
    localTransform: entity.transform,
    worldMatrix: world.toArray() as EntitySpatialSnapshot["worldMatrix"],
    worldBounds: {
      min: [bounds.min.x, bounds.min.y, bounds.min.z],
      max: [bounds.max.x, bounds.max.y, bounds.max.z],
    },
    worldPivot: [pivot.x, pivot.y, pivot.z],
    visible: entity.visible,
    locked: entity.locked,
  };
}

function context(
  document: SceneDocument,
  selectedEntityIds: readonly string[],
  primaryEntityId: string,
  extraSnapshots: readonly EntitySpatialSnapshot[] = [],
) {
  const snapshots = selectedEntityIds
    .map((id) => document.entities.find((entity) => entity.id === id))
    .filter((entity): entity is SceneEntity => entity !== undefined)
    .map((entity) => snapshot(entity));
  return {
    document,
    selectedEntityIds,
    primaryEntityId,
    snapshots: [...snapshots, ...extraSnapshots],
  };
}

function snapshot(
  entity: SceneEntity,
  world = matrixFromTransform(entity.transform),
): EntitySpatialSnapshot {
  const center = new Matrix4().copy(world).elements[12] ?? 0;
  return {
    documentId: "scene",
    documentRevision: 7,
    entityId: entity.id,
    parentId: entity.parentId,
    localTransform: entity.transform,
    worldMatrix: world.toArray() as unknown as EntitySpatialSnapshot["worldMatrix"],
    worldBounds: {
      min: [center - 1, -1, -1],
      max: [center + 1, 1, 1],
    },
    worldPivot: [center, 0, 0],
    visible: entity.visible,
    locked: entity.locked,
  };
}

function sequentialIds(): StableIdFactory {
  let sequence = 0;
  return {
    next(kind, sourceId) {
      sequence += 1;
      return `${kind}-${sourceId ?? "new"}-${sequence}`;
    },
  };
}

function expectFailure(callback: () => unknown, code: LayoutPlanningError["code"]): void {
  try {
    callback();
    throw new Error("Expected layout planning to fail.");
  } catch (error) {
    expect(error).toBeInstanceOf(LayoutPlanningError);
    expect((error as LayoutPlanningError).code).toBe(code);
  }
}
