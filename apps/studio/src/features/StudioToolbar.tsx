import {
  Box,
  Download,
  Copy,
  FolderOpen,
  CircleHelp,
  Magnet,
  MousePointer2,
  Move3d,
  Pause,
  Play,
  Redo2,
  Rotate3d,
  Save,
  Scale3d,
  Settings2,
  SunMedium,
  Trash2,
  Undo2,
  Upload,
} from "lucide-react";

import { useStudioI18n } from "../i18n/I18nProvider";
import { detectStudioPlatform, studioCommandShortcut } from "../session/shortcut-registry";
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
  readonly canDuplicate: boolean;
  readonly duplicateDisabledReason: string | null;
  readonly hasSelection: boolean;
  readonly smartAlignEnabled: boolean;
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
  readonly onOpenHelp: () => void;
  readonly onOpenSceneSettings: () => void;
  readonly onOpenSettings: () => void;
  readonly onToggleSmartAlign: () => void;
  readonly helpButtonRef?: React.Ref<HTMLButtonElement>;
  readonly sceneSettingsButtonRef?: React.Ref<HTMLButtonElement>;
  readonly settingsButtonRef?: React.Ref<HTMLButtonElement>;
}

const tools = [
  { value: "select", commandId: "tool.select", icon: MousePointer2 },
  { value: "translate", commandId: "tool.translate", icon: Move3d },
  { value: "rotate", commandId: "tool.rotate", icon: Rotate3d },
  { value: "scale", commandId: "tool.scale", icon: Scale3d },
] as const;

export function StudioToolbar(props: StudioToolbarProps) {
  const { t } = useStudioI18n();
  const platform = detectStudioPlatform(globalThis.navigator);

  return (
    <header className="studio-toolbar">
      <button
        aria-label={t.toolbar.openProjectMenu}
        className="studio-project project-menu-trigger"
        title={props.projectName}
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
              {saveLabel(props.save, t)}
            </small>
            {props.exportOutdated && (
              <small className="export-state" data-testid="export-state">
                {t.toolbar.exportOutdated}
              </small>
            )}
          </span>
        </span>
        <FolderOpen size={14} />
      </button>

      <div className="toolbar-group" aria-label={t.toolbar.historyGroup}>
        <IconCommand
          disabled={!props.canUndo}
          label={t.toolbar.undo}
          icon={<Undo2 size={16} />}
          onClick={props.onUndo}
        />
        <IconCommand
          disabled={!props.canRedo}
          label={t.toolbar.redo}
          icon={<Redo2 size={16} />}
          onClick={props.onRedo}
        />
        <IconCommand label={t.toolbar.save} icon={<Save size={16} />} onClick={props.onSave} />
        <IconCommand
          description={props.duplicateDisabledReason}
          disabled={!props.canEdit || !props.hasSelection || !props.canDuplicate}
          label={t.toolbar.duplicate}
          icon={<Copy size={16} />}
          onClick={props.onDuplicate}
        />
        <IconCommand
          disabled={!props.canEdit || !props.hasSelection}
          label={t.toolbar.delete}
          icon={<Trash2 size={16} />}
          onClick={props.onDelete}
        />
      </div>

      <div className="toolbar-group" aria-label={t.toolbar.authoringToolsGroup}>
        {tools.map(({ value, commandId, icon: Icon }) => (
          <IconCommand
            active={props.tool === value}
            disabled={!props.canEdit}
            icon={<Icon size={16} />}
            key={value}
            label={t.toolbar.tools[value]}
            shortcut={studioCommandShortcut(commandId, platform)}
            onClick={() => props.onToolChange(value)}
          />
        ))}
        <IconCommand
          active={props.smartAlignEnabled}
          disabled={!props.canEdit}
          icon={<Magnet size={16} />}
          label={t.toolbar.smartAlign}
          shortcut={studioCommandShortcut("smart-align.toggle", platform)}
          onClick={props.onToggleSmartAlign}
        />
      </div>

      <div className="mode-control" aria-label={t.toolbar.modeGroup}>
        <button
          className={props.mode === "edit" ? "is-active" : ""}
          type="button"
          onClick={() => props.onModeChange("edit")}
        >
          <Pause size={14} />
          {t.toolbar.editMode}
        </button>
        <button
          className={props.mode === "run" ? "is-active" : ""}
          type="button"
          onClick={() => props.onModeChange("run")}
        >
          <Play size={14} />
          {t.toolbar.runMode}
        </button>
      </div>

      <span className="toolbar-spacer" />
      <IconCommand
        {...(props.helpButtonRef === undefined ? {} : { buttonRef: props.helpButtonRef })}
        icon={<CircleHelp size={16} />}
        label={t.toolbar.help}
        shortcut={studioCommandShortcut("help.open", platform)}
        onClick={props.onOpenHelp}
      />
      <IconCommand
        {...(props.sceneSettingsButtonRef === undefined
          ? {}
          : { buttonRef: props.sceneSettingsButtonRef })}
        disabled={!props.canEdit}
        icon={<SunMedium size={16} />}
        label={t.toolbar.sceneSettings}
        testId="scene-settings-button"
        onClick={props.onOpenSceneSettings}
      />
      <IconCommand
        {...(props.settingsButtonRef === undefined ? {} : { buttonRef: props.settingsButtonRef })}
        icon={<Settings2 size={16} />}
        label={t.toolbar.settings}
        testId="app-settings-button"
        onClick={props.onOpenSettings}
      />
      <button
        className="secondary-command"
        disabled={!props.canEdit}
        type="button"
        onClick={props.onImport}
      >
        <Upload size={15} />
        {t.toolbar.import}
      </button>
      <button className="export-command" type="button" onClick={props.onExport}>
        <Download size={15} />
        {t.toolbar.export}
      </button>
    </header>
  );
}

function IconCommand({
  active = false,
  disabled = false,
  description = null,
  buttonRef,
  icon,
  label,
  shortcut,
  testId,
  onClick,
}: {
  readonly active?: boolean;
  readonly disabled?: boolean;
  readonly description?: string | null;
  readonly buttonRef?: React.Ref<HTMLButtonElement>;
  readonly icon: React.ReactNode;
  readonly label: string;
  readonly shortcut?: string;
  readonly testId?: string;
  readonly onClick: () => void;
}) {
  const commandLabel = shortcut === undefined ? label : `${label} (${shortcut})`;
  const accessibleLabel = description === null ? commandLabel : `${commandLabel}. ${description}`;
  const title = description === null ? commandLabel : `${commandLabel} - ${description}`;
  return (
    <button
      ref={buttonRef}
      aria-label={accessibleLabel}
      aria-pressed={active}
      className={`icon-button ${active ? "is-active" : ""}`}
      data-testid={testId}
      disabled={disabled}
      title={title}
      type="button"
      onClick={onClick}
    >
      {icon}
    </button>
  );
}

function saveLabel(save: SaveState, t: ReturnType<typeof useStudioI18n>["t"]): string {
  if (save.status === "saving") return t.toolbar.saveState.saving;
  if (save.status === "failed") return t.toolbar.saveState.failed;
  return t.toolbar.saveState.saved;
}
