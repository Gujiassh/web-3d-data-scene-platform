import type { Locale } from "./i18n";

export interface LanguageSwitchProps {
  readonly locale: Locale;
  readonly ariaLabel: string;
  readonly chineseLabel: string;
  readonly englishLabel: string;
  readonly onChange: (locale: Locale) => void;
}

export function LanguageSwitch({
  locale,
  ariaLabel,
  chineseLabel,
  englishLabel,
  onChange,
}: LanguageSwitchProps) {
  return (
    <div className="language-switch" role="group" aria-label={ariaLabel}>
      <button
        aria-label={chineseLabel}
        aria-pressed={locale === "zh-CN"}
        className={locale === "zh-CN" ? "is-active" : ""}
        title={chineseLabel}
        type="button"
        onClick={() => onChange("zh-CN")}
      >
        中
      </button>
      <button
        aria-label={englishLabel}
        aria-pressed={locale === "en"}
        className={locale === "en" ? "is-active" : ""}
        title={englishLabel}
        type="button"
        onClick={() => onChange("en")}
      >
        EN
      </button>
    </div>
  );
}
