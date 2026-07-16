// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "@web3d/demo-support/theme-provider";

import { StudioI18nProvider } from "../i18n/I18nProvider";
import { AppSettingsDialog } from "./AppSettingsDialog";

describe("AppSettingsDialog", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    localStorage.clear();
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
    );
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it("persists language and theme choices inside Settings", () => {
    const onClose = vi.fn();
    renderDialog(onClose);

    act(() => button("Chinese").click());
    expect(document.documentElement.lang).toBe("zh-CN");
    expect(localStorage.getItem("web3d.studio.locale")).toBe("zh-CN");
    act(() => button("深色").click());
    expect(document.documentElement.dataset["theme"]).toBe("dark");
    expect(localStorage.getItem("app-settings-test-theme")).toBe("dark");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("contains focus and closes on Escape", () => {
    const onClose = vi.fn();
    renderDialog(onClose);

    expect(document.activeElement).toBe(button("Close settings"));
    act(() =>
      dialog().dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })),
    );
    expect(onClose).toHaveBeenCalledOnce();
  });

  function renderDialog(onClose: () => void): void {
    act(() => {
      root.render(
        createElement(ThemeProvider, {
          storageKey: "app-settings-test-theme",
          children: createElement(
            StudioI18nProvider,
            null,
            createElement(AppSettingsDialog, { onClose }),
          ),
        }),
      );
    });
  }

  function button(label: string): HTMLButtonElement {
    const match = container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
    if (match !== null) return match;
    const visible = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
      (candidate) => candidate.textContent?.trim() === label,
    );
    if (visible === undefined) throw new Error(`Button '${label}' was not found.`);
    return visible;
  }

  function dialog(): HTMLElement {
    return container.querySelector<HTMLElement>('[role="dialog"]')!;
  }
});
