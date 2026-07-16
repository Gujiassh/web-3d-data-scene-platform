// @vitest-environment happy-dom

import { act, createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioI18nProvider } from "../i18n/I18nProvider";
import { SceneSettingsDialog } from "./SceneSettingsDialog";
import { directionFor, lightingForPreset, type SceneSettingsDraft } from "./model";

const initialDraft: SceneSettingsDraft = {
  backgroundMode: "theme",
  background: "#AABBCC",
  grid: true,
  lighting: lightingForPreset("standard"),
};

describe("SceneSettingsDialog", () => {
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

  it("previews controlled Appearance background and grid changes", () => {
    const spies = callbacks();
    renderDialog(spies);

    expect(tab("Appearance").getAttribute("aria-selected")).toBe("true");
    expect(input("Background color").disabled).toBe(true);
    act(() => input("Custom color").click());
    expect(spies.onPreview.mock.calls.at(-1)?.[0]).toMatchObject({
      backgroundMode: "custom",
      background: "#AABBCC",
      grid: true,
    });

    changeInput(input("Background color"), "#336699");
    act(() => inputByText("Show grid").click());
    expect(spies.onPreview.mock.calls.at(-1)?.[0]).toMatchObject({
      backgroundMode: "custom",
      background: "#336699",
      grid: false,
    });
    expect(spies.onDraftChange).toHaveBeenCalledTimes(3);
  });

  it("materializes concrete presets and derives Custom after lighting edits", () => {
    const spies = callbacks();
    renderDialog(spies);
    act(() => tab("Lighting").click());
    act(() => buttonByText("Soft").click());

    const softDraft = spies.onPreview.mock.calls.at(-1)?.[0];
    expect(softDraft?.lighting).toEqual(lightingForPreset("soft"));
    expect(softDraft).not.toHaveProperty("preset");
    expect(container.textContent).toContain("Current preset: Soft");

    changeInput(input("Fill brightness"), "2.1");
    expect(container.textContent).toContain("Current preset: Custom");
    changeSelect(select("Key light direction"), "e");
    expect(spies.onPreview.mock.calls.at(-1)?.[0].lighting.key.directionToLight).toEqual(
      directionFor("e"),
    );

    act(() => container.querySelector("summary")!.click());
    changeInput(input("Key light color"), "#123456");
    submitForm();
    const applied = spies.onApply.mock.calls[0]?.[0];
    expect(applied?.lighting.key).toMatchObject({
      color: "#123456",
      intensity: 1.2,
      directionToLight: directionFor("e"),
    });
    expect(applied).not.toHaveProperty("preset");
  });

  it("supports keyboard tabs, contains focus and cancels on Escape", () => {
    const spies = callbacks();
    renderDialog(spies);
    const background = container.querySelector<HTMLElement>("[data-dialog-background]")!;
    expect(background.inert).toBe(true);
    expect(document.activeElement).toBe(tab("Appearance"));

    act(() =>
      tab("Appearance").dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
      ),
    );
    expect(tab("Lighting").getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(tab("Lighting"));

    act(() => button("Cancel").click());
    expect(spies.onCancel).toHaveBeenCalledOnce();
    act(() =>
      dialog().dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })),
    );
    expect(spies.onCancel).toHaveBeenCalledTimes(2);
    expect(spies.onApply).not.toHaveBeenCalled();
  });

  it("reports Apply failure without closing or mutating the draft", () => {
    const spies = callbacks(false);
    renderDialog(spies);
    submitForm();

    expect(spies.onApply).toHaveBeenCalledWith(initialDraft);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "Could not apply scene settings",
    );
    expect(spies.onCancel).not.toHaveBeenCalled();
  });

  function renderDialog(value: ReturnType<typeof callbacks>): void {
    function Harness() {
      const [draft, setDraft] = useState(initialDraft);
      return createElement(
        "div",
        null,
        createElement("button", { "data-dialog-background": true }, "Background"),
        createElement(SceneSettingsDialog, {
          draft,
          onApply: value.onApply,
          onCancel: value.onCancel,
          onDraftChange: (next) => {
            value.onDraftChange(next);
            setDraft(next);
          },
          onPreview: value.onPreview,
        }),
      );
    }
    act(() => root.render(createElement(StudioI18nProvider, null, createElement(Harness))));
  }

  function input(label: string): HTMLInputElement {
    return container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
  }

  function inputByText(label: string): HTMLInputElement {
    const candidate = [...container.querySelectorAll<HTMLLabelElement>("label")].find(
      (element) => element.textContent?.trim() === label,
    );
    return candidate?.querySelector("input") as HTMLInputElement;
  }

  function select(label: string): HTMLSelectElement {
    return container.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`)!;
  }

  function buttonByText(text: string): HTMLButtonElement {
    const candidate = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
      (element) => element.textContent?.trim() === text,
    );
    if (candidate === undefined) throw new Error(`Button '${text}' was not found.`);
    return candidate;
  }

  function button(label: string): HTMLButtonElement {
    return container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
  }

  function tab(name: string): HTMLButtonElement {
    const candidate = [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
      (element) => element.textContent?.trim() === name,
    );
    if (candidate === undefined) throw new Error(`Tab '${name}' was not found.`);
    return candidate;
  }

  function dialog(): HTMLElement {
    return container.querySelector<HTMLElement>('[role="dialog"]')!;
  }

  function submitForm(): void {
    act(() =>
      container
        .querySelector<HTMLFormElement>("form")!
        .dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true })),
    );
  }
});

function callbacks(applyResult = true) {
  return {
    onApply: vi.fn<(draft: SceneSettingsDraft) => boolean>(() => applyResult),
    onCancel: vi.fn(),
    onDraftChange: vi.fn<(draft: SceneSettingsDraft) => void>(),
    onPreview: vi.fn<(draft: SceneSettingsDraft) => void>(),
  };
}

function changeInput(element: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  if (setter === undefined) throw new Error("HTMLInputElement value setter is unavailable.");
  act(() => {
    setter.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

function changeSelect(element: HTMLSelectElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
  if (setter === undefined) throw new Error("HTMLSelectElement value setter is unavailable.");
  act(() => {
    setter.call(element, value);
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
