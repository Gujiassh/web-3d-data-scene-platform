import type { SceneDocument, SceneEntity } from "@web3d/document";
import type { EntitySpatialSnapshot } from "@web3d/runtime";

import { getSameParentCapability } from "./layout-selection";
import type { LayoutActionState, LayoutFailureCode } from "./types";

export interface LayoutCapabilities {
  readonly group: LayoutActionState;
  readonly reparent: LayoutActionState;
  readonly align: LayoutActionState;
  readonly distribute: LayoutActionState;
  readonly duplicate: LayoutActionState;
  readonly anchorSnap: LayoutActionState;
}

export function deriveLayoutCapabilities(input: {
  readonly document: SceneDocument;
  readonly selectedEntityIds: readonly string[];
  readonly primaryEntityId: string | null;
  readonly snapshots: readonly EntitySpatialSnapshot[];
  readonly editable: boolean;
  readonly reparentTargetId: string | null;
  readonly anchorTargetId: string | null;
  readonly duplicateOffsetValid: boolean;
}): LayoutCapabilities {
  if (!input.editable) {
    const disabled = action("run-disabled");
    return {
      group: disabled,
      reparent: disabled,
      align: disabled,
      distribute: disabled,
      duplicate: disabled,
      anchorSnap: disabled,
    };
  }
  const selection = getSameParentCapability(input.document.entities, input.selectedEntityIds);
  const common = commonSelectionReason(selection);
  const fresh = snapshotReason(input.document, selection.rootEntityIds, input.snapshots, false);
  const freshBounds = snapshotReason(
    input.document,
    selection.rootEntityIds,
    input.snapshots,
    true,
  );
  const locked = selection.lockedEntityIds.length > 0 ? "selection-locked" : null;
  const hidden = effectiveSelectionVisibilityReason(
    input.document,
    selection.rootEntityIds,
    input.snapshots,
  );
  const groupReason =
    selection.rootEntityIds.length < 2
      ? "group-selection-minimum"
      : (common ?? locked ?? hidden ?? freshBounds);
  const alignReason =
    selection.rootEntityIds.length < 2
      ? "align-selection-minimum"
      : (common ?? locked ?? hidden ?? freshBounds);
  const distributeReason =
    selection.rootEntityIds.length < 3
      ? "distribute-selection-minimum"
      : (common ?? locked ?? hidden ?? freshBounds);
  const reparentReason =
    selection.rootEntityIds.length < 1
      ? "selection-required"
      : (common ?? locked ?? reparentTargetReason(input, selection.rootEntityIds) ?? fresh);
  const duplicateReason =
    selection.rootEntityIds.length < 1
      ? "selection-required"
      : (common ?? fresh ?? (input.duplicateOffsetValid ? null : "invalid-offset"));
  const anchorReason = anchorSnapReason(input, selection.rootEntityIds, locked, hidden);
  return {
    group: action(groupReason),
    reparent: action(reparentReason),
    align: action(alignReason),
    distribute: action(distributeReason),
    duplicate: action(duplicateReason),
    anchorSnap: action(anchorReason),
  };
}

function commonSelectionReason(
  selection: ReturnType<typeof getSameParentCapability>,
): LayoutFailureCode | null {
  if (selection.missingEntityIds.length > 0) return "selection-missing";
  if (selection.rootEntityIds.length === 0) return "selection-required";
  return selection.hasSameParent ? null : "mixed-parents";
}

function reparentTargetReason(
  input: Parameters<typeof deriveLayoutCapabilities>[0],
  rootEntityIds: readonly string[],
): LayoutFailureCode | null {
  const roots = rootEntityIds.map((id) =>
    input.document.entities.find((entity) => entity.id === id)!,
  );
  if (roots[0]?.parentId === input.reparentTargetId) return "target-current-parent";
  if (input.reparentTargetId === null) return null;
  const target = input.document.entities.find((entity) => entity.id === input.reparentTargetId);
  if (target === undefined || target.type !== "group") return "target-invalid";
  if (target.locked) return "target-locked";
  if (
    roots.some(
      (root) => root.id === target.id || isDescendant(input.document.entities, root.id, target.id),
    )
  ) {
    return "target-cycle";
  }
  return snapshotReason(input.document, [target.id], input.snapshots, false);
}

function anchorSnapReason(
  input: Parameters<typeof deriveLayoutCapabilities>[0],
  rootEntityIds: readonly string[],
  locked: LayoutFailureCode | null,
  hidden: LayoutFailureCode | null,
): LayoutFailureCode | null {
  if (rootEntityIds.length === 0 || input.primaryEntityId === null) return "selection-required";
  if (locked !== null) return locked;
  if (hidden !== null) return hidden;
  const sourceId = primaryRootId(input.document.entities, rootEntityIds, input.primaryEntityId);
  const sourceSnapshotReason = snapshotReason(input.document, [sourceId], input.snapshots, true);
  if (sourceSnapshotReason !== null) return sourceSnapshotReason;
  if (input.anchorTargetId === null) return "target-required";
  if (input.anchorTargetId === sourceId) return "source-target-same";
  const target = input.document.entities.find((entity) => entity.id === input.anchorTargetId);
  if (target === undefined) return "target-required";
  if (target.locked) return "target-locked";
  const targetSnapshotReason = snapshotReason(input.document, [target.id], input.snapshots, true);
  if (targetSnapshotReason !== null) return targetSnapshotReason;
  const targetSnapshot = input.snapshots.find((snapshot) => snapshot.entityId === target.id)!;
  return targetSnapshot.visible ? null : "target-hidden";
}

function snapshotReason(
  document: SceneDocument,
  entityIds: readonly string[],
  snapshots: readonly EntitySpatialSnapshot[],
  requireBounds: boolean,
): LayoutFailureCode | null {
  for (const entityId of entityIds) {
    const entity = document.entities.find((candidate) => candidate.id === entityId);
    const snapshot = snapshots.find((candidate) => candidate.entityId === entityId);
    if (entity === undefined) return "selection-missing";
    if (snapshot === undefined) return "snapshot-unavailable";
    if (
      snapshot.documentId !== document.id ||
      snapshot.documentRevision !== document.revision ||
      snapshot.parentId !== entity.parentId ||
      snapshot.locked !== entity.locked
    ) {
      return "snapshot-stale";
    }
    if (requireBounds && snapshot.worldBounds === null) return "bounds-unavailable";
  }
  return null;
}

function effectiveSelectionVisibilityReason(
  document: SceneDocument,
  entityIds: readonly string[],
  snapshots: readonly EntitySpatialSnapshot[],
): LayoutFailureCode | null {
  const freshness = snapshotReason(document, entityIds, snapshots, false);
  if (freshness !== null) return freshness;
  return entityIds.some(
    (entityId) => !snapshots.find((snapshot) => snapshot.entityId === entityId)!.visible,
  )
    ? "selection-hidden"
    : null;
}

function primaryRootId(
  entities: readonly SceneEntity[],
  rootEntityIds: readonly string[],
  primaryEntityId: string,
): string {
  if (rootEntityIds.includes(primaryEntityId)) return primaryEntityId;
  const roots = new Set(rootEntityIds);
  const byId = new Map(entities.map((entity) => [entity.id, entity]));
  let current = byId.get(primaryEntityId);
  while (current?.parentId !== null && current?.parentId !== undefined) {
    if (roots.has(current.parentId)) return current.parentId;
    current = byId.get(current.parentId);
  }
  return rootEntityIds[0]!;
}

function isDescendant(entities: readonly SceneEntity[], ancestorId: string, candidateId: string) {
  const byId = new Map(entities.map((entity) => [entity.id, entity]));
  let current = byId.get(candidateId);
  while (current?.parentId !== null && current?.parentId !== undefined) {
    if (current.parentId === ancestorId) return true;
    current = byId.get(current.parentId);
  }
  return false;
}

function action(reason: LayoutFailureCode | null): LayoutActionState {
  return { enabled: reason === null, reason };
}
