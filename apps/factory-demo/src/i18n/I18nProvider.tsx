import {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";

import { localeStorage, persistLocale, resolveLocale, type Locale } from "@web3d/demo-support/i18n";

import { english, type FactoryCatalog, zhCN } from "./catalog";

const catalogs: Readonly<Record<Locale, FactoryCatalog>> = {
  en: english,
  "zh-CN": zhCN,
};

const storageKey = "web3d.factory-demo.locale";

interface I18nContextValue {
  readonly locale: Locale;
  readonly catalog: FactoryCatalog;
  readonly setLocale: (locale: Locale) => void;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function FactoryI18nProvider({ children }: PropsWithChildren) {
  const [locale, setLocale] = useState<Locale>(() =>
    resolveLocale({
      storage: localeStorage(),
      storageKey,
      browserLanguages: browserLanguages(),
    }),
  );

  const catalog = catalogs[locale];

  useLayoutEffect(() => {
    persistLocale(localeStorage(), storageKey, locale);
    document.documentElement.lang = locale;
    document.title = catalog.meta.title;
  }, [catalog.meta.title, locale]);

  const value = useMemo<I18nContextValue>(
    () => ({ catalog, locale, setLocale }),
    [catalog, locale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

// Provider and hook intentionally share one app-local context module.
// eslint-disable-next-line react-refresh/only-export-components
export function useFactoryI18n(): I18nContextValue {
  const value = useContext(I18nContext);
  if (value === null) throw new Error("FactoryI18nProvider is missing.");
  return value;
}

function browserLanguages(): readonly string[] {
  if (typeof navigator === "undefined") return ["en"];
  return navigator.languages.length > 0 ? navigator.languages : [navigator.language];
}
