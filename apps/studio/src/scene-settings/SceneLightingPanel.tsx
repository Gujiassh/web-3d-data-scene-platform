import { useStudioI18n } from "../i18n/I18nProvider";
import {
  deriveLightingDirection,
  deriveLightingPreset,
  directionFor,
  LIGHTING_DIRECTION_IDS,
  LIGHTING_PRESET_IDS,
  lightingForPreset,
  type LightingDirectionId,
  type SceneSettingsDraft,
} from "./model";
import { ColorControl, RangeControl } from "./SceneSettingsControls";

interface SceneLightingPanelProps {
  readonly draft: SceneSettingsDraft;
  readonly onCancelPreview: () => void;
  readonly previewCancellation: number;
  readonly onCommit: (draft: SceneSettingsDraft) => void;
  readonly onPreview: (draft: SceneSettingsDraft) => void;
}

export function SceneLightingPanel({
  draft,
  onCancelPreview,
  previewCancellation,
  onCommit,
  onPreview,
}: SceneLightingPanelProps) {
  const { t } = useStudioI18n();
  const preset = deriveLightingPreset(draft.lighting);
  const direction = deriveLightingDirection(draft.lighting.key.directionToLight);
  return (
    <div className="scene-settings-panel">
      <fieldset>
        <legend>{t.sceneSettings.lightingPreset}</legend>
        <div className="scene-lighting-presets">
          {LIGHTING_PRESET_IDS.map((presetId) => (
            <button
              aria-pressed={preset === presetId}
              key={presetId}
              type="button"
              onClick={() => onCommit({ ...draft, lighting: lightingForPreset(presetId) })}
            >
              {t.sceneSettings.presets[presetId]}
            </button>
          ))}
        </div>
        <output className="scene-preset-status">
          {t.sceneSettings.currentPreset(t.sceneSettings.presets[preset])}
        </output>
      </fieldset>

      <RangeControl
        label={t.sceneSettings.fillBrightness}
        previewCancellation={previewCancellation}
        value={draft.lighting.fill.intensity}
        onCancel={onCancelPreview}
        onCommit={(intensity) =>
          onCommit({
            ...draft,
            lighting: {
              ...draft.lighting,
              fill: { ...draft.lighting.fill, intensity },
            },
          })
        }
        onPreview={(intensity) =>
          onPreview({
            ...draft,
            lighting: {
              ...draft.lighting,
              fill: { ...draft.lighting.fill, intensity },
            },
          })
        }
      />
      <RangeControl
        label={t.sceneSettings.keyBrightness}
        previewCancellation={previewCancellation}
        value={draft.lighting.key.intensity}
        onCancel={onCancelPreview}
        onCommit={(intensity) =>
          onCommit({
            ...draft,
            lighting: {
              ...draft.lighting,
              key: { ...draft.lighting.key, intensity },
            },
          })
        }
        onPreview={(intensity) =>
          onPreview({
            ...draft,
            lighting: {
              ...draft.lighting,
              key: { ...draft.lighting.key, intensity },
            },
          })
        }
      />

      <label className="scene-settings-field">
        <span>{t.sceneSettings.keyDirection}</span>
        <select
          aria-label={t.sceneSettings.keyDirection}
          value={direction}
          onChange={(event) => {
            const nextDirection = event.currentTarget.value as LightingDirectionId;
            onCommit({
              ...draft,
              lighting: {
                ...draft.lighting,
                key: {
                  ...draft.lighting.key,
                  directionToLight: directionFor(nextDirection),
                },
              },
            });
          }}
        >
          {direction === "custom" && (
            <option disabled value="custom">
              {t.sceneSettings.customDirection}
            </option>
          )}
          {LIGHTING_DIRECTION_IDS.map((directionId) => (
            <option key={directionId} value={directionId}>
              {t.sceneSettings.directions[directionId]}
            </option>
          ))}
        </select>
      </label>

      <details className="scene-settings-advanced">
        <summary>{t.sceneSettings.advanced}</summary>
        <div>
          <ColorControl
            label={t.sceneSettings.fillSkyColor}
            previewCancellation={previewCancellation}
            value={draft.lighting.fill.skyColor}
            onCommit={(skyColor) =>
              onCommit({
                ...draft,
                lighting: {
                  ...draft.lighting,
                  fill: { ...draft.lighting.fill, skyColor },
                },
              })
            }
            onPreview={(skyColor) =>
              onPreview({
                ...draft,
                lighting: {
                  ...draft.lighting,
                  fill: { ...draft.lighting.fill, skyColor },
                },
              })
            }
          />
          <ColorControl
            label={t.sceneSettings.fillGroundColor}
            previewCancellation={previewCancellation}
            value={draft.lighting.fill.groundColor}
            onCommit={(groundColor) =>
              onCommit({
                ...draft,
                lighting: {
                  ...draft.lighting,
                  fill: { ...draft.lighting.fill, groundColor },
                },
              })
            }
            onPreview={(groundColor) =>
              onPreview({
                ...draft,
                lighting: {
                  ...draft.lighting,
                  fill: { ...draft.lighting.fill, groundColor },
                },
              })
            }
          />
          <ColorControl
            label={t.sceneSettings.keyColor}
            previewCancellation={previewCancellation}
            value={draft.lighting.key.color}
            onCommit={(color) =>
              onCommit({
                ...draft,
                lighting: {
                  ...draft.lighting,
                  key: { ...draft.lighting.key, color },
                },
              })
            }
            onPreview={(color) =>
              onPreview({
                ...draft,
                lighting: {
                  ...draft.lighting,
                  key: { ...draft.lighting.key, color },
                },
              })
            }
          />
        </div>
      </details>
    </div>
  );
}
