export const supportedLocales = ["en", "zh-CN"] as const;

export type Locale = (typeof supportedLocales)[number];

export type CatalogShape<T> = T extends string
  ? string
  : T extends (...args: infer Parameters) => string
    ? (...args: Parameters) => string
    : T extends Readonly<Record<string, unknown>>
      ? { readonly [Key in keyof T]: CatalogShape<T[Key]> }
      : never;

export interface LocaleStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface ResolveLocaleOptions {
  readonly storage: LocaleStorage | null;
  readonly storageKey: string;
  readonly browserLanguages: readonly string[];
}

export function isLocale(value: unknown): value is Locale {
  return value === "en" || value === "zh-CN";
}

export function normalizeBrowserLocale(value: string): Locale | null {
  const normalized = value.trim().toLowerCase();
  if (normalized === "zh" || normalized.startsWith("zh-")) return "zh-CN";
  if (normalized === "en" || normalized.startsWith("en-")) return "en";
  return null;
}

export function resolveLocale({
  storage,
  storageKey,
  browserLanguages,
}: ResolveLocaleOptions): Locale {
  const saved = readLocale(storage, storageKey);
  if (saved !== null) return saved;

  for (const language of browserLanguages) {
    const locale = normalizeBrowserLocale(language);
    if (locale !== null) return locale;
  }
  return "en";
}

export function persistLocale(
  storage: LocaleStorage | null,
  storageKey: string,
  locale: Locale,
): void {
  if (storage === null) return;
  try {
    storage.setItem(storageKey, locale);
  } catch {
    // Browser privacy and quota policies may make localStorage unavailable.
  }
}

export function localeStorage(): LocaleStorage | null {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

function readLocale(storage: LocaleStorage | null, storageKey: string): Locale | null {
  if (storage === null) return null;
  try {
    const value = storage.getItem(storageKey);
    return isLocale(value) ? value : null;
  } catch {
    return null;
  }
}
