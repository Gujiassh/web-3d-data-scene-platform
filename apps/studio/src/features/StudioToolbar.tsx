import {
  Box,
  Download,
  Copy,
  FolderOpen,
  MousePointer2,
  Move3d,
  Pause,
  Play,
  Redo2,
  Rotate3d,
  Save,
  Scale3d,
  Trash2,
  Undo2,
  Upload,
} from "lucide-react";

import type { AuthoringTool, SaveState, StudioMode } from "../session/session-state";

interface StudioToolbarProps {
  readonly projectName: string;
  readonly save: SaveState;
  readonly exportOutdated: boolean;
  readonly mode: StudioMode;
  readonly tool: AuthoringTool;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly canEdit: boolean;
  readonly hasSelection: boolean;
  readonly onOpenProjectMenu: () => void;
  readonly onUndo: () => void;
  readonly onRedo: () => void;
  readonly onSave: () => void;
  readonly onModeChange: (mode: StudioMode) => void;
  readonly onToolChange: (tool: AuthoringTool) => void;
  readonly onImport: () => void;
  readonly onExport: () => void;
  readonly onDuplicate: () => void;
  readonly onDelete: () => void;
}

const tools = [
  { value: "select", label: "Select", icon: MousePointer2 },
  { value: "translate", label: "Move", icon: Move3d },
  { value: "rotate", label: "Rotate", icon: Rotate3d },
  { value: "scale", label: "Scale", icon: Scale3d },
] as const;

export function StudioToolbar(props: StudioToolbarProps) {
  return (
    <header className="studio-toolbar">
      <button
        aria-label="Open project menu"
        className="studio-project project-menu-trigger"
        title="Project"
        type="button"
        onClick={props.onOpenProjectMenu}
      >
        <span className="project-symbol">
          <Box size={16} />
        </span>
        <span className="project-copy">
          <strong>{props.projectName}</strong>
          <span className="project-status-row">
            <small
              aria-live="polite"
              className={`save-state save-${props.save.status}`}
              data-testid="save-state"
            >
              {saveLabel(props.save)}
            </small>
            {props.exportOutdated && (
              <small className="export-state" data-testid="export-state">
                Export outdated
              </small>
            )}
          </span>
        </span>
        <FolderOpen size={14} />
      </button>

      <div className="toolbar-group" aria-label="History">
        <IconCommand
          disabled={!props.canUndo}
          label="Undo"
          icon={<Undo2 size={16} />}
          onClick={props.onUndo}
        />
        <IconCommand
          disabled={!props.canRedo}
          label="Redo"
          icon={<Redo2 size={16} />}
          onClick={props.onRedo}
        />
        <IconCommand label="Save local project" icon={<Save size={16} />} onClick={props.onSave} />
        <IconCommand
          disabled={!props.canEdit || !props.hasSelection}
          label="Duplicate selection"
          icon={<Copy size={16} />}
          onClick={props.onDuplicate}
        />
        <IconCommand
          disabled={!props.canEdit || !props.hasSelection}
          label="Delete selection"
          icon={<Trash2 size={16} />}
          onClick={props.onDelete}
        />
      </div>

      <div className="toolbar-group" aria-label="Authoring tools">
        {tools.map(({ value, label, icon: Icon }) => (
          <IconCommand
            active={props.tool === value}
            disabled={!props.canEdit}
            icon={<Icon size={16} />}
            key={value}
            label={label}
            onClick={() => props.onToolChange(value)}
          />
        ))}
      </div>

      <div className="mode-control" aria-label="Studio mode">
        <button
          className={props.mode === "edit" ? "is-active" : ""}
          type="button"
          onClick={() => props.onModeChange("edit")}
        >
          <Pause size={14} />
          Edit
        </button>
        <button
          className={props.mode === "run" ? "is-active" : ""}
          type="button"
          onClick={() => props.onModeChange("run")}
        >
          <Play size={14} />
          Run
        </button>
      </div>

      <span className="toolbar-spacer" />
      <button
        className="secondary-command"
        disabled={!props.canEdit}
        type="button"
        onClick={props.onImport}
      >
        <Upload size={15} />
        Import
      </button>
      <button className="export-command" type="button" onClick={props.onExport}>
        <Download size={15} />
        Export
      </button>
    </header>
  );
}

function IconCommand({
  active = false,
  disabled = false,
  icon,
  label,
  onClick,
}: {
  readonly active?: boolean;
  readonly disabled?: boolean;
  readonly icon: React.ReactNode;
  readonly label: string;
  readonly onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      aria-pressed={active}
      className={`icon-button ${active ? "is-active" : ""}`}
      disabled={disabled}
      title={label}
      type="button"
      onClick={onClick}
    >
      {icon}
    </button>
  );
}

function saveLabel(save: SaveState): string {
  if (save.status === "saving") return "Saving";
  if (save.status === "failed") return "Save failed";
  return "Saved locally";
}
