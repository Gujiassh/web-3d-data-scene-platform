import type { SceneEntity } from "@web3d/document";

import type { SelectionOperation } from "../session/session-state";

export interface SceneTreeNode {
  readonly entity: SceneEntity;
  readonly level: number;
  readonly children: readonly SceneTreeNode[];
}

export type SceneTreeNavigationKey = "ArrowUp" | "ArrowDown" | "Home" | "End";

export function buildSceneTree(entities: readonly SceneEntity[]): readonly SceneTreeNode[] {
  const byParent = new Map<string | null, SceneEntity[]>();
  for (const entity of entities) {
    const siblings = byParent.get(entity.parentId) ?? [];
    siblings.push(entity);
    byParent.set(entity.parentId, siblings);
  }
  for (const siblings of byParent.values()) {
    siblings.sort(
      (left, right) => left.name.localeCompare(right.name) || compareStableIds(left.id, right.id),
    );
  }

  const buildLevel = (parentId: string | null, level: number): readonly SceneTreeNode[] =>
    (byParent.get(parentId) ?? []).map((entity) => ({
      entity,
      level,
      children: buildLevel(entity.id, level + 1),
    }));

  return buildLevel(null, 1);
}

export function flattenSceneTree(nodes: readonly SceneTreeNode[]): readonly SceneTreeNode[] {
  const flattened: SceneTreeNode[] = [];
  const append = (items: readonly SceneTreeNode[]): void => {
    for (const item of items) {
      flattened.push(item);
      append(item.children);
    }
  };
  append(nodes);
  return flattened;
}

export function sceneTreeSelectionOperation(modifiers: {
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
}): SelectionOperation {
  return modifiers.ctrlKey || modifiers.metaKey || modifiers.shiftKey ? "toggle" : "replace";
}

export function sceneTreeFocusTarget(
  orderedEntityIds: readonly string[],
  currentEntityId: string,
  key: SceneTreeNavigationKey,
): string | null {
  if (orderedEntityIds.length === 0) return null;
  if (key === "Home") return orderedEntityIds[0]!;
  if (key === "End") return orderedEntityIds.at(-1)!;

  const currentIndex = orderedEntityIds.indexOf(currentEntityId);
  const safeIndex = currentIndex < 0 ? 0 : currentIndex;
  const nextIndex = key === "ArrowUp" ? Math.max(0, safeIndex - 1) : safeIndex + 1;
  return orderedEntityIds[Math.min(nextIndex, orderedEntityIds.length - 1)]!;
}

function compareStableIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
