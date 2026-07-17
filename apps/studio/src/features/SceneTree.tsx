import { useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent } from "react";
import { Box, Boxes, Eye, EyeOff, Lightbulb, Lock, Unlock, Zap } from "lucide-react";

import type { SceneEntity } from "@web3d/document";

import { useStudioI18n } from "../i18n/I18nProvider";
import type { SelectionOperation } from "../session/session-state";
import {
  buildSceneTree,
  flattenSceneTree,
  sceneTreeFocusTarget,
  sceneTreeSelectionOperation,
  type SceneTreeNavigationKey,
  type SceneTreeNode,
} from "./scene-tree-model";

interface SceneTreeProps {
  readonly entities: readonly SceneEntity[];
  readonly selectedEntityIds: readonly string[];
  readonly primaryEntityId: string | null;
  readonly editable: boolean;
  readonly onSelect: (entityId: string, operation: SelectionOperation) => void;
  readonly onVisibilityChange: (entityId: string, visible: boolean) => void;
  readonly onLockChange: (entityId: string, locked: boolean) => void;
}

export function SceneTree(props: SceneTreeProps) {
  const { t } = useStudioI18n();
  const roots = buildSceneTree(props.entities);
  const orderedNodes = flattenSceneTree(roots);
  const orderedEntityIds = orderedNodes.map((node) => node.entity.id);
  const itemRefs = useRef(new Map<string, HTMLDivElement>());
  const [requestedFocusId, setRequestedFocusId] = useState<string | null>(null);
  const focusedEntityId = resolveFocusedEntityId(
    orderedEntityIds,
    requestedFocusId,
    props.primaryEntityId,
  );

  const focusItem = (entityId: string): void => {
    setRequestedFocusId(entityId);
    itemRefs.current.get(entityId)?.focus();
  };

  const selectItem = (entityId: string, operation: SelectionOperation): void => {
    focusItem(entityId);
    props.onSelect(entityId, operation);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>, entityId: string): void => {
    if (event.target !== event.currentTarget) return;
    if (isNavigationKey(event.key)) {
      event.preventDefault();
      const target = sceneTreeFocusTarget(orderedEntityIds, entityId, event.key);
      if (target !== null) focusItem(target);
      return;
    }
    if (event.key !== " ") return;
    event.preventDefault();
    selectItem(entityId, event.ctrlKey || event.metaKey || event.shiftKey ? "toggle" : "replace");
  };

  const renderNode = (node: SceneTreeNode): React.ReactNode => {
    const { entity } = node;
    const selected = props.selectedEntityIds.includes(entity.id);
    const primary = props.primaryEntityId === entity.id;
    const EntityIcon =
      entity.type === "group"
        ? Boxes
        : entity.type === "light"
          ? entity.light.kind === "point"
            ? Lightbulb
            : Zap
          : Box;
    return (
      <div
        aria-expanded={node.children.length > 0 ? true : undefined}
        aria-label={t.sceneTree.itemLabel(entity.name, primary)}
        aria-level={node.level}
        aria-selected={selected}
        data-entity-id={entity.id}
        data-entity-type={entity.type === "light" ? entity.light.kind : entity.type}
        data-testid={`tree-${entity.id}`}
        key={entity.id}
        ref={(item) => {
          if (item === null) itemRefs.current.delete(entity.id);
          else itemRefs.current.set(entity.id, item);
        }}
        role="treeitem"
        tabIndex={focusedEntityId === entity.id ? 0 : -1}
        onKeyDown={(event) => handleKeyDown(event, entity.id)}
      >
        <div className={`tree-row ${selected ? "is-selected" : ""}`}>
          <div
            className="tree-select"
            style={{ "--tree-depth": node.level - 1 } as CSSProperties}
            onClick={(event: MouseEvent<HTMLDivElement>) =>
              selectItem(entity.id, sceneTreeSelectionOperation(event))
            }
          >
            <span className="tree-indent" />
            <EntityIcon size={14} />
            <span className="tree-name">{entity.name}</span>
          </div>
          <button
            aria-label={t.sceneTree.visibilityAction(entity.visible, entity.name)}
            className="tree-action"
            disabled={!props.editable}
            title={entity.visible ? t.sceneTree.hide : t.sceneTree.show}
            type="button"
            onClick={() => props.onVisibilityChange(entity.id, !entity.visible)}
          >
            {entity.visible ? <Eye size={13} /> : <EyeOff size={13} />}
          </button>
          <button
            aria-label={t.sceneTree.lockAction(entity.locked, entity.name)}
            className="tree-action"
            disabled={!props.editable}
            title={entity.locked ? t.sceneTree.unlock : t.sceneTree.lock}
            type="button"
            onClick={() => props.onLockChange(entity.id, !entity.locked)}
          >
            {entity.locked ? <Lock size={13} /> : <Unlock size={13} />}
          </button>
        </div>
        {node.children.length > 0 && (
          <div role="group" className="tree-children">
            {node.children.map(renderNode)}
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      aria-label={t.sceneTree.ariaLabel}
      aria-multiselectable="true"
      className="scene-tree"
      role="tree"
    >
      {roots.map(renderNode)}
    </div>
  );
}

function resolveFocusedEntityId(
  orderedEntityIds: readonly string[],
  requestedFocusId: string | null,
  primaryEntityId: string | null,
): string | null {
  if (requestedFocusId !== null && orderedEntityIds.includes(requestedFocusId)) {
    return requestedFocusId;
  }
  if (primaryEntityId !== null && orderedEntityIds.includes(primaryEntityId)) {
    return primaryEntityId;
  }
  return orderedEntityIds[0] ?? null;
}

function isNavigationKey(key: string): key is SceneTreeNavigationKey {
  return key === "ArrowUp" || key === "ArrowDown" || key === "Home" || key === "End";
}
