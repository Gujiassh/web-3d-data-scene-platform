import { useEffect, useRef } from "react";
import { Eye, EyeOff, LockKeyhole, MapPin, MoreHorizontal, Plus } from "lucide-react";

import type { HotspotScreenAnchor } from "@web3d/runtime";

import { useStudioI18n } from "../i18n/I18nProvider";
import type { HotspotListItem, StudioHotspots } from "./useStudioHotspots";

interface HotspotsPanelProps {
  readonly hotspots: StudioHotspots;
}

export function HotspotsPanel({ hotspots }: HotspotsPanelProps) {
  const { t } = useStudioI18n();
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());
  const visibleIds = hotspots.items.map((item) => item.annotation.id);
  const focusableIds = hotspots.items.flatMap((item) =>
    hotspots.mode === "run" && item.state.resolution === "unresolved" ? [] : [item.annotation.id],
  );
  const visibleIdsKey = visibleIds.join("\u0000");

  useEffect(() => {
    const id = hotspots.selectedId;
    if (id !== null && !visibleIds.includes(id)) hotspots.clearSelection();
  }, [hotspots, visibleIds]);

  useEffect(() => {
    const request = hotspots.focusRequest;
    if (request === null) return;
    const target =
      request.target === "add" ? addButtonRef.current : rowRefs.current.get(request.annotationId);
    if (target === null || target === undefined) return;
    target.focus();
    hotspots.clearFocusRequest(request.sequence);
  }, [hotspots, visibleIdsKey]);

  const moveFocus = (currentId: string, key: string): void => {
    const index = focusableIds.indexOf(currentId);
    if (index < 0 || focusableIds.length === 0) return;
    const destination =
      key === "Home"
        ? 0
        : key === "End"
          ? focusableIds.length - 1
          : key === "ArrowDown"
            ? Math.min(focusableIds.length - 1, index + 1)
            : key === "ArrowUp"
              ? Math.max(0, index - 1)
              : null;
    if (destination !== null) rowRefs.current.get(focusableIds[destination]!)?.focus();
  };

  return (
    <section className="hotspots-panel" aria-label={t.hotspots.list.ariaLabel}>
      <header>
        <strong>{t.hotspots.list.title}</strong>
        <span>{hotspots.items.length}</span>
        {hotspots.mode === "edit" && (
          <button
            ref={addButtonRef}
            aria-label={t.hotspots.add}
            className="hotspot-add-button"
            disabled={hotspots.placementActive}
            title={t.hotspots.addShortcut}
            type="button"
            onClick={hotspots.startPlacement}
          >
            <Plus size={15} />
          </button>
        )}
      </header>
      {hotspots.items.length === 0 ? (
        <p className="hotspots-empty">{t.hotspots.list.empty}</p>
      ) : (
        <div
          className="hotspot-rows"
          role="listbox"
          aria-label={t.hotspots.list.ariaLabel}
          tabIndex={focusableIds.length === 0 ? 0 : undefined}
        >
          {hotspots.items.map((item) => (
            <HotspotRow
              item={item}
              key={item.annotation.id}
              mode={hotspots.mode}
              selected={hotspots.selectedId === item.annotation.id}
              tabIndex={
                hotspots.selectedId === item.annotation.id ||
                (hotspots.selectedId === null && item.annotation.id === focusableIds[0])
                  ? 0
                  : -1
              }
              setRef={(element) => {
                if (element === null) rowRefs.current.delete(item.annotation.id);
                else rowRefs.current.set(item.annotation.id, element);
              }}
              onActivate={(anchor) => {
                if (hotspots.mode === "run") hotspots.activate(item.annotation.id);
                else hotspots.select(item.annotation.id, true, anchor);
              }}
              onDelete={() => {
                if (hotspots.mode === "edit") hotspots.remove(item.annotation.id);
              }}
              onFocus={() => hotspots.select(item.annotation.id)}
              onKeyMove={(key) => moveFocus(item.annotation.id, key)}
              onOpenActions={(anchor) => hotspots.select(item.annotation.id, true, anchor)}
              onRename={(anchor) => {
                if (hotspots.mode === "edit") hotspots.startRename(item.annotation.id, anchor);
              }}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function HotspotRow({
  item,
  mode,
  selected,
  tabIndex,
  setRef,
  onActivate,
  onDelete,
  onFocus,
  onKeyMove,
  onOpenActions,
  onRename,
}: {
  readonly item: HotspotListItem;
  readonly mode: StudioHotspots["mode"];
  readonly selected: boolean;
  readonly tabIndex: number;
  readonly setRef: (element: HTMLButtonElement | null) => void;
  readonly onActivate: (anchor: HotspotScreenAnchor) => void;
  readonly onDelete: () => void;
  readonly onFocus: () => void;
  readonly onKeyMove: (key: string) => void;
  readonly onOpenActions: (anchor: HotspotScreenAnchor) => void;
  readonly onRename: (anchor: HotspotScreenAnchor) => void;
}) {
  const { t } = useStudioI18n();
  const unavailable = item.state.resolution === "unresolved";
  const runDisabled = mode === "run" && unavailable;
  const unavailableCopy =
    item.state.resolution === "unresolved" && item.state.unresolvedReason !== null
      ? t.hotspots.list.unresolvedReasons[item.state.unresolvedReason]
      : t.hotspots.list.unresolved;
  return (
    <div className={`hotspot-row ${selected ? "is-selected" : ""}`}>
      <button
        ref={setRef}
        aria-selected={selected}
        className="hotspot-row-main"
        disabled={runDisabled}
        role="option"
        tabIndex={tabIndex}
        type="button"
        onClick={(event) => onActivate(rowAnchor(event.currentTarget))}
        onFocus={onFocus}
        onKeyDown={(event) => {
          if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
            event.preventDefault();
            event.stopPropagation();
            onKeyMove(event.key);
            return;
          }
          if (event.key === "Enter") {
            event.preventDefault();
            event.stopPropagation();
            onActivate(rowAnchor(event.currentTarget));
            return;
          }
          if (event.key === "F2" && mode === "edit") {
            event.preventDefault();
            event.stopPropagation();
            onRename(rowAnchor(event.currentTarget));
            return;
          }
          if (event.key === "Delete" && mode === "edit") {
            event.preventDefault();
            event.stopPropagation();
            onDelete();
          }
        }}
      >
        <MapPin size={14} />
        <span>
          <strong>{item.annotation.title}</strong>
          {unavailable && <small>{unavailableCopy}</small>}
        </span>
        {!item.annotation.visible ? (
          <EyeOff aria-label={t.hotspots.list.hidden} size={13} />
        ) : (
          <Eye aria-hidden="true" size={13} />
        )}
        {item.annotation.locked && <LockKeyhole aria-label={t.hotspots.list.locked} size={13} />}
      </button>
      {mode === "edit" && (
        <button
          aria-label={t.hotspots.list.actions(item.annotation.title)}
          className="hotspot-row-actions"
          title={t.hotspots.actions.more}
          type="button"
          onClick={(event) => onOpenActions(rowAnchor(event.currentTarget))}
        >
          <MoreHorizontal size={14} />
        </button>
      )}
    </div>
  );
}

function rowAnchor(element: HTMLElement): HotspotScreenAnchor {
  const bounds = element.closest<HTMLElement>(".hotspot-row")?.getBoundingClientRect();
  if (bounds === undefined) {
    const ownBounds = element.getBoundingClientRect();
    return { clientX: ownBounds.right, clientY: ownBounds.top + ownBounds.height / 2 };
  }
  return { clientX: bounds.right, clientY: bounds.top + bounds.height / 2 };
}
