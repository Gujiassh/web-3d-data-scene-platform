import { describe, expect, it, vi } from "vitest";

import {
  applyTheme,
  persistTheme,
  prefersDarkColorScheme,
  resolveTheme,
  type ThemeRoot,
  type ThemeStorage,
} from "./theme";

describe("theme resolution", () => {
  it("prefers a valid app-specific saved preference", () => {
    const storage = memoryStorage({ "studio.theme": "dark", "factory.theme": "light" });

    expect(resolveTheme({ storage, storageKey: "studio.theme", prefersDark: false })).toBe("dark");
    expect(resolveTheme({ storage, storageKey: "factory.theme", prefersDark: true })).toBe("light");
  });

  it("ignores invalid saved values and falls back to browser preference", () => {
    const storage = memoryStorage({ "app.theme": "sepia" });

    expect(resolveTheme({ storage, storageKey: "app.theme", prefersDark: true })).toBe("dark");
  });

  it("falls back to light when no saved or dark browser preference exists", () => {
    expect(resolveTheme({ storage: null, storageKey: "app.theme", prefersDark: false })).toBe(
      "light",
    );
  });

  it("tolerates storage read and write exceptions", () => {
    const storage: ThemeStorage = {
      getItem: () => {
        throw new DOMException("Blocked");
      },
      setItem: () => {
        throw new DOMException("Blocked");
      },
    };

    expect(resolveTheme({ storage, storageKey: "app.theme", prefersDark: true })).toBe("dark");
    expect(() => persistTheme(storage, "app.theme", "light")).not.toThrow();
  });

  it("persists an explicit supported preference", () => {
    const storage = memoryStorage();
    persistTheme(storage, "app.theme", "dark");
    expect(storage.getItem("app.theme")).toBe("dark");
  });
});

describe("browser theme preference", () => {
  it("queries the dark color scheme preference", () => {
    const matchMedia = vi.fn(() => ({ matches: true }));

    expect(prefersDarkColorScheme(matchMedia)).toBe(true);
    expect(matchMedia).toHaveBeenCalledWith("(prefers-color-scheme: dark)");
  });

  it("falls back to light when matchMedia is unavailable or restricted", () => {
    expect(prefersDarkColorScheme(null)).toBe(false);
    expect(
      prefersDarkColorScheme(() => {
        throw new DOMException("Blocked");
      }),
    ).toBe(false);
  });
});

describe("theme application", () => {
  it("synchronizes the root dataset and native color scheme", () => {
    const root: ThemeRoot = { dataset: {}, style: { colorScheme: "" } };

    applyTheme("dark", root);

    expect(root.dataset.theme).toBe("dark");
    expect(root.style.colorScheme).toBe("dark");
  });
});

function memoryStorage(initial: Readonly<Record<string, string>> = {}): ThemeStorage {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}
