import type { SceneEntity } from "@web3d/document";

export const LAYOUT_AXES = ["x", "y", "z"] as const;
export type LayoutAxis = (typeof LAYOUT_AXES)[number];

export const LAYOUT_ANCHORS = ["min", "center", "max"] as const;
export type LayoutAnchor = (typeof LAYOUT_ANCHORS)[number];

export interface SameParentCapability {
  readonly rootEntityIds: readonly string[];
  readonly missingEntityIds: readonly string[];
  readonly hasSameParent: boolean;
  readonly parentId: string | null;
  readonly lockedEntityIds: readonly string[];
  readonly hiddenEntityIds: readonly string[];
  readonly canEditHierarchy: boolean;
  readonly canUseBounds: boolean;
}

export function normalizeSelectedRoots(
  entities: readonly SceneEntity[],
  selectedEntityIds: readonly string[],
): readonly string[] {
  const byId = new Map(entities.map((entity) => [entity.id, entity]));
  const selectedIds = sortStableIds(
    [...new Set(selectedEntityIds)].filter((entityId) => byId.has(entityId)),
  );
  const selected = new Set(selectedIds);

  return selectedIds.filter((entityId) => {
    const visited = new Set([entityId]);
    let parentId = byId.get(entityId)?.parentId ?? null;
    while (parentId !== null && !visited.has(parentId)) {
      if (selected.has(parentId)) return false;
      visited.add(parentId);
      parentId = byId.get(parentId)?.parentId ?? null;
    }
    return true;
  });
}

export function getSameParentCapability(
  entities: readonly SceneEntity[],
  selectedEntityIds: readonly string[],
): SameParentCapability {
  const byId = new Map(entities.map((entity) => [entity.id, entity]));
  const uniqueSelectedIds = sortStableIds([...new Set(selectedEntityIds)]);
  const missingEntityIds = uniqueSelectedIds.filter((entityId) => !byId.has(entityId));
  const rootEntityIds = normalizeSelectedRoots(entities, uniqueSelectedIds);
  const roots = rootEntityIds.flatMap((entityId) => {
    const entity = byId.get(entityId);
    return entity === undefined ? [] : [entity];
  });
  const firstParentId = roots[0]?.parentId ?? null;
  const hasSameParent =
    roots.length > 0 && roots.every((entity) => entity.parentId === firstParentId);
  const lockedEntityIds = roots.filter((entity) => entity.locked).map((entity) => entity.id);
  const hiddenEntityIds = roots.filter((entity) => !entity.visible).map((entity) => entity.id);
  const hasValidSelection =
    rootEntityIds.length > 0 && missingEntityIds.length === 0 && hasSameParent;

  return {
    rootEntityIds,
    missingEntityIds,
    hasSameParent,
    parentId: hasSameParent ? firstParentId : null,
    lockedEntityIds,
    hiddenEntityIds,
    canEditHierarchy: hasValidSelection && lockedEntityIds.length === 0,
    canUseBounds: hasValidSelection && lockedEntityIds.length === 0 && hiddenEntityIds.length === 0,
  };
}

function sortStableIds(ids: readonly string[]): readonly string[] {
  return [...ids].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
}
