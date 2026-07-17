import { useStudioI18n } from "../i18n/I18nProvider";
import type { SceneSettingsDraft } from "./model";
import { ColorControl, SegmentOption } from "./SceneSettingsControls";

interface SceneAppearancePanelProps {
  readonly draft: SceneSettingsDraft;
  readonly previewCancellation: number;
  readonly onCommit: (draft: SceneSettingsDraft) => void;
  readonly onPreview: (draft: SceneSettingsDraft) => void;
}

export function SceneAppearancePanel({
  draft,
  previewCancellation,
  onCommit,
  onPreview,
}: SceneAppearancePanelProps) {
  const { t } = useStudioI18n();
  return (
    <div className="scene-settings-panel">
      <fieldset>
        <legend>{t.sceneSettings.backgroundMode}</legend>
        <div className="scene-setting-segments">
          <SegmentOption
            checked={draft.backgroundMode === "theme"}
            label={t.sceneSettings.followTheme}
            name="scene-background-mode"
            onChange={() => onCommit({ ...draft, backgroundMode: "theme" })}
          />
          <SegmentOption
            checked={draft.backgroundMode === "custom"}
            label={t.sceneSettings.customColor}
            name="scene-background-mode"
            onChange={() => onCommit({ ...draft, backgroundMode: "custom" })}
          />
        </div>
      </fieldset>

      <ColorControl
        disabled={draft.backgroundMode !== "custom"}
        label={t.sceneSettings.backgroundColor}
        previewCancellation={previewCancellation}
        value={draft.background}
        onCommit={(background) => onCommit({ ...draft, background })}
        onPreview={(background) => onPreview({ ...draft, background })}
      />

      <label className="scene-settings-toggle">
        <input
          checked={draft.grid}
          type="checkbox"
          onChange={(event) => onCommit({ ...draft, grid: event.currentTarget.checked })}
        />
        <span>{t.sceneSettings.showGrid}</span>
      </label>
    </div>
  );
}
