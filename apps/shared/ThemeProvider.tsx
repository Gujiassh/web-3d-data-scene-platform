import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  applyTheme,
  persistTheme,
  prefersDarkColorScheme,
  resolveTheme,
  themeStorage,
  type Theme,
} from "./theme";

export interface ThemeContextValue {
  readonly theme: Theme;
  readonly setTheme: (theme: Theme) => void;
  readonly toggleTheme: () => void;
}

export interface ThemeProviderProps {
  readonly storageKey: string;
  readonly children: ReactNode;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

class MissingThemeProviderError extends Error {
  override readonly name = "MissingThemeProviderError";
}

export function ThemeProvider({ storageKey, children }: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(() =>
    resolveTheme({
      storage: themeStorage(),
      storageKey,
      prefersDark: prefersDarkColorScheme(),
    }),
  );

  useLayoutEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const setTheme = useCallback(
    (nextTheme: Theme) => {
      applyTheme(nextTheme);
      persistTheme(themeStorage(), storageKey, nextTheme);
      setThemeState(nextTheme);
    },
    [storageKey],
  );

  const toggleTheme = useCallback(() => {
    setTheme(theme === "light" ? "dark" : "light");
  }, [setTheme, theme]);

  const value = useMemo(() => ({ theme, setTheme, toggleTheme }), [setTheme, theme, toggleTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

// Provider and hook intentionally share one reusable context module.
// eslint-disable-next-line react-refresh/only-export-components
export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (context === null) throw new MissingThemeProviderError();
  return context;
}
