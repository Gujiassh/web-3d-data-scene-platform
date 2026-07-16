// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";

import {
  persistSmartAlignPreference,
  resolveSmartAlignPreference,
  SMART_ALIGN_PREFERENCE_KEY,
  SMART_ALIGN_PREFERENCE_VERSION,
  type SmartAlignPreferenceStorage,
  useSmartAlignPreference,
} from "./preference";

describe("Smart Align local preference", () => {
  it("defaults missing and invalid versioned values to enabled", () => {
    expect(SMART_ALIGN_PREFERENCE_VERSION).toBe(1);
    expect(SMART_ALIGN_PREFERENCE_KEY).toBe("web3d.studio.smart-align.v1");
    expect(resolveSmartAlignPreference(memoryStorage())).toBe(true);
    expect(resolveSmartAlignPreference(memoryStorage({ [SMART_ALIGN_PREFERENCE_KEY]: "1" }))).toBe(
      true,
    );
    expect(resolveSmartAlignPreference(null)).toBe(true);
  });

  it("reads and persists only the explicit boolean preference", () => {
    const storage = memoryStorage({ [SMART_ALIGN_PREFERENCE_KEY]: "false" });
    expect(resolveSmartAlignPreference(storage)).toBe(false);
    persistSmartAlignPreference(true, storage);
    expect(storage.getItem(SMART_ALIGN_PREFERENCE_KEY)).toBe("true");
  });

  it("tolerates restricted local storage", () => {
    const storage: SmartAlignPreferenceStorage = {
      getItem: () => {
        throw new DOMException("Blocked");
      },
      setItem: () => {
        throw new DOMException("Blocked");
      },
    };
    expect(resolveSmartAlignPreference(storage)).toBe(true);
    expect(() => persistSmartAlignPreference(false, storage)).not.toThrow();
  });

  it("initializes the hook from the versioned key and persists each toggle", () => {
    localStorage.clear();
    localStorage.setItem(SMART_ALIGN_PREFERENCE_KEY, "false");
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

    function Harness() {
      const [enabled, toggle] = useSmartAlignPreference();
      return createElement(
        "button",
        { "aria-pressed": enabled, type: "button", onClick: toggle },
        "toggle",
      );
    }

    act(() => root.render(createElement(Harness)));
    const button = container.querySelector("button")!;
    expect(button.getAttribute("aria-pressed")).toBe("false");
    act(() => button.click());
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(localStorage.getItem(SMART_ALIGN_PREFERENCE_KEY)).toBe("true");

    act(() => root.unmount());
    container.remove();
    localStorage.clear();
  });
});

function memoryStorage(
  initial: Readonly<Record<string, string>> = {},
): SmartAlignPreferenceStorage {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}
