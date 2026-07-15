export const supportedThemes = ["light", "dark"] as const;

export type Theme = (typeof supportedThemes)[number];

export interface ThemeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface ResolveThemeOptions {
  readonly storage: ThemeStorage | null;
  readonly storageKey: string;
  readonly prefersDark: boolean;
}

export interface ThemeRoot {
  readonly dataset: { theme?: string };
  readonly style: { colorScheme: string };
}

export type ThemeMatchMedia = (query: string) => Pick<MediaQueryList, "matches">;

export function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark";
}

export function resolveTheme({ storage, storageKey, prefersDark }: ResolveThemeOptions): Theme {
  const saved = readTheme(storage, storageKey);
  if (saved !== null) return saved;
  return prefersDark ? "dark" : "light";
}

export function persistTheme(storage: ThemeStorage | null, storageKey: string, theme: Theme): void {
  if (storage === null) return;
  try {
    storage.setItem(storageKey, theme);
  } catch {
    // Browser privacy and quota policies may make localStorage unavailable.
  }
}

export function themeStorage(): ThemeStorage | null {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

export function prefersDarkColorScheme(
  matchMedia: ThemeMatchMedia | null = browserMatchMedia(),
): boolean {
  if (matchMedia === null) return false;
  try {
    return matchMedia("(prefers-color-scheme: dark)").matches;
  } catch {
    return false;
  }
}

export function applyTheme(theme: Theme, root: ThemeRoot | null = documentRoot()): void {
  if (root === null) return;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
}

function readTheme(storage: ThemeStorage | null, storageKey: string): Theme | null {
  if (storage === null) return null;
  try {
    const value = storage.getItem(storageKey);
    return isTheme(value) ? value : null;
  } catch {
    return null;
  }
}

function browserMatchMedia(): ThemeMatchMedia | null {
  try {
    return typeof globalThis.matchMedia === "function"
      ? globalThis.matchMedia.bind(globalThis)
      : null;
  } catch {
    return null;
  }
}

function documentRoot(): ThemeRoot | null {
  try {
    return globalThis.document?.documentElement ?? null;
  } catch {
    return null;
  }
}
