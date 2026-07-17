import { useTheme } from "@web3d/demo-support/theme-provider";

import { useStudioI18n } from "../i18n/I18nProvider";

export function ApplicationSettingsPanel() {
  const { locale, setLocale, t } = useStudioI18n();
  const { theme, setTheme } = useTheme();
  return (
    <div className="application-settings-panel">
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
  );
}
