// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioI18nProvider } from "../i18n/I18nProvider";
import { SceneBackgroundSettingsDialog } from "./SceneBackgroundSettingsDialog";

describe("SceneBackgroundSettingsDialog", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  it("previews a valid custom color and applies one complete settings value", () => {
    const onApply = vi.fn(() => true);
    const onCancel = vi.fn();
    const onPreview = vi.fn();
    renderDialog({ onApply, onCancel, onPreview });

    expect(container.querySelector('[role="dialog"]')?.getAttribute("aria-label")).toBe(
      "Scene settings",
    );
    const follow = input("Follow interface theme");
    const custom = input("Custom color");
    const text = input("Background color");
    const picker = input("Choose background color");
    expect(follow.checked).toBe(true);
    expect(custom.checked).toBe(false);
    expect(text.disabled).toBe(true);
    expect(picker.disabled).toBe(true);

    act(() => custom.click());
    expect(onPreview).toHaveBeenLastCalledWith("#AABBCC");
    expect(text.disabled).toBe(false);
    expect(picker.disabled).toBe(false);

    changeInput(text, "#bad");
    expect(text.getAttribute("aria-invalid")).toBe("true");
    expect(button("Apply").disabled).toBe(true);
    expect(onApply).not.toHaveBeenCalled();

    changeInput(text, "#336699");
    expect(text.getAttribute("aria-invalid")).toBe("false");
    expect(onPreview).toHaveBeenLastCalledWith("#336699");
    act(() => button("Apply").click());
    expect(onApply).toHaveBeenCalledOnce();
    expect(onApply).toHaveBeenCalledWith({
      backgroundMode: "custom",
      background: "#336699",
    });
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("cancels on its controls or Escape without applying", () => {
    const onApply = vi.fn(() => true);
    const onCancel = vi.fn();
    renderDialog({ onApply, onCancel, onPreview: vi.fn() });

    act(() => button("Cancel").click());
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onApply).not.toHaveBeenCalled();

    act(() =>
      container
        .querySelector<HTMLElement>('[role="dialog"]')!
        .dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })),
    );
    expect(onCancel).toHaveBeenCalledTimes(2);
    expect(button("Close scene settings")).not.toBeNull();

    act(() =>
      container
        .querySelector<HTMLElement>(".dialog-backdrop")!
        .dispatchEvent(new MouseEvent("mousedown", { bubbles: true })),
    );
    expect(onCancel).toHaveBeenCalledTimes(3);
    expect(onApply).not.toHaveBeenCalled();
  });

  it("contains focus, makes the background inert, and reports an apply failure", () => {
    const onApply = vi.fn(() => false);
    renderDialog({ onApply, onCancel: vi.fn(), onPreview: vi.fn() });

    const background = container.querySelector<HTMLElement>("[data-dialog-background]")!;
    const follow = input("Follow interface theme");
    const close = button("Close scene settings");
    const apply = button("Apply");
    expect(background.inert).toBe(true);
    expect(document.activeElement).toBe(follow);

    apply.focus();
    act(() => apply.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true })));
    expect(document.activeElement).toBe(close);
    act(() => input("Custom color").click());
    act(() => button("Apply").click());
    expect(onApply).toHaveBeenCalledOnce();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "Could not apply scene settings",
    );
  });

  function renderDialog(callbacks: {
    readonly onApply: (settings: {
      readonly backgroundMode: "theme" | "custom";
      readonly background: string;
    }) => boolean;
    readonly onCancel: () => void;
    readonly onPreview: (color: string) => void;
  }): void {
    act(() => {
      root.render(
        createElement(
          StudioI18nProvider,
          null,
          createElement(
            "div",
            null,
            createElement(
              "button",
              { "data-dialog-background": true, type: "button" },
              "Background",
            ),
            createElement(SceneBackgroundSettingsDialog, {
              initialSettings: { backgroundMode: "theme", background: "#AABBCC" },
              themeBackground: "#F4F6F5",
              ...callbacks,
            }),
          ),
        ),
      );
    });
  }

  function input(label: string): HTMLInputElement {
    return container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
  }

  function button(label: string): HTMLButtonElement {
    return container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
  }

  function changeInput(element: HTMLInputElement, value: string): void {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (setter === undefined) throw new Error("HTMLInputElement value setter is unavailable.");
    act(() => {
      setter.call(element, value);
      element.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }
});
