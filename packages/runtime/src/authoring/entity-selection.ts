export interface EntitySelection {
  readonly entityIds: readonly string[];
  readonly primaryEntityId: string | null;
}

export const EMPTY_ENTITY_SELECTION: EntitySelection = Object.freeze({
  entityIds: Object.freeze([]),
  primaryEntityId: null,
});

export function normalizeEntitySelection(
  entityIds: readonly string[],
  primaryEntityId: string | null,
): EntitySelection {
  const normalizedIds = [...new Set(entityIds)].sort(compareIds);
  if (normalizedIds.length === 0) {
    if (primaryEntityId !== null) {
      throw new Error("The primary entity must belong to the selection.");
    }
    return EMPTY_ENTITY_SELECTION;
  }
  if (primaryEntityId === null || !normalizedIds.includes(primaryEntityId)) {
    throw new Error("The primary entity must belong to the selection.");
  }
  return Object.freeze({
    entityIds: Object.freeze(normalizedIds),
    primaryEntityId,
  });
}

export function retainEntitySelection(
  selection: EntitySelection,
  hasEntity: (entityId: string) => boolean,
): EntitySelection {
  const entityIds = selection.entityIds.filter(hasEntity);
  if (entityIds.length === 0) return EMPTY_ENTITY_SELECTION;
  const primaryEntityId =
    selection.primaryEntityId !== null && hasEntity(selection.primaryEntityId)
      ? selection.primaryEntityId
      : (entityIds[0] ?? null);
  return normalizeEntitySelection(entityIds, primaryEntityId);
}

export function sameEntitySelection(left: EntitySelection, right: EntitySelection): boolean {
  return (
    left.primaryEntityId === right.primaryEntityId &&
    left.entityIds.length === right.entityIds.length &&
    left.entityIds.every((entityId, index) => entityId === right.entityIds[index])
  );
}

export function normalizeEntityIds(entityIds: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(entityIds)].sort(compareIds));
}

function compareIds(left: string, right: string): number {
  return left.localeCompare(right, "en");
}
