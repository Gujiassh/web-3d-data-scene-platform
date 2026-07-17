// @vitest-environment happy-dom

import { act, createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioI18nProvider } from "../i18n/I18nProvider";
import { LightingMenu } from "./LightingMenu";

describe("LightingMenu", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("exposes one compact menu with exact actions, count and keyboard focus restoration", () => {
    const callbacks = renderMenu();
    act(() => trigger().click());

    const items = menuItems();
    expect(menu().getAttribute("aria-label")).toBe("Lighting actions");
    expect(items.map((item) => item.querySelector("strong")?.textContent)).toEqual([
      "Add point",
      "Add spot",
      "Scene lighting settings",
    ]);
    expect(menu().textContent).toContain("3/8");
    expect(callbacks.onRefreshAvailability).toHaveBeenCalledOnce();

    act(() => items[0]!.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true })));
    expect(document.activeElement).toBe(items[2]);
    act(() =>
      items[2]!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })),
    );
    expect(document.activeElement).toBe(items[0]);
    act(() =>
      items[0]!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })),
    );
    expect(container.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(trigger());

    act(() => trigger().click());
    act(() => document.body.dispatchEvent(new Event("pointerdown", { bubbles: true })));
    expect(container.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it("keeps disabled actions focusable and exposes localized Run, cap and readiness reasons", () => {
    renderMenu({ addDisabledReason: "The viewport is not ready to place a light." });
    act(() => trigger().click());
    expect(menuItems()[0]!.getAttribute("aria-disabled")).toBe("true");
    expect(menuItems()[0]!.textContent).toContain("viewport is not ready");

    act(() => root.unmount());
    root = createRoot(container);
    renderMenu({
      addDisabledReason: "The scene already has 8 authored lights.",
      settingsDisabledReason: "Lighting authoring is disabled in Run mode.",
      lightCount: 8,
    });
    act(() => trigger().click());
    expect(menuItems()[0]!.textContent).toContain("8 authored lights");
    expect(menuItems()[2]!.textContent).toContain("disabled in Run mode");
    expect(menu().textContent).toContain("8/8");
  });

  it("closes after successful Add and transfers settings ownership without reopening the menu", () => {
    const callbacks = renderMenu();
    act(() => trigger().click());
    act(() => menuItems()[1]!.click());
    expect(callbacks.onAdd).toHaveBeenCalledWith("spot");
    expect(container.querySelector('[role="menu"]')).toBeNull();

    act(() => trigger().click());
    act(() => menuItems()[2]!.click());
    expect(callbacks.onOpenSceneSettings).toHaveBeenCalledOnce();
    expect(container.querySelector('[role="menu"]')).toBeNull();
  });

  function renderMenu(
    overrides: Partial<{
      addDisabledReason: string | null;
      settingsDisabledReason: string | null;
      lightCount: number;
    }> = {},
  ) {
    const callbacks = {
      onAdd: vi.fn(() => true),
      onOpenSceneSettings: vi.fn(),
      onRefreshAvailability: vi.fn(),
    };
    function Harness() {
      const [open, setOpen] = useState(false);
      return createElement(LightingMenu, {
        open,
        lightCount: overrides.lightCount ?? 3,
        addDisabledReason: overrides.addDisabledReason ?? null,
        settingsDisabledReason: overrides.settingsDisabledReason ?? null,
        onAdd: callbacks.onAdd,
        onOpenChange: setOpen,
        onOpenSceneSettings: callbacks.onOpenSceneSettings,
        onRefreshAvailability: callbacks.onRefreshAvailability,
      });
    }
    act(() => root.render(createElement(StudioI18nProvider, null, createElement(Harness))));
    return callbacks;
  }

  function trigger(): HTMLButtonElement {
    return container.querySelector<HTMLButtonElement>('[data-testid="lighting-menu-trigger"]')!;
  }

  function menu(): HTMLElement {
    return container.querySelector<HTMLElement>('[role="menu"]')!;
  }

  function menuItems(): HTMLButtonElement[] {
    return [...container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
  }
});
