// @vitest-environment happy-dom

import { act, createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "@web3d/demo-support/theme-provider";

import { StudioI18nProvider } from "../i18n/I18nProvider";
import { directionFor, lightingForPreset, type SceneSettingsDraft } from "../scene-settings/model";
import { StudioSettingsDialog } from "./StudioSettingsDialog";

const initialDraft: SceneSettingsDraft = {
  backgroundMode: "theme",
  background: "#AABBCC",
  grid: true,
  lighting: lightingForPreset("standard"),
};

describe("StudioSettingsDialog", () => {
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
    vi.restoreAllMocks();
  });

  it("commits discrete Scene and Lighting operations immediately without form actions", () => {
    const spies = callbacks();
    renderDialog(spies);

    act(() => buttonByText("Chinese").click());
    act(() => buttonByText("深色").click());
    expect(localStorage.getItem("web3d.studio.locale")).toBe("zh-CN");
    expect(localStorage.getItem("studio-settings-test-theme")).toBe("dark");
    expect(spies.onCommitScene).not.toHaveBeenCalled();

    act(() => tab("场景").click());
    act(() => input("自定义颜色").click());
    act(() => tab("灯光").click());
    act(() => buttonByText("柔和").click());
    changeSelect(select("主光方向"), "e");

    expect(spies.onCommitScene).toHaveBeenCalledTimes(3);
    expect(spies.onCommitScene.mock.calls.at(-1)?.[0].lighting.key.directionToLight).toEqual(
      directionFor("e"),
    );
    expect(container.querySelector("form")).toBeNull();
    expect(container.querySelector("footer")).toBeNull();
    expect(container.textContent).not.toContain("应用场景更改");
  });

  it("previews every slider value and commits only once when the gesture ends", () => {
    const spies = callbacks();
    renderDialog(spies);
    act(() => tab("Lighting").click());
    const slider = input("Fill brightness");

    changeRange(slider, "2.3");
    changeRange(slider, "2.7");
    expect(spies.onPreviewScene).toHaveBeenCalledTimes(2);
    expect(spies.onCommitScene).not.toHaveBeenCalled();
    act(() => slider.dispatchEvent(new PointerEvent("pointerup", { bubbles: true })));
    act(() => slider.dispatchEvent(new FocusEvent("blur", { bubbles: true })));

    expect(spies.onCommitScene).toHaveBeenCalledOnce();
    expect(spies.onCommitScene.mock.calls[0]?.[0].lighting.fill.intensity).toBe(2.7);
  });

  it("drops an unfinished range preview when Settings closes", () => {
    const spies = callbacks();
    renderDialog(spies);
    act(() => tab("Lighting").click());
    const slider = input("Fill brightness");

    changeRange(slider, "2.8");
    expect(spies.onPreviewScene).toHaveBeenCalledOnce();
    expect(spies.onCommitScene).not.toHaveBeenCalled();
    act(() =>
      dialog().dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })),
    );

    expect(spies.onClose).toHaveBeenCalledOnce();
    expect(spies.onCommitScene).not.toHaveBeenCalled();
  });

  it("cancels a pointer-interrupted range gesture without committing", () => {
    const spies = callbacks();
    renderDialog(spies);
    act(() => tab("Lighting").click());
    const slider = input("Fill brightness");

    changeRange(slider, "2.6");
    act(() => slider.dispatchEvent(new PointerEvent("pointercancel", { bubbles: true })));

    expect(spies.onCancelScenePreview).toHaveBeenCalledOnce();
    expect(spies.onCommitScene).not.toHaveBeenCalled();
  });

  it("invalidates an active range gesture before Undo so late end signals cannot commit", () => {
    const spies = callbacks();
    renderDialog(spies);
    act(() => tab("Lighting").click());
    const slider = input("Fill brightness");
    changeRange(slider, "2.9");

    act(() =>
      dialog().dispatchEvent(
        new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true }),
      ),
    );
    act(() => slider.dispatchEvent(new PointerEvent("pointerup", { bubbles: true })));
    act(() => slider.dispatchEvent(new FocusEvent("blur", { bubbles: true })));

    expect(spies.onUndo).toHaveBeenCalledOnce();
    expect(spies.onCommitScene).not.toHaveBeenCalled();
  });

  it("invalidates an active color gesture before Undo so late end signals cannot commit", () => {
    const spies = callbacks();
    renderDialog(spies);
    act(() => tab("Scene").click());
    act(() => input("Custom color").click());
    spies.onCommitScene.mockClear();
    const color = input("Background color");
    previewColor(color, "#336699");

    act(() =>
      dialog().dispatchEvent(
        new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true }),
      ),
    );
    act(() => color.dispatchEvent(new Event("change", { bubbles: true })));
    act(() => color.dispatchEvent(new FocusEvent("blur", { bubbles: true })));

    expect(spies.onUndo).toHaveBeenCalledOnce();
    expect(spies.onCommitScene).not.toHaveBeenCalled();
  });

  it("supports keyboard tabs, dialog-local Undo/Redo, focus trap and accessible commit failure", () => {
    const spies = callbacks(false);
    renderDialog(spies);
    const background = container.querySelector<HTMLElement>("[data-dialog-background]")!;
    expect(background.inert).toBe(true);

    act(() =>
      tab("Application").dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
      ),
    );
    expect(document.activeElement).toBe(tab("Scene"));
    act(() => input("Custom color").click());
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "Could not update scene settings",
    );

    act(() =>
      dialog().dispatchEvent(
        new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true }),
      ),
    );
    act(() =>
      dialog().dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "z",
          ctrlKey: true,
          shiftKey: true,
          bubbles: true,
        }),
      ),
    );
    expect(spies.onUndo).toHaveBeenCalledOnce();
    expect(spies.onRedo).toHaveBeenCalledOnce();

    act(() =>
      dialog().dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })),
    );
    expect(spies.onClose).toHaveBeenCalledOnce();
  });

  it("keeps Application available when no editable scene draft exists", () => {
    const spies = callbacks();
    renderDialog(spies, false, false);

    expect(tab("Application").disabled).toBe(false);
    expect(tab("Scene").disabled).toBe(true);
    expect(tab("Lighting").disabled).toBe(true);
    expect(container.textContent).toContain(
      "Scene and lighting settings require a scene in Edit mode.",
    );
    act(() => buttonByText("Dark").click());
    expect(localStorage.getItem("studio-settings-test-theme")).toBe("dark");
  });

  function renderDialog(
    value: ReturnType<typeof callbacks>,
    sceneEditable = true,
    draftAvailable = true,
  ): void {
    function Harness() {
      const [draft, setDraft] = useState<SceneSettingsDraft | null>(
        draftAvailable ? initialDraft : null,
      );
      const [previewCancellation, setPreviewCancellation] = useState(0);
      return createElement(
        "div",
        null,
        createElement("button", { "data-dialog-background": true }, "Background"),
        createElement(StudioSettingsDialog, {
          draft,
          sceneEditable,
          previewCancellation,
          onCancelScenePreview: value.onCancelScenePreview,
          onClose: value.onClose,
          onCommitScene: (next: SceneSettingsDraft) => {
            const accepted = value.onCommitScene(next);
            if (accepted) setDraft(next);
            return accepted;
          },
          onPreviewScene: (next: SceneSettingsDraft) => {
            value.onPreviewScene(next);
            setDraft(next);
          },
          onRedo: () => {
            value.onRedo();
            setPreviewCancellation((current) => current + 1);
            setDraft(initialDraft);
          },
          onUndo: () => {
            value.onUndo();
            setPreviewCancellation((current) => current + 1);
            setDraft(initialDraft);
          },
        }),
      );
    }
    act(() => {
      root.render(
        createElement(ThemeProvider, {
          storageKey: "studio-settings-test-theme",
          children: createElement(StudioI18nProvider, null, createElement(Harness)),
        }),
      );
    });
  }

  function input(label: string): HTMLInputElement {
    return container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
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
});

function callbacks(commitResult = true) {
  return {
    onCommitScene: vi.fn<(draft: SceneSettingsDraft) => boolean>(() => commitResult),
    onCancelScenePreview: vi.fn(),
    onPreviewScene: vi.fn<(draft: SceneSettingsDraft) => void>(),
    onClose: vi.fn(),
    onRedo: vi.fn(),
    onUndo: vi.fn(),
  };
}

function changeSelect(element: HTMLSelectElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
  if (setter === undefined) throw new Error("HTMLSelectElement value setter is unavailable.");
  act(() => {
    setter.call(element, value);
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

function changeRange(element: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  if (setter === undefined) throw new Error("HTMLInputElement value setter is unavailable.");
  act(() => {
    setter.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

function previewColor(element: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  if (setter === undefined) throw new Error("HTMLInputElement value setter is unavailable.");
  act(() => {
    setter.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
