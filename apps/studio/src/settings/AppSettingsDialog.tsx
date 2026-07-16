import { useEffect, useRef } from "react";
import { Settings2, X } from "lucide-react";

import { useTheme } from "@web3d/demo-support/theme-provider";

import { useStudioI18n } from "../i18n/I18nProvider";

interface AppSettingsDialogProps {
  readonly onClose: () => void;
}

export function AppSettingsDialog({ onClose }: AppSettingsDialogProps) {
  const { locale, setLocale, t } = useStudioI18n();
  const { theme, setTheme } = useTheme();
  const backdropRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

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
    closeButtonRef.current?.focus();
    return () => {
      for (const entry of previousInert) entry.element.inert = entry.inert;
    };
  }, []);

  return (
    <div
      ref={backdropRef}
      className="dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <section
        ref={dialogRef}
        aria-label={t.appSettings.title}
        aria-modal="true"
        className="app-settings-dialog"
        role="dialog"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            onClose();
          }
          if (event.key === "Tab") trapFocus(event, dialogRef.current);
        }}
      >
        <header>
          <span className="dialog-symbol">
            <Settings2 size={18} />
          </span>
          <h2>{t.appSettings.title}</h2>
          <button
            ref={closeButtonRef}
            aria-label={t.appSettings.close}
            className="icon-button"
            title={t.appSettings.close}
            type="button"
            onClick={onClose}
          >
            <X size={15} />
          </button>
        </header>

        <div className="app-settings-content">
          <fieldset>
            <legend>{t.appSettings.language}</legend>
            <div className="app-setting-segments">
              <button
                aria-pressed={locale === "zh-CN"}
                data-testid="settings-locale-zh-CN"
                type="button"
                onClick={() => setLocale("zh-CN")}
              >
                {t.appSettings.chinese}
              </button>
              <button
                aria-pressed={locale === "en"}
                data-testid="settings-locale-en"
                type="button"
                onClick={() => setLocale("en")}
              >
                {t.appSettings.english}
              </button>
            </div>
          </fieldset>

          <fieldset>
            <legend>{t.appSettings.theme}</legend>
            <div className="app-setting-segments">
              <button
                aria-pressed={theme === "light"}
                data-testid="settings-theme-light"
                type="button"
                onClick={() => setTheme("light")}
              >
                {t.appSettings.light}
              </button>
              <button
                aria-pressed={theme === "dark"}
                data-testid="settings-theme-dark"
                type="button"
                onClick={() => setTheme("dark")}
              >
                {t.appSettings.dark}
              </button>
            </div>
          </fieldset>
        </div>
      </section>
    </div>
  );
}

function trapFocus(event: React.KeyboardEvent, container: HTMLElement | null): void {
  if (container === null) return;
  const focusable = [...container.querySelectorAll<HTMLButtonElement>("button:not([disabled])")];
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
