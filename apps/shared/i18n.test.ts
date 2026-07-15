import { describe, expect, it } from "vitest";

import { normalizeBrowserLocale, persistLocale, resolveLocale, type LocaleStorage } from "./i18n";

describe("locale resolution", () => {
  it.each([
    ["zh", "zh-CN"],
    ["zh-CN", "zh-CN"],
    ["zh-Hans", "zh-CN"],
    ["en-US", "en"],
    ["fr", null],
  ] as const)("normalizes %s to %s", (input, expected) => {
    expect(normalizeBrowserLocale(input)).toBe(expected);
  });

  it("prefers an exact saved preference over browser languages", () => {
    const storage = memoryStorage({ "app.locale": "en" });
    expect(resolveLocale({ storage, storageKey: "app.locale", browserLanguages: ["zh-CN"] })).toBe(
      "en",
    );
  });

  it("ignores an invalid saved value and scans supported browser languages", () => {
    const storage = memoryStorage({ "app.locale": "de" });
    expect(
      resolveLocale({ storage, storageKey: "app.locale", browserLanguages: ["fr", "zh-Hans"] }),
    ).toBe("zh-CN");
  });

  it("falls back to English when no browser language is supported", () => {
    expect(
      resolveLocale({ storage: null, storageKey: "app.locale", browserLanguages: ["fr"] }),
    ).toBe("en");
  });

  it("persists a supported locale and tolerates unavailable storage", () => {
    const storage = memoryStorage();
    persistLocale(storage, "app.locale", "zh-CN");
    expect(storage.getItem("app.locale")).toBe("zh-CN");

    expect(() =>
      persistLocale(
        {
          getItem: () => null,
          setItem: () => {
            throw new DOMException("Blocked");
          },
        },
        "app.locale",
        "en",
      ),
    ).not.toThrow();
  });
});

function memoryStorage(initial: Readonly<Record<string, string>> = {}): LocaleStorage {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}
