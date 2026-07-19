import {
  Eye,
  EyeOff,
  LockKeyhole,
  LockOpen,
  MoreHorizontal,
  Move3d,
  Pencil,
  Trash2,
} from "lucide-react";

import type { Annotation } from "@web3d/document";
import type { HotspotScreenAnchor } from "@web3d/runtime";

import { useStudioI18n } from "../i18n/I18nProvider";
import { ViewportClampedLayer } from "./ViewportClampedLayer";

export function HotspotPopover({
  annotation,
  anchor,
  onRename,
  onReposition,
  onToggleVisibility,
  onToggleLock,
  onDelete,
  onMore,
}: {
  readonly annotation: Annotation;
  readonly anchor: HotspotScreenAnchor;
  readonly onRename: () => void;
  readonly onReposition: () => void;
  readonly onToggleVisibility: () => void;
  readonly onToggleLock: () => void;
  readonly onDelete: () => void;
  readonly onMore: () => void;
}) {
  const { t } = useStudioI18n();
  return (
    <ViewportClampedLayer
      anchor={anchor}
      ariaLabel={t.hotspots.popover.ariaLabel(annotation.title)}
      className="hotspot-popover"
      fallbackHeight={34}
      fallbackWidth={188}
      placement="above"
      role="toolbar"
    >
      <Action
        disabled={annotation.locked}
        disabledTitle={t.hotspots.feedback.locked}
        label={t.hotspots.actions.rename}
        icon={<Pencil size={14} />}
        onClick={onRename}
      />
      <Action
        disabled={annotation.locked}
        disabledTitle={t.hotspots.feedback.locked}
        label={t.hotspots.actions.reposition}
        icon={<Move3d size={14} />}
        onClick={onReposition}
      />
      <Action
        label={annotation.visible ? t.hotspots.actions.hide : t.hotspots.actions.show}
        icon={annotation.visible ? <EyeOff size={14} /> : <Eye size={14} />}
        onClick={onToggleVisibility}
      />
      <Action
        label={annotation.locked ? t.hotspots.actions.unlock : t.hotspots.actions.lock}
        icon={annotation.locked ? <LockOpen size={14} /> : <LockKeyhole size={14} />}
        onClick={onToggleLock}
      />
      <Action
        disabled={annotation.locked}
        disabledTitle={t.hotspots.feedback.locked}
        label={t.hotspots.actions.delete}
        icon={<Trash2 size={14} />}
        onClick={onDelete}
      />
      <Action
        label={t.hotspots.actions.more}
        icon={<MoreHorizontal size={14} />}
        onClick={onMore}
      />
    </ViewportClampedLayer>
  );
}

function Action({
  disabled = false,
  disabledTitle,
  icon,
  label,
  onClick,
}: {
  readonly disabled?: boolean;
  readonly disabledTitle?: string;
  readonly icon: React.ReactNode;
  readonly label: string;
  readonly onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      disabled={disabled}
      title={disabled ? disabledTitle : label}
      type="button"
      onClick={onClick}
    >
      {icon}
    </button>
  );
}
