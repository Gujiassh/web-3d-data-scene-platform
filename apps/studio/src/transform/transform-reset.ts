import type {
  SceneDocument,
  SceneEntity,
  Transform,
  TransformEntitiesCommand,
} from "@web3d/document";

import { normalizeSelectedRoots } from "../layout/layout-selection";

export type TransformResetComponent = "position" | "rotation" | "scale" | "all";

export type TransformResetFailure =
  "selection-required" | "selection-missing" | "selection-locked" | "selection-hidden";

export class TransformResetError extends Error {
  constructor(readonly code: TransformResetFailure) {
    super(code);
  }
}

export type TransformResetCapability =
  | { readonly enabled: true; readonly reason: null }
  | { readonly enabled: false; readonly reason: TransformResetFailure | "run-disabled" };

export function getTransformResetCapability(
  document: SceneDocument | null,
  selectedEntityIds: readonly string[],
  editable: boolean,
): TransformResetCapability {
  if (!editable) return { enabled: false, reason: "run-disabled" };
  try {
    requireResetRoots(document, selectedEntityIds);
    return { enabled: true, reason: null };
  } catch (error) {
    return {
      enabled: false,
      reason: error instanceof TransformResetError ? error.code : "selection-missing",
    };
  }
}

export function canEditEntityTransform(
  document: SceneDocument | null,
  entityId: string | null,
  editable: boolean,
): boolean {
  if (!editable || document === null || entityId === null) return false;
  const byId = new Map(document.entities.map((entity) => [entity.id, entity]));
  const entity = byId.get(entityId);
  return entity !== undefined && !entity.locked && isEffectivelyVisible(entity, byId);
}

export function planTransformReset(
  document: SceneDocument,
  selectedEntityIds: readonly string[],
  component: TransformResetComponent,
): TransformEntitiesCommand {
  const roots = requireResetRoots(document, selectedEntityIds);
  return {
    type: "transform-entities",
    changes: roots.map((entity) => ({
      entityId: entity.id,
      before: entity.transform,
      after: resetTransformComponent(entity.transform, component),
    })),
  };
}

export function resetTransformComponent(
  transform: Transform,
  component: TransformResetComponent,
): Transform {
  return {
    position: component === "position" || component === "all" ? [0, 0, 0] : transform.position,
    rotation: component === "rotation" || component === "all" ? [0, 0, 0, 1] : transform.rotation,
    scale: component === "scale" || component === "all" ? [1, 1, 1] : transform.scale,
  };
}

function requireResetRoots(
  document: SceneDocument | null,
  selectedEntityIds: readonly string[],
): readonly SceneEntity[] {
  if (document === null) throw new TransformResetError("selection-missing");
  const byId = new Map(document.entities.map((entity) => [entity.id, entity]));
  if (selectedEntityIds.some((entityId) => !byId.has(entityId))) {
    throw new TransformResetError("selection-missing");
  }
  const rootIds = normalizeSelectedRoots(document.entities, selectedEntityIds);
  if (rootIds.length === 0) throw new TransformResetError("selection-required");
  const roots = rootIds.map((entityId) => byId.get(entityId)!);
  if (roots.some((entity) => entity.locked)) throw new TransformResetError("selection-locked");
  if (roots.some((entity) => !isEffectivelyVisible(entity, byId))) {
    throw new TransformResetError("selection-hidden");
  }
  return roots;
}

function isEffectivelyVisible(
  entity: SceneEntity,
  byId: ReadonlyMap<string, SceneEntity>,
): boolean {
  const visited = new Set<string>();
  let current: SceneEntity | undefined = entity;
  while (current !== undefined) {
    if (!current.visible) return false;
    if (current.parentId === null) return true;
    if (visited.has(current.id)) return false;
    visited.add(current.id);
    current = byId.get(current.parentId);
  }
  return false;
}
