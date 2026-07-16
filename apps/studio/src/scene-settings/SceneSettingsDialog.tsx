import { useEffect, useId, useRef, useState } from "react";
import { Settings2, X } from "lucide-react";

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
  type SceneSettingsTab,
} from "./model";

export interface SceneSettingsDialogProps {
  readonly draft: SceneSettingsDraft;
  readonly initialTab?: SceneSettingsTab;
  readonly onApply: (draft: SceneSettingsDraft) => boolean;
  readonly onCancel: () => void;
  readonly onDraftChange: (draft: SceneSettingsDraft) => void;
  readonly onPreview: (draft: SceneSettingsDraft) => void;
}

export function SceneSettingsDialog(props: SceneSettingsDialogProps) {
  const { t } = useStudioI18n();
  const backdropRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const appearanceTabRef = useRef<HTMLButtonElement>(null);
  const lightingTabRef = useRef<HTMLButtonElement>(null);
  const appearancePanelId = useId();
  const lightingPanelId = useId();
  const errorId = useId();
  const initialTab = props.initialTab ?? "appearance";
  const [activeTab, setActiveTab] = useState<SceneSettingsTab>(initialTab);
  const [submissionFailed, setSubmissionFailed] = useState(false);
  const preset = deriveLightingPreset(props.draft.lighting);
  const direction = deriveLightingDirection(props.draft.lighting.key.directionToLight);

  useEffect(() => {
    const backdrop = backdropRef.current;
    const siblings = backdrop?.parentElement
      ? [...backdrop.parentElement.children].filter(
          (element): element is HTMLElement =>
            element instanceof HTMLElement && element !== backdrop,
        )
      : [];
    const previousInert = siblings.map((element) => ({ element, inert: element.inert }));
    for (const sibling of siblings) sibling.inert = true;
    tabRefs()[initialTab].current?.focus();
    return () => {
      for (const entry of previousInert) entry.element.inert = entry.inert;
    };
  }, [initialTab]);

  const update = (next: SceneSettingsDraft): void => {
    setSubmissionFailed(false);
    props.onDraftChange(next);
    props.onPreview(next);
  };
  const apply = (): void => {
    if (!props.onApply(props.draft)) setSubmissionFailed(true);
  };

  return (
    <div
      ref={backdropRef}
      className="dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) props.onCancel();
      }}
    >
      <section
        ref={dialogRef}
        aria-label={t.sceneSettings.title}
        aria-modal="true"
        className="scene-settings-dialog scene-settings-dialog-v2"
        role="dialog"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            props.onCancel();
          }
          if (event.key === "Tab") trapFocus(event, dialogRef.current);
        }}
      >
        <header>
          <span className="dialog-symbol">
            <Settings2 size={18} />
          </span>
          <h2>{t.sceneSettings.title}</h2>
          <button
            aria-label={t.sceneSettings.close}
            className="icon-button"
            title={t.sceneSettings.close}
            type="button"
            onClick={props.onCancel}
          >
            <X size={15} />
          </button>
        </header>

        <div aria-label={t.sceneSettings.tabsLabel} className="scene-settings-tabs" role="tablist">
          <button
            ref={appearanceTabRef}
            aria-controls={appearancePanelId}
            aria-selected={activeTab === "appearance"}
            id={`${appearancePanelId}-tab`}
            role="tab"
            tabIndex={activeTab === "appearance" ? 0 : -1}
            type="button"
            onClick={() => setActiveTab("appearance")}
            onKeyDown={(event) => handleTabKey(event, "appearance", setActiveTab, tabRefs())}
          >
            {t.sceneSettings.appearanceTab}
          </button>
          <button
            ref={lightingTabRef}
            aria-controls={lightingPanelId}
            aria-selected={activeTab === "lighting"}
            id={`${lightingPanelId}-tab`}
            role="tab"
            tabIndex={activeTab === "lighting" ? 0 : -1}
            type="button"
            onClick={() => setActiveTab("lighting")}
            onKeyDown={(event) => handleTabKey(event, "lighting", setActiveTab, tabRefs())}
          >
            {t.sceneSettings.lightingTab}
          </button>
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            apply();
          }}
        >
          <section
            aria-labelledby={`${appearancePanelId}-tab`}
            hidden={activeTab !== "appearance"}
            id={appearancePanelId}
            role="tabpanel"
          >
            <fieldset>
              <legend>{t.sceneSettings.backgroundMode}</legend>
              <div className="scene-setting-segments">
                <SegmentOption
                  checked={props.draft.backgroundMode === "theme"}
                  label={t.sceneSettings.followTheme}
                  name="scene-background-mode"
                  onChange={() => update({ ...props.draft, backgroundMode: "theme" })}
                />
                <SegmentOption
                  checked={props.draft.backgroundMode === "custom"}
                  label={t.sceneSettings.customColor}
                  name="scene-background-mode"
                  onChange={() => update({ ...props.draft, backgroundMode: "custom" })}
                />
              </div>
            </fieldset>

            <ColorControl
              disabled={props.draft.backgroundMode !== "custom"}
              label={t.sceneSettings.backgroundColor}
              value={props.draft.background}
              onChange={(background) => update({ ...props.draft, background })}
            />

            <label className="scene-settings-toggle">
              <input
                checked={props.draft.grid}
                type="checkbox"
                onChange={(event) => update({ ...props.draft, grid: event.currentTarget.checked })}
              />
              <span>{t.sceneSettings.showGrid}</span>
            </label>
          </section>

          <section
            aria-labelledby={`${lightingPanelId}-tab`}
            hidden={activeTab !== "lighting"}
            id={lightingPanelId}
            role="tabpanel"
          >
            <fieldset>
              <legend>{t.sceneSettings.lightingPreset}</legend>
              <div className="scene-lighting-presets">
                {LIGHTING_PRESET_IDS.map((presetId) => (
                  <button
                    aria-pressed={preset === presetId}
                    key={presetId}
                    type="button"
                    onClick={() =>
                      update({ ...props.draft, lighting: lightingForPreset(presetId) })
                    }
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
              value={props.draft.lighting.fill.intensity}
              onChange={(intensity) =>
                update({
                  ...props.draft,
                  lighting: {
                    ...props.draft.lighting,
                    fill: { ...props.draft.lighting.fill, intensity },
                  },
                })
              }
            />
            <RangeControl
              label={t.sceneSettings.keyBrightness}
              value={props.draft.lighting.key.intensity}
              onChange={(intensity) =>
                update({
                  ...props.draft,
                  lighting: {
                    ...props.draft.lighting,
                    key: { ...props.draft.lighting.key, intensity },
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
                  update({
                    ...props.draft,
                    lighting: {
                      ...props.draft.lighting,
                      key: {
                        ...props.draft.lighting.key,
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
                  value={props.draft.lighting.fill.skyColor}
                  onChange={(skyColor) =>
                    update({
                      ...props.draft,
                      lighting: {
                        ...props.draft.lighting,
                        fill: { ...props.draft.lighting.fill, skyColor },
                      },
                    })
                  }
                />
                <ColorControl
                  label={t.sceneSettings.fillGroundColor}
                  value={props.draft.lighting.fill.groundColor}
                  onChange={(groundColor) =>
                    update({
                      ...props.draft,
                      lighting: {
                        ...props.draft.lighting,
                        fill: { ...props.draft.lighting.fill, groundColor },
                      },
                    })
                  }
                />
                <ColorControl
                  label={t.sceneSettings.keyColor}
                  value={props.draft.lighting.key.color}
                  onChange={(color) =>
                    update({
                      ...props.draft,
                      lighting: {
                        ...props.draft.lighting,
                        key: { ...props.draft.lighting.key, color },
                      },
                    })
                  }
                />
              </div>
            </details>
          </section>

          <span
            aria-live="polite"
            className="field-error"
            id={errorId}
            role={submissionFailed ? "alert" : undefined}
          >
            {submissionFailed ? t.sceneSettings.applyFailed : ""}
          </span>

          <footer>
            <button
              aria-label={t.sceneSettings.cancel}
              className="secondary-command"
              type="button"
              onClick={props.onCancel}
            >
              {t.sceneSettings.cancel}
            </button>
            <button
              aria-describedby={submissionFailed ? errorId : undefined}
              aria-label={t.sceneSettings.apply}
              className="primary-command"
              type="submit"
            >
              {t.sceneSettings.apply}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );

  function tabRefs(): Readonly<
    Record<SceneSettingsTab, React.RefObject<HTMLButtonElement | null>>
  > {
    return { appearance: appearanceTabRef, lighting: lightingTabRef };
  }
}

function SegmentOption(props: {
  readonly checked: boolean;
  readonly label: string;
  readonly name: string;
  readonly onChange: () => void;
}) {
  return (
    <label>
      <input
        aria-label={props.label}
        checked={props.checked}
        name={props.name}
        type="radio"
        onChange={props.onChange}
      />
      <span>{props.label}</span>
    </label>
  );
}

function ColorControl(props: {
  readonly disabled?: boolean;
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
}) {
  return (
    <label className="scene-settings-field scene-color-control">
      <span>{props.label}</span>
      <input
        aria-label={props.label}
        disabled={props.disabled}
        type="color"
        value={props.value}
        onChange={(event) => props.onChange(event.currentTarget.value.toUpperCase())}
      />
    </label>
  );
}

function RangeControl(props: {
  readonly label: string;
  readonly value: number;
  readonly onChange: (value: number) => void;
}) {
  return (
    <label className="scene-settings-field scene-range-control">
      <span>{props.label}</span>
      <input
        aria-label={props.label}
        max="5"
        min="0"
        step="0.1"
        type="range"
        value={props.value}
        onChange={(event) => props.onChange(Number(event.currentTarget.value))}
      />
      <output>{props.value.toFixed(1)}</output>
    </label>
  );
}

function handleTabKey(
  event: React.KeyboardEvent<HTMLButtonElement>,
  current: SceneSettingsTab,
  setActive: (tab: SceneSettingsTab) => void,
  refs: Readonly<Record<SceneSettingsTab, React.RefObject<HTMLButtonElement | null>>>,
): void {
  const tabs: readonly SceneSettingsTab[] = ["appearance", "lighting"];
  let next: SceneSettingsTab | null = null;
  if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
    const offset = event.key === "ArrowRight" ? 1 : -1;
    next = tabs[(tabs.indexOf(current) + offset + tabs.length) % tabs.length] ?? null;
  }
  if (event.key === "Home") next = "appearance";
  if (event.key === "End") next = "lighting";
  if (next === null) return;
  event.preventDefault();
  setActive(next);
  refs[next].current?.focus();
}

function trapFocus(event: React.KeyboardEvent, container: HTMLElement | null): void {
  if (container === null) return;
  const focusable = [...container.querySelectorAll<HTMLElement>(focusableSelector)].filter(
    (element) =>
      !element.inert &&
      !element.hasAttribute("disabled") &&
      element.closest("[hidden]") === null &&
      (element.tagName === "SUMMARY" || element.closest("details")?.open !== false),
  );
  const first = focusable[0];
  const last = focusable.at(-1);
  if (first === undefined || last === undefined) return;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

const focusableSelector =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';
