import { useEffect, useRef, type Ref } from "react";
import { Lightbulb, Plus, Zap } from "lucide-react";

import { useStudioI18n } from "../i18n/I18nProvider";
import type { StudioLightKind } from "./model";
import "./light-authoring.css";

interface LightingMenuProps {
  readonly open: boolean;
  readonly lightCount: number;
  readonly addDisabledReason: string | null;
  readonly buttonRef?: Ref<HTMLButtonElement>;
  readonly onAdd: (kind: StudioLightKind) => boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onRefreshAvailability: () => void;
}

export function LightingMenu(props: LightingMenuProps) {
  const { t } = useStudioI18n();
  const { open, onOpenChange } = props;
  const anchorRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => firstMenuItem(menuRef.current)?.focus());
    const ownerDocument = anchorRef.current?.ownerDocument ?? document;
    const closeOutside = (event: PointerEvent): void => {
      if (anchorRef.current?.contains(event.target as Node) === true) return;
      onOpenChange(false);
      triggerRef.current?.focus();
    };
    ownerDocument.addEventListener("pointerdown", closeOutside);
    return () => {
      cancelAnimationFrame(frame);
      ownerDocument.removeEventListener("pointerdown", closeOutside);
    };
  }, [open, onOpenChange]);

  const close = (restoreFocus: boolean): void => {
    props.onOpenChange(false);
    if (restoreFocus) requestAnimationFrame(() => triggerRef.current?.focus());
  };
  const add = (kind: StudioLightKind): void => {
    if (props.addDisabledReason !== null) return;
    if (props.onAdd(kind)) close(false);
  };

  return (
    <div className="lighting-menu-anchor" ref={anchorRef}>
      <button
        ref={(button) => {
          triggerRef.current = button;
          assignRef(props.buttonRef, button);
        }}
        aria-controls="studio-lighting-menu"
        aria-expanded={props.open}
        aria-haspopup="menu"
        aria-label={t.lights.menu.trigger}
        className={`icon-button ${props.open ? "is-active" : ""}`}
        data-testid="lighting-menu-trigger"
        title={t.lights.menu.trigger}
        type="button"
        onClick={() => {
          if (props.open) {
            close(true);
            return;
          }
          props.onRefreshAvailability();
          props.onOpenChange(true);
        }}
      >
        <Lightbulb size={16} />
      </button>

      {props.open && (
        <div
          ref={menuRef}
          aria-label={t.lights.menu.ariaLabel}
          className="lighting-menu"
          id="studio-lighting-menu"
          role="menu"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              close(true);
              return;
            }
            const items = menuItems(menuRef.current);
            if (items.length === 0) return;
            const current = Math.max(0, items.indexOf(event.target as HTMLButtonElement));
            const destination = menuDestination(event.key, current, items.length);
            if (destination === null) return;
            event.preventDefault();
            items[destination]?.focus();
          }}
        >
          <MenuItem
            description={props.addDisabledReason}
            icon={<Plus size={14} />}
            label={t.lights.menu.addPoint}
            onSelect={() => add("point")}
          />
          <MenuItem
            description={props.addDisabledReason}
            icon={<Zap size={14} />}
            label={t.lights.menu.addSpot}
            onSelect={() => add("spot")}
          />
          <div
            aria-label={t.lights.menu.countLabel(props.lightCount)}
            className="lighting-menu-count mono"
          >
            {props.lightCount}/8
          </div>
        </div>
      )}
    </div>
  );
}

function MenuItem({
  description,
  icon,
  label,
  onSelect,
}: {
  readonly description: string | null;
  readonly icon: React.ReactNode;
  readonly label: string;
  readonly onSelect: () => void;
}) {
  return (
    <button
      aria-disabled={description !== null}
      className="lighting-menu-item"
      role="menuitem"
      title={description ?? label}
      type="button"
      onClick={onSelect}
    >
      <span className="lighting-menu-item-icon">{icon}</span>
      <span>
        <strong>{label}</strong>
        {description !== null && <small>{description}</small>}
      </span>
    </button>
  );
}

function menuItems(menu: HTMLElement | null): HTMLButtonElement[] {
  return menu === null ? [] : [...menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
}

function firstMenuItem(menu: HTMLElement | null): HTMLButtonElement | undefined {
  return menuItems(menu)[0];
}

function menuDestination(key: string, current: number, length: number): number | null {
  if (key === "Home") return 0;
  if (key === "End") return length - 1;
  if (key === "ArrowDown") return (current + 1) % length;
  if (key === "ArrowUp") return (current - 1 + length) % length;
  return null;
}

function assignRef(ref: Ref<HTMLButtonElement> | undefined, value: HTMLButtonElement | null): void {
  if (typeof ref === "function") ref(value);
  else if (ref !== undefined && ref !== null) ref.current = value;
}
