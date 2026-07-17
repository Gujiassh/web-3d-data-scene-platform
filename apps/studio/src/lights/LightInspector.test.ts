// @vitest-environment happy-dom

import { act, createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DocumentCommand, LightEntity } from "@web3d/document";

import { StudioI18nProvider } from "../i18n/I18nProvider";
import { LightInspector } from "./LightInspector";

describe("LightInspector", () => {
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
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("previews slider movement and commits one command when the gesture ends", () => {
    const harness = renderInspector(point());
    const slider = input("Brightness slider");
    changeInput(slider, "40");
    changeInput(slider, "55");

    expect(harness.onPreview).toHaveBeenCalledTimes(2);
    expect(harness.onPreview.mock.calls.at(-1)?.[0].light.intensity).toBe(55);
    expect(harness.execute).not.toHaveBeenCalled();
    act(() => slider.dispatchEvent(new PointerEvent("pointerup", { bubbles: true })));
    act(() => slider.dispatchEvent(new FocusEvent("blur", { bubbles: true })));

    expect(harness.execute).toHaveBeenCalledOnce();
    expect(updateCommand(harness.execute).after.light.intensity).toBe(55);
    expect(container.querySelector("form")).toBeNull();
    expect(container.textContent).not.toContain("Apply");
  });

  it("commits exact numeric and transform edits on blur without a form action", () => {
    const harness = renderInspector(point());
    changeInput(input("Brightness"), "750");
    expect(input("Brightness slider").value).toBe("100");
    blur(input("Brightness"));
    expect(updateCommand(harness.execute).after.light.intensity).toBe(750);

    harness.execute.mockClear();
    changeInput(input("Position X"), "4");
    expect(harness.execute).not.toHaveBeenCalled();
    blur(input("Position X"));
    expect(updateCommand(harness.execute).after.transform.position).toEqual([4, 2, 0]);
    expect(container.querySelector('input[aria-label="Rotation (degrees) X"]')).toBeNull();
    expect(container.textContent).not.toContain("Scale");
  });

  it("cancels invalid preview and restores rejected direct edits", () => {
    const harness = renderInspector(spot(), "rejected");
    changeInput(input("Brightness"), "1001");
    expect(harness.onCancelPreview).toHaveBeenCalledOnce();
    blur(input("Brightness"));
    expect(harness.execute).not.toHaveBeenCalled();
    expect(input("Brightness").getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(input("Brightness"));

    changeInput(input("Brightness"), "20");
    blur(input("Brightness"));
    expect(harness.execute).toHaveBeenCalledOnce();
    expect(input("Brightness").value).toBe("10");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "Could not update the light",
    );
  });

  it("invalidates an active slider before Undo so late completion cannot commit", () => {
    const harness = renderInspector(point());
    const slider = input("Brightness slider");
    changeInput(slider, "60");
    act(() => harness.cancelFromController());
    act(() => slider.dispatchEvent(new PointerEvent("pointerup", { bubbles: true })));
    act(() => slider.dispatchEvent(new FocusEvent("blur", { bubbles: true })));

    expect(harness.execute).not.toHaveBeenCalled();
  });

  it("previews color continuously and commits once across duplicate completion events", () => {
    const harness = renderInspector(point());
    const color = input("Color");
    previewColor(color, "#336699");
    previewColor(color, "#4477AA");
    expect(harness.onPreview).toHaveBeenCalledTimes(2);
    expect(harness.onPreview.mock.calls.at(-1)?.[0].light.color).toBe("#4477AA");
    expect(harness.execute).not.toHaveBeenCalled();

    act(() => color.dispatchEvent(new Event("change", { bubbles: true })));
    act(() => color.dispatchEvent(new FocusEvent("blur", { bubbles: true })));
    expect(harness.execute).toHaveBeenCalledOnce();
    expect(updateCommand(harness.execute).after.light.color).toBe("#4477AA");
    expect(harness.onAcceptPreview).toHaveBeenCalledWith(
      expect.objectContaining({ light: expect.objectContaining({ color: "#4477AA" }) }),
      2,
    );
  });

  it("invalidates color before Undo so late change and blur cannot commit", () => {
    const harness = renderInspector(point());
    const color = input("Color");
    previewColor(color, "#336699");
    act(() => harness.cancelFromController());
    act(() => color.dispatchEvent(new Event("change", { bubbles: true })));
    act(() => color.dispatchEvent(new FocusEvent("blur", { bubbles: true })));
    expect(harness.execute).not.toHaveBeenCalled();
  });

  it("restores authoritative color when a direct color commit is rejected", () => {
    const harness = renderInspector(point(), "rejected");
    const color = input("Color");
    previewColor(color, "#336699");
    act(() => color.dispatchEvent(new Event("change", { bubbles: true })));
    expect(harness.execute).toHaveBeenCalledOnce();
    expect(input("Color").value).toBe("#ffffff");
    expect(harness.onCancelPreview).toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "Could not update the light",
    );
  });

  it("commits spot angle, penumbra and rotation as separate accepted operations", () => {
    const harness = renderInspector(spot());
    changeInput(input("Beam angle (degrees)"), "60");
    blur(input("Beam angle (degrees)"));
    expect(updateCommand(harness.execute).after.light).toMatchObject({
      kind: "spot",
      angleRadians: Math.PI / 3,
    });

    harness.execute.mockClear();
    changeInput(input("Penumbra"), "0.5");
    blur(input("Penumbra"));
    expect(updateCommand(harness.execute).after.light).toMatchObject({
      kind: "spot",
      penumbra: 0.5,
    });

    harness.execute.mockClear();
    changeInput(input("Rotation (degrees) X"), "15");
    blur(input("Rotation (degrees) X"));
    expect(updateCommand(harness.execute).after.transform.rotation).not.toEqual(
      updateCommand(harness.execute).before.transform.rotation,
    );
  });

  function renderInspector(entity: LightEntity, outcome: "changed" | "rejected" = "changed") {
    const execute = vi.fn<
      (
        command: DocumentCommand,
      ) => { status: "changed"; revision: number } | { status: "rejected"; message: string }
    >(() =>
      outcome === "changed"
        ? { status: "changed", revision: 2 }
        : { status: "rejected", message: "stale" },
    );
    const onPreview = vi.fn<(entity: LightEntity) => void>();
    const onCancelPreview = vi.fn();
    const onAcceptPreview = vi.fn<(entity: LightEntity, revision: number) => void>();
    let cancelFromController = (): void => undefined;
    function Harness() {
      const [authoritative, setAuthoritative] = useState(entity);
      const [revision, setRevision] = useState(1);
      const [previewCancellation, setPreviewCancellation] = useState(0);
      cancelFromController = () => setPreviewCancellation((current) => current + 1);
      return createElement(LightInspector, {
        key: `${authoritative.id}:${revision}`,
        entity: authoritative,
        editable: true,
        execute: (command) => {
          const result = execute(command);
          if (result.status === "changed" && command.type === "update-light-entity") {
            setAuthoritative(command.after);
            setRevision((current) => current + 1);
          }
          return result;
        },
        previewCancellation,
        onAcceptPreview,
        onCancelPreview,
        onPreview,
      });
    }
    act(() => root.render(createElement(StudioI18nProvider, null, createElement(Harness))));
    return {
      execute,
      onAcceptPreview,
      onCancelPreview,
      onPreview,
      cancelFromController: () => cancelFromController(),
    };
  }

  function input(label: string): HTMLInputElement {
    return container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
  }
});

function updateCommand(execute: ReturnType<typeof vi.fn>) {
  return execute.mock.calls[0]?.[0] as Extract<DocumentCommand, { type: "update-light-entity" }>;
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

function blur(element: HTMLInputElement): void {
  act(() => {
    element.focus();
    element.blur();
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

function point(): LightEntity {
  return { ...common(), light: { kind: "point", color: "#FFFFFF", intensity: 25, range: null } };
}

function spot(): LightEntity {
  return {
    ...common(),
    light: {
      kind: "spot",
      color: "#FFFFFF",
      intensity: 10,
      range: null,
      angleRadians: Math.PI / 4,
      penumbra: 1 / 3,
    },
  };
}

function common() {
  return {
    id: "light-a",
    type: "light" as const,
    parentId: null,
    name: "Light A",
    visible: true,
    locked: false,
    transform: { position: [0, 2, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
    metadata: {},
  } as const;
}
