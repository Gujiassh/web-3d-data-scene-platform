import { Matrix4, Vector3 } from "three";

import {
  type CreateGroupCommand,
  type DuplicateSubtreesCommand,
  type GroupEntity,
  type ReparentEntitiesCommand,
  type SceneDocument,
  type SceneEntity,
  type TransformEntitiesCommand,
  type Vec3,
} from "@web3d/document";
import type { EntitySpatialSnapshot } from "@web3d/runtime";

import { buildDuplicateSubtreeCommand, type StableIdFactory } from "../session/command-builders";
import { getSameParentCapability, type LayoutAnchor, type LayoutAxis } from "./layout-selection";
import {
  averageWorldPivot,
  boundsAnchorPosition,
  boundsAxisAnchor,
  combinedWorldBounds,
  exactTransformWhenWithinMatrixEpsilon,
  inferParentWorldMatrix,
  invertMatrix,
  localTransformForWorldMatrix,
  matrixFromSnapshot,
  matrixFromTransform,
  matrixResidual,
  MATRIX_RESIDUAL_EPSILON,
  translatedWorldMatrix,
  zeroVectorWithinMatrixEpsilon,
} from "./spatial-math";
import {
  LayoutPlanningError,
  type BoundsAnchorKind,
  type PlannedLayoutCommand,
  type SpatialFeedback,
} from "./types";

interface PlannerContext {
  readonly document: SceneDocument;
  readonly selectedEntityIds: readonly string[];
  readonly primaryEntityId: string | null;
  readonly snapshots: readonly EntitySpatialSnapshot[];
}

interface RequiredSelection {
  readonly roots: readonly SceneEntity[];
  readonly primaryRoot: SceneEntity;
  readonly snapshots: readonly EntitySpatialSnapshot[];
}

export function planCreateGroup(
  context: PlannerContext,
  group: { readonly id: string; readonly name: string },
): PlannedLayoutCommand {
  const selection = requireSelection(context, {
    minimum: 2,
    minimumFailure: "group-selection-minimum",
    requireUnlocked: true,
    requireVisible: true,
    requireBounds: true,
  });
  const bounds = combinedWorldBounds(selection.snapshots);
  const pivotWorld: Vec3 = [
    (bounds.min[0] + bounds.max[0]) / 2,
    (bounds.min[1] + bounds.max[1]) / 2,
    (bounds.min[2] + bounds.max[2]) / 2,
  ];
  const parentWorld = requireCommonParentWorld(selection.snapshots);
  const groupPosition = new Vector3(...pivotWorld).applyMatrix4(invertMatrix(parentWorld));
  const groupTransform = {
    position: [groupPosition.x, groupPosition.y, groupPosition.z],
    rotation: [0, 0, 0, 1],
    scale: [1, 1, 1],
  } as const;
  const groupWorld = parentWorld.clone().multiply(matrixFromTransform(groupTransform));
  const groupEntity: GroupEntity = {
    id: group.id,
    type: "group",
    parentId: selection.roots[0]!.parentId,
    name: group.name,
    visible: true,
    locked: false,
    transform: groupTransform,
    metadata: {},
  };
  const command: CreateGroupCommand = {
    type: "create-group",
    group: groupEntity,
    members: selection.roots.map((entity) => {
      const snapshot = snapshotFor(selection.snapshots, entity.id);
      return {
        entityId: entity.id,
        before: { parentId: entity.parentId, transform: entity.transform },
        after: {
          parentId: group.id,
          transform: localTransformForWorldMatrix(matrixFromSnapshot(snapshot), groupWorld),
        },
      };
    }),
  };
  return {
    command,
    nextSelection: { entityIds: [group.id], primaryEntityId: group.id },
    feedback: feedback("selection-bounds-center", pivotWorld, "free", [0, 0, 0]),
  };
}

export function planReparent(
  context: PlannerContext,
  destinationParentId: string | null,
): PlannedLayoutCommand {
  const selection = requireSelection(context, {
    minimum: 1,
    minimumFailure: "selection-required",
    requireUnlocked: true,
    requireVisible: false,
    requireBounds: false,
  });
  if (selection.roots[0]!.parentId === destinationParentId) {
    throw new LayoutPlanningError("target-current-parent");
  }
  const destination =
    destinationParentId === null
      ? null
      : context.document.entities.find((entity) => entity.id === destinationParentId);
  if (
    destinationParentId !== null &&
    (destination === null || destination === undefined || destination.type !== "group")
  ) {
    throw new LayoutPlanningError("target-invalid");
  }
  if (destination?.locked) throw new LayoutPlanningError("target-locked");
  if (
    destinationParentId !== null &&
    selection.roots.some(
      (root) =>
        root.id === destinationParentId ||
        isDescendant(context.document, root.id, destinationParentId),
    )
  ) {
    throw new LayoutPlanningError("target-cycle");
  }
  const destinationWorld =
    destinationParentId === null
      ? new Matrix4()
      : (() => {
          const destinationSnapshot = snapshotFor(context.snapshots, destinationParentId);
          validateSnapshot(context.document, destination!, destinationSnapshot);
          return matrixFromSnapshot(destinationSnapshot);
        })();
  const command: ReparentEntitiesCommand = {
    type: "reparent-entities",
    changes: selection.roots.map((entity) => ({
      entityId: entity.id,
      before: { parentId: entity.parentId, transform: entity.transform },
      after: {
        parentId: destinationParentId,
        transform: localTransformForWorldMatrix(
          matrixFromSnapshot(snapshotFor(selection.snapshots, entity.id)),
          destinationWorld,
        ),
      },
    })),
  };
  return {
    command,
    feedback: feedback("entity-origin", averageWorldPivot(selection.snapshots), "free", [0, 0, 0]),
  };
}

export function planAlign(
  context: PlannerContext,
  axis: LayoutAxis,
  anchor: LayoutAnchor,
): PlannedLayoutCommand {
  const selection = requireSelection(context, {
    minimum: 2,
    minimumFailure: "align-selection-minimum",
    requireUnlocked: true,
    requireVisible: true,
    requireBounds: true,
  });
  const axisIndex = axisToIndex(axis);
  const primarySnapshot = snapshotFor(selection.snapshots, selection.primaryRoot.id);
  const target = boundsAxisAnchor(primarySnapshot.worldBounds!, axisIndex, anchor);
  const changes = selection.roots.map((entity) => {
    const snapshot = snapshotFor(selection.snapshots, entity.id);
    const delta = target - boundsAxisAnchor(snapshot.worldBounds!, axisIndex, anchor);
    return transformChange(entity, snapshot, axisVector(axisIndex, delta));
  });
  const command: TransformEntitiesCommand = { type: "transform-entities", changes };
  const moved = changes.find((change) => !sameTransform(change.before, change.after));
  const movedSnapshot =
    moved === undefined ? null : snapshotFor(selection.snapshots, moved.entityId);
  const delta =
    moved === undefined || movedSnapshot === null
      ? ([0, 0, 0] as const)
      : worldPositionDelta(movedSnapshot, moved.after);
  const bounds = combinedWorldBounds(selection.snapshots);
  return {
    command,
    feedback: feedback(
      "selection-bounds-center",
      boundsAnchorPosition(bounds, "center"),
      axis,
      delta,
    ),
  };
}

export function planDistribute(context: PlannerContext, axis: LayoutAxis): PlannedLayoutCommand {
  const selection = requireSelection(context, {
    minimum: 3,
    minimumFailure: "distribute-selection-minimum",
    requireUnlocked: true,
    requireVisible: true,
    requireBounds: true,
  });
  const axisIndex = axisToIndex(axis);
  const ordered = [...selection.roots]
    .map((entity) => ({ entity, snapshot: snapshotFor(selection.snapshots, entity.id) }))
    .sort((left, right) => {
      const coordinateDelta =
        boundsAxisAnchor(left.snapshot.worldBounds!, axisIndex, "center") -
        boundsAxisAnchor(right.snapshot.worldBounds!, axisIndex, "center");
      return coordinateDelta || compareStableIds(left.entity.id, right.entity.id);
    });
  const firstBounds = ordered[0]!.snapshot.worldBounds!;
  const lastBounds = ordered.at(-1)!.snapshot.worldBounds!;
  const widths = ordered.map(
    ({ snapshot }) => snapshot.worldBounds!.max[axisIndex] - snapshot.worldBounds!.min[axisIndex],
  );
  const gap =
    (lastBounds.max[axisIndex] -
      firstBounds.min[axisIndex] -
      widths.reduce((sum, width) => sum + width, 0)) /
    (ordered.length - 1);
  let cursor = firstBounds.min[axisIndex] + widths[0]! + gap;
  const deltaById = new Map<string, number>([[ordered[0]!.entity.id, 0]]);
  for (let index = 1; index < ordered.length - 1; index += 1) {
    const item = ordered[index]!;
    deltaById.set(item.entity.id, cursor - item.snapshot.worldBounds!.min[axisIndex]);
    cursor += widths[index]! + gap;
  }
  deltaById.set(ordered.at(-1)!.entity.id, 0);
  const changes = selection.roots.map((entity) =>
    transformChange(
      entity,
      snapshotFor(selection.snapshots, entity.id),
      axisVector(axisIndex, deltaById.get(entity.id) ?? 0),
    ),
  );
  const command: TransformEntitiesCommand = { type: "transform-entities", changes };
  const firstMoved = changes.find((change) => !sameTransform(change.before, change.after));
  const delta =
    firstMoved === undefined
      ? ([0, 0, 0] as const)
      : worldPositionDelta(snapshotFor(selection.snapshots, firstMoved.entityId), firstMoved.after);
  return {
    command,
    feedback: feedback(
      "selection-bounds-center",
      boundsAnchorPosition(combinedWorldBounds(selection.snapshots), "center"),
      axis,
      delta,
    ),
  };
}

export function planDuplicateSubtrees(
  context: PlannerContext,
  offset: Vec3,
  ids: StableIdFactory,
): PlannedLayoutCommand {
  if (!offset.every(Number.isFinite)) throw new LayoutPlanningError("invalid-offset");
  const selection = requireSelection(context, {
    minimum: 1,
    minimumFailure: "selection-required",
    requireUnlocked: false,
    requireVisible: false,
    requireBounds: false,
  });
  const items = selection.roots.map((entity) => {
    const source = buildDuplicateSubtreeCommand(context.document, entity.id, ids);
    const snapshot = snapshotFor(selection.snapshots, entity.id);
    return {
      rootEntityId: entity.id,
      entityIdMap: source.entityIdMap,
      targetIdMap: source.targetIdMap,
      rootPlacement: {
        before: { parentId: entity.parentId, transform: entity.transform },
        after: {
          parentId: entity.parentId,
          transform: localTransformForWorldMatrix(
            translatedWorldMatrix(matrixFromSnapshot(snapshot), offset),
            inferParentWorldMatrix(snapshot),
          ),
        },
      },
    };
  });
  const command: DuplicateSubtreesCommand = { type: "duplicate-subtrees", items };
  const nextEntityIds = items
    .map((item) => item.entityIdMap[item.rootEntityId]!)
    .sort(compareStableIds);
  const primarySourceId = selection.primaryRoot.id;
  const primaryItem = items.find((item) => item.rootEntityId === primarySourceId)!;
  return {
    command,
    nextSelection: {
      entityIds: nextEntityIds,
      primaryEntityId: primaryItem.entityIdMap[primarySourceId]!,
    },
    feedback: feedback("entity-origin", averageWorldPivot(selection.snapshots), "free", offset),
  };
}

export function planBoundsAnchorSnap(
  context: PlannerContext,
  sourceAnchor: BoundsAnchorKind,
  targetEntityId: string,
  targetAnchor: BoundsAnchorKind,
): PlannedLayoutCommand {
  const selection = requireSelection(context, {
    minimum: 1,
    minimumFailure: "selection-required",
    requireUnlocked: true,
    requireVisible: true,
    requireBounds: true,
  });
  const source = selection.primaryRoot;
  if (source.id === targetEntityId) throw new LayoutPlanningError("source-target-same");
  const target = context.document.entities.find((entity) => entity.id === targetEntityId);
  if (target === undefined) throw new LayoutPlanningError("target-required");
  if (target.type === "light") throw new LayoutPlanningError("target-invalid");
  if (target.locked) throw new LayoutPlanningError("target-locked");
  const sourceSnapshot = snapshotFor(selection.snapshots, source.id);
  const targetSnapshot = snapshotFor(context.snapshots, target.id);
  validateSnapshot(context.document, target, targetSnapshot);
  if (!targetSnapshot.visible) throw new LayoutPlanningError("target-hidden");
  if (targetSnapshot.worldBounds === null) throw new LayoutPlanningError("bounds-unavailable");
  const sourcePosition = boundsAnchorPosition(sourceSnapshot.worldBounds!, sourceAnchor);
  const targetPosition = boundsAnchorPosition(targetSnapshot.worldBounds, targetAnchor);
  const delta: Vec3 = [
    targetPosition[0] - sourcePosition[0],
    targetPosition[1] - sourcePosition[1],
    targetPosition[2] - sourcePosition[2],
  ];
  const command: TransformEntitiesCommand = {
    type: "transform-entities",
    changes: [transformChange(source, sourceSnapshot, delta)],
  };
  return {
    command,
    feedback: feedback("entity-origin", sourcePosition, dominantAxis(delta), delta, {
      sourceAnchor: { entityId: source.id, anchorKind: sourceAnchor },
      targetAnchor: { entityId: target.id, anchorKind: targetAnchor },
    }),
  };
}

function requireSelection(
  context: PlannerContext,
  options: {
    readonly minimum: number;
    readonly minimumFailure:
      | "selection-required"
      | "group-selection-minimum"
      | "align-selection-minimum"
      | "distribute-selection-minimum";
    readonly requireUnlocked: boolean;
    readonly requireVisible: boolean;
    readonly requireBounds: boolean;
  },
): RequiredSelection {
  const capability = getSameParentCapability(context.document.entities, context.selectedEntityIds);
  if (capability.unsupportedEntityIds.length > 0) {
    throw new LayoutPlanningError("selection-unsupported");
  }
  if (capability.rootEntityIds.length < options.minimum) {
    throw new LayoutPlanningError(options.minimumFailure);
  }
  if (capability.missingEntityIds.length > 0) throw new LayoutPlanningError("selection-missing");
  if (!capability.hasSameParent) throw new LayoutPlanningError("mixed-parents");
  if (options.requireUnlocked && capability.lockedEntityIds.length > 0) {
    throw new LayoutPlanningError("selection-locked");
  }
  if (options.requireVisible && capability.hiddenEntityIds.length > 0) {
    throw new LayoutPlanningError("selection-hidden");
  }
  const roots = capability.rootEntityIds.map((entityId) => entityFor(context.document, entityId));
  const snapshots = roots.map((entity) => snapshotFor(context.snapshots, entity.id));
  for (let index = 0; index < roots.length; index += 1) {
    validateSnapshot(context.document, roots[index]!, snapshots[index]!);
    if (options.requireVisible && !snapshots[index]!.visible) {
      throw new LayoutPlanningError("selection-hidden");
    }
    if (options.requireBounds && snapshots[index]!.worldBounds === null) {
      throw new LayoutPlanningError("bounds-unavailable");
    }
  }
  return {
    roots,
    primaryRoot: resolvePrimaryRoot(context.document.entities, roots, context.primaryEntityId),
    snapshots,
  };
}

function validateSnapshot(
  document: SceneDocument,
  entity: SceneEntity,
  snapshot: EntitySpatialSnapshot,
): void {
  if (
    snapshot.documentId !== document.id ||
    snapshot.documentRevision !== document.revision ||
    snapshot.entityId !== entity.id ||
    snapshot.parentId !== entity.parentId ||
    snapshot.locked !== entity.locked ||
    !sameTransform(snapshot.localTransform, entity.transform)
  ) {
    throw new LayoutPlanningError("snapshot-stale");
  }
}

function requireCommonParentWorld(snapshots: readonly EntitySpatialSnapshot[]): Matrix4 {
  const first = inferParentWorldMatrix(snapshots[0]!);
  for (const snapshot of snapshots.slice(1)) {
    if (matrixResidual(first, inferParentWorldMatrix(snapshot)) > MATRIX_RESIDUAL_EPSILON) {
      throw new LayoutPlanningError("snapshot-stale");
    }
  }
  return first;
}

function transformChange(entity: SceneEntity, snapshot: EntitySpatialSnapshot, delta: Vec3) {
  const normalizedDelta = zeroVectorWithinMatrixEpsilon(delta);
  const after = localTransformForWorldMatrix(
    translatedWorldMatrix(matrixFromSnapshot(snapshot), normalizedDelta),
    inferParentWorldMatrix(snapshot),
  );
  return {
    entityId: entity.id,
    before: entity.transform,
    after: exactTransformWhenWithinMatrixEpsilon(entity.transform, after),
  };
}

function worldPositionDelta(
  snapshot: EntitySpatialSnapshot,
  after: SceneEntity["transform"],
): Vec3 {
  const beforePosition = new Vector3().setFromMatrixPosition(matrixFromSnapshot(snapshot));
  const afterWorld = inferParentWorldMatrix(snapshot).multiply(matrixFromTransform(after));
  const afterPosition = new Vector3().setFromMatrixPosition(afterWorld);
  return zeroVectorWithinMatrixEpsilon([
    afterPosition.x - beforePosition.x,
    afterPosition.y - beforePosition.y,
    afterPosition.z - beforePosition.z,
  ]);
}

function resolvePrimaryRoot(
  entities: readonly SceneEntity[],
  roots: readonly SceneEntity[],
  primaryEntityId: string | null,
): SceneEntity {
  const stableRoots = [...roots].sort((left, right) => compareStableIds(left.id, right.id));
  if (primaryEntityId === null) return stableRoots[0]!;
  const direct = stableRoots.find((entity) => entity.id === primaryEntityId);
  if (direct !== undefined) return direct;
  const rootIds = new Set(stableRoots.map((entity) => entity.id));
  const byId = new Map(entities.map((entity) => [entity.id, entity]));
  let current = byId.get(primaryEntityId);
  while (current?.parentId !== null && current?.parentId !== undefined) {
    if (rootIds.has(current.parentId)) return byId.get(current.parentId)!;
    current = byId.get(current.parentId);
  }
  return stableRoots[0]!;
}

function snapshotFor(
  snapshots: readonly EntitySpatialSnapshot[],
  entityId: string,
): EntitySpatialSnapshot {
  const snapshot = snapshots.find((candidate) => candidate.entityId === entityId);
  if (snapshot === undefined) throw new LayoutPlanningError("snapshot-unavailable");
  return snapshot;
}

function entityFor(document: SceneDocument, entityId: string): SceneEntity {
  const entity = document.entities.find((candidate) => candidate.id === entityId);
  if (entity === undefined) throw new LayoutPlanningError("selection-missing");
  return entity;
}

function isDescendant(document: SceneDocument, ancestorId: string, candidateId: string): boolean {
  const byId = new Map(document.entities.map((entity) => [entity.id, entity]));
  let current = byId.get(candidateId);
  while (current?.parentId !== null && current?.parentId !== undefined) {
    if (current.parentId === ancestorId) return true;
    current = byId.get(current.parentId);
  }
  return false;
}

function feedback(
  pivotKind: SpatialFeedback["pivotKind"],
  pivotWorld: Vec3,
  activeAxis: SpatialFeedback["activeAxis"],
  deltaPosition: Vec3,
  anchors: Pick<SpatialFeedback, "sourceAnchor" | "targetAnchor"> = {
    sourceAnchor: null,
    targetAnchor: null,
  },
): SpatialFeedback {
  return {
    activity: "active",
    pivotKind,
    pivotWorld,
    activeAxis,
    deltaPosition,
    deltaRotationRadians: 0,
    deltaScale: [0, 0, 0],
    settings: {
      translationSnap: null,
      rotationSnapRadians: null,
      scaleSnap: null,
    },
    ...anchors,
  };
}

function axisToIndex(axis: LayoutAxis): 0 | 1 | 2 {
  return axis === "x" ? 0 : axis === "y" ? 1 : 2;
}

function axisVector(axisIndex: 0 | 1 | 2, value: number): Vec3 {
  const output: [number, number, number] = [0, 0, 0];
  output[axisIndex] = value;
  return output;
}

function dominantAxis(delta: Vec3): LayoutAxis | "free" {
  const active = delta
    .map((value, index) => ({ value: Math.abs(value), axis: (["x", "y", "z"] as const)[index]! }))
    .filter((item) => item.value > 1e-9)
    .sort((left, right) => right.value - left.value);
  if (active.length === 0 || (active[1]?.value ?? 0) > 1e-9) return "free";
  return active[0]!.axis;
}

function sameTransform(left: SceneEntity["transform"], right: SceneEntity["transform"]): boolean {
  return (
    left.position.every((value, index) => value === right.position[index]) &&
    left.rotation.every((value, index) => value === right.rotation[index]) &&
    left.scale.every((value, index) => value === right.scale[index])
  );
}

function compareStableIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
