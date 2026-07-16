import { useEffect, useId, useRef, useState } from "react";
import { Settings2, X } from "lucide-react";

import { useStudioI18n } from "../i18n/I18nProvider";
import { normalizeSceneBackgroundColor, type SceneBackgroundSettings } from "./model";

interface SceneBackgroundSettingsDialogProps {
  readonly initialSettings: SceneBackgroundSettings;
  readonly themeBackground: string;
  readonly onApply: (settings: SceneBackgroundSettings) => boolean;
  readonly onCancel: () => void;
  readonly onPreview: (color: string) => void;
}

export function SceneBackgroundSettingsDialog({
  initialSettings,
  themeBackground,
  onApply,
  onCancel,
  onPreview,
}: SceneBackgroundSettingsDialogProps) {
  const { t } = useStudioI18n();
  const backdropRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const firstRadioRef = useRef<HTMLInputElement>(null);
  const errorId = useId();
  const [mode, setMode] = useState(initialSettings.backgroundMode);
  const [colorDraft, setColorDraft] = useState(initialSettings.background);
  const [submissionFailed, setSubmissionFailed] = useState(false);
  const color = normalizeSceneBackgroundColor(colorDraft);
  const invalid = mode === "custom" && color === null;
  const errorMessage = invalid
    ? t.sceneSettings.invalidColor
    : submissionFailed
      ? t.sceneSettings.applyFailed
      : "";

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
    firstRadioRef.current?.focus();
    return () => {
      for (const entry of previousInert) entry.element.inert = entry.inert;
    };
  }, []);

  useEffect(() => {
    if (mode === "theme") {
      onPreview(themeBackground);
      return;
    }
    if (color !== null) onPreview(color);
  }, [color, mode, onPreview, themeBackground]);

  const selectMode = (nextMode: SceneBackgroundSettings["backgroundMode"]): void => {
    if (nextMode === "theme" && color === null) setColorDraft(initialSettings.background);
    setSubmissionFailed(false);
    setMode(nextMode);
  };
  const apply = (): void => {
    const normalizedColor = normalizeSceneBackgroundColor(colorDraft);
    if (normalizedColor === null) return;
    if (!onApply({ backgroundMode: mode, background: normalizedColor })) {
      setSubmissionFailed(true);
    }
  };

  return (
    <div
      ref={backdropRef}
      className="dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onCancel();
      }}
    >
      <section
        ref={dialogRef}
        aria-label={t.sceneSettings.title}
        aria-modal="true"
        className="scene-settings-dialog"
        role="dialog"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            onCancel();
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
            onClick={onCancel}
          >
            <X size={15} />
          </button>
        </header>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            apply();
          }}
        >
          <fieldset>
            <legend>{t.sceneSettings.backgroundMode}</legend>
            <div className="scene-background-mode">
              <label>
                <input
                  ref={firstRadioRef}
                  aria-label={t.sceneSettings.followTheme}
                  checked={mode === "theme"}
                  name="scene-background-mode"
                  type="radio"
                  onChange={() => selectMode("theme")}
                />
                <span>{t.sceneSettings.followTheme}</span>
              </label>
              <label>
                <input
                  aria-label={t.sceneSettings.customColor}
                  checked={mode === "custom"}
                  name="scene-background-mode"
                  type="radio"
                  onChange={() => selectMode("custom")}
                />
                <span>{t.sceneSettings.customColor}</span>
              </label>
            </div>
          </fieldset>

          <div className="scene-background-color-row">
            <label className="scene-background-picker">
              <span>{t.sceneSettings.chooseColor}</span>
              <input
                aria-label={t.sceneSettings.chooseColor}
                disabled={mode !== "custom"}
                type="color"
                value={color ?? initialSettings.background}
                onChange={(event) => {
                  setSubmissionFailed(false);
                  setColorDraft(event.currentTarget.value.toUpperCase());
                }}
              />
            </label>
            <label className="scene-background-text">
              <span>{t.sceneSettings.backgroundColor}</span>
              <input
                aria-describedby={errorMessage === "" ? undefined : errorId}
                aria-invalid={invalid}
                aria-label={t.sceneSettings.backgroundColor}
                autoComplete="off"
                disabled={mode !== "custom"}
                maxLength={7}
                spellCheck={false}
                value={colorDraft}
                onChange={(event) => {
                  setSubmissionFailed(false);
                  setColorDraft(event.currentTarget.value);
                }}
              />
            </label>
          </div>
          <span
            aria-live="polite"
            className="field-error"
            id={errorId}
            role={errorMessage === "" ? undefined : "alert"}
          >
            {errorMessage}
          </span>

          <footer>
            <button
              aria-label={t.sceneSettings.cancel}
              className="secondary-command"
              type="button"
              onClick={onCancel}
            >
              {t.sceneSettings.cancel}
            </button>
            <button
              aria-label={t.sceneSettings.apply}
              className="primary-command"
              disabled={color === null}
              type="submit"
            >
              {t.sceneSettings.apply}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}

function trapFocus(event: React.KeyboardEvent, container: HTMLElement | null): void {
  if (container === null) return;
  const focusable = [...container.querySelectorAll<HTMLElement>(focusableSelector)].filter(
    (element) => !element.inert && !element.hasAttribute("disabled"),
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
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
