import { Box, Boxes, Eye, EyeOff, Lock, Unlock } from "lucide-react";

import type { SceneEntity } from "@web3d/document";

interface SceneTreeProps {
  readonly entities: readonly SceneEntity[];
  readonly selectedEntityIds: readonly string[];
  readonly editable: boolean;
  readonly onSelect: (entityId: string, extend: boolean) => void;
  readonly onVisibilityChange: (entityId: string, visible: boolean) => void;
  readonly onLockChange: (entityId: string, locked: boolean) => void;
}

export function SceneTree(props: SceneTreeProps) {
  const rows = sceneTreeRows(props.entities);
  return (
    <div aria-label="Scene tree" className="scene-tree" role="tree">
      {rows.map(({ entity, depth }) => {
        const selected = props.selectedEntityIds.includes(entity.id);
        const EntityIcon = entity.type === "group" ? Boxes : Box;
        return (
          <div
            aria-selected={selected}
            className={`tree-row ${selected ? "is-selected" : ""}`}
            data-entity-id={entity.id}
            data-testid={`tree-${entity.id}`}
            key={entity.id}
            role="treeitem"
            style={{ "--tree-depth": depth } as React.CSSProperties}
          >
            <button
              className="tree-select"
              type="button"
              onClick={(event) => props.onSelect(entity.id, event.shiftKey)}
            >
              <span className="tree-indent" />
              <EntityIcon size={14} />
              <span className="tree-name">{entity.name}</span>
            </button>
            <button
              aria-label={`${entity.visible ? "Hide" : "Show"} ${entity.name}`}
              className="tree-action"
              disabled={!props.editable}
              title={entity.visible ? "Hide" : "Show"}
              type="button"
              onClick={() => props.onVisibilityChange(entity.id, !entity.visible)}
            >
              {entity.visible ? <Eye size={13} /> : <EyeOff size={13} />}
            </button>
            <button
              aria-label={`${entity.locked ? "Unlock" : "Lock"} ${entity.name}`}
              className="tree-action"
              disabled={!props.editable}
              title={entity.locked ? "Unlock" : "Lock"}
              type="button"
              onClick={() => props.onLockChange(entity.id, !entity.locked)}
            >
              {entity.locked ? <Lock size={13} /> : <Unlock size={13} />}
            </button>
          </div>
        );
      })}
    </div>
  );
}

function sceneTreeRows(entities: readonly SceneEntity[]) {
  const byParent = new Map<string | null, SceneEntity[]>();
  for (const entity of entities) {
    const siblings = byParent.get(entity.parentId) ?? [];
    siblings.push(entity);
    byParent.set(entity.parentId, siblings);
  }
  for (const siblings of byParent.values()) {
    siblings.sort(
      (left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id),
    );
  }

  const rows: Array<{ entity: SceneEntity; depth: number }> = [];
  const append = (parentId: string | null, depth: number): void => {
    for (const entity of byParent.get(parentId) ?? []) {
      rows.push({ entity, depth });
      append(entity.id, depth + 1);
    }
  };
  append(null, 0);
  return rows;
}
