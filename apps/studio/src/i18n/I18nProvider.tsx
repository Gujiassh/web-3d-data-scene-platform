import {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";

import { localeStorage, persistLocale, resolveLocale, type Locale } from "@web3d/demo-support/i18n";

import { english, studioCatalogs, type StudioCatalog } from "./catalog";
import { createStudioFormatters, type StudioFormatters } from "./format";

const studioLocaleStorageKey = "web3d.studio.locale";

interface StudioI18nValue {
  readonly locale: Locale;
  readonly setLocale: (locale: Locale) => void;
  readonly t: StudioCatalog;
  readonly formatters: StudioFormatters;
}

const StudioI18nContext = createContext<StudioI18nValue | null>(null);

export function StudioI18nProvider({ children }: PropsWithChildren) {
  const [locale, setLocale] = useState<Locale>(() =>
    resolveLocale({
      storage: localeStorage(),
      storageKey: studioLocaleStorageKey,
      browserLanguages: browserLanguages(),
    }),
  );

  const value = useMemo<StudioI18nValue>(() => {
    const t = studioCatalogs[locale] ?? english;
    return {
      locale,
      setLocale,
      t,
      formatters: createStudioFormatters(locale),
    };
  }, [locale]);

  useLayoutEffect(() => {
    persistLocale(localeStorage(), studioLocaleStorageKey, locale);
    document.documentElement.lang = locale;
  }, [locale]);

  return <StudioI18nContext.Provider value={value}>{children}</StudioI18nContext.Provider>;
}

// Provider and hook intentionally share one app-local context module.
// eslint-disable-next-line react-refresh/only-export-components
export function useStudioI18n(): StudioI18nValue {
  const value = useContext(StudioI18nContext);
  if (value === null) throw new Error("StudioI18nProvider is missing.");
  return value;
}

function browserLanguages(): readonly string[] {
  if (typeof navigator === "undefined") return [];
  return navigator.languages.length > 0 ? navigator.languages : [navigator.language];
}
