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

import { LanguageSwitch } from "@web3d/demo-support/language-switch";
import { ThemeSwitch } from "@web3d/demo-support/theme-switch";
import { useTheme } from "@web3d/demo-support/theme-provider";

import { useStudioI18n } from "../i18n/I18nProvider";
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
  { value: "select", icon: MousePointer2 },
  { value: "translate", icon: Move3d },
  { value: "rotate", icon: Rotate3d },
  { value: "scale", icon: Scale3d },
] as const;

export function StudioToolbar(props: StudioToolbarProps) {
  const { locale, setLocale, t } = useStudioI18n();
  const { theme, toggleTheme } = useTheme();

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
        {tools.map(({ value, icon: Icon }) => (
          <IconCommand
            active={props.tool === value}
            disabled={!props.canEdit}
            icon={<Icon size={16} />}
            key={value}
            label={t.toolbar.tools[value]}
            onClick={() => props.onToolChange(value)}
          />
        ))}
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
      <LanguageSwitch
        ariaLabel={t.app.languageSwitch.ariaLabel}
        chineseLabel={t.app.languageSwitch.chineseLabel}
        englishLabel={t.app.languageSwitch.englishLabel}
        locale={locale}
        onChange={setLocale}
      />
      <ThemeSwitch
        darkLabel={t.app.themeSwitch.switchToDark}
        lightLabel={t.app.themeSwitch.switchToLight}
        theme={theme}
        onToggle={toggleTheme}
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
  icon,
  label,
  onClick,
}: {
  readonly active?: boolean;
  readonly disabled?: boolean;
  readonly description?: string | null;
  readonly icon: React.ReactNode;
  readonly label: string;
  readonly onClick: () => void;
}) {
  return (
    <button
      aria-label={description === null ? label : `${label}. ${description}`}
      aria-pressed={active}
      className={`icon-button ${active ? "is-active" : ""}`}
      disabled={disabled}
      title={description ?? label}
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
