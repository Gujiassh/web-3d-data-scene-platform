// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Transform } from "@web3d/document";

import { StudioI18nProvider } from "../i18n/I18nProvider";
import { TransformEditor } from "./TransformEditor";
import type { TransformResetComponent } from "./transform-reset";

const transform: Transform = {
  position: [1, 2, 3],
  rotation: [0, 0, 0, 1],
  scale: [1, 1, 1],
};

describe("TransformEditor", () => {
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

  it("commits all intrinsic XYZ rotation fields as one normalized quaternion", () => {
    const onCommit = vi.fn<(after: Transform) => { status: "changed"; revision: number }>(() => ({
      status: "changed",
      revision: 2,
    }));
    renderEditor(onCommit);
    changeInput(input("Rotation (degrees) X"), "30");
    changeInput(input("Rotation (degrees) Y"), "-45");
    changeInput(input("Rotation (degrees) Z"), "90");
    blurInput(input("Rotation (degrees) Z"));

    expect(onCommit).toHaveBeenCalledOnce();
    const after = onCommit.mock.calls[0]![0];
    expect(after.position).toBe(transform.position);
    expect(after.scale).toBe(transform.scale);
    expect(Math.hypot(...after.rotation)).toBeCloseTo(1, 12);
  });

  it("keeps invalid drafts visible without dispatch and restores valid rejected drafts", () => {
    const onCommit = vi.fn(() => ({ status: "rejected" as const, message: "stale" }));
    renderEditor(onCommit);
    const scaleX = input("Scale X");
    changeInput(scaleX, "0");
    blurInput(scaleX);
    expect(scaleX.value).toBe("0");
    expect(scaleX.getAttribute("aria-invalid")).toBe("true");
    expect(onCommit).not.toHaveBeenCalled();

    changeInput(scaleX, "2");
    blurInput(scaleX);
    expect(onCommit).toHaveBeenCalledOnce();
    expect(scaleX.value).toBe("1");
    expect(scaleX.getAttribute("aria-invalid")).toBe("false");
  });

  it("keeps a row draft across intra-row focus and commits once when leaving the row", () => {
    const onCommit = vi.fn<(after: Transform) => { status: "changed"; revision: number }>(() => ({
      status: "changed",
      revision: 2,
    }));
    renderEditor(onCommit);
    const positionX = input("Position X");
    const positionY = input("Position Y");
    changeInput(positionX, "4");

    blurInput(positionX, positionY);
    expect(onCommit).not.toHaveBeenCalled();
    changeInput(positionY, "5");
    blurInput(positionY);

    expect(onCommit).toHaveBeenCalledOnce();
    expect(onCommit.mock.calls[0]![0].position).toEqual([4, 5, 3]);
  });

  it("does not dispatch untouched high-precision authoritative display rows", () => {
    const onCommit = vi.fn(() => ({ status: "unchanged" as const, revision: 1 }));
    renderEditor(onCommit, undefined, {
      position: [1.123456789, -2.987654321, 3.000000001],
      rotation: [0.10259783520851541, -0.20519567041703082, 0.3077935056255462, 0.9233805168766387],
      scale: [1.000000009, 0.999999991, 2.123456789],
    });

    blurInput(input("Position X"));
    blurInput(input("Rotation (degrees) X"));
    blurInput(input("Scale X"));

    expect(onCommit).not.toHaveBeenCalled();
  });

  it("does not dispatch after an edited row returns to its authoritative display value", () => {
    const onCommit = vi.fn(() => ({ status: "unchanged" as const, revision: 1 }));
    renderEditor(onCommit);
    const positionX = input("Position X");
    const displayed = positionX.value;

    changeInput(positionX, "1.25");
    changeInput(positionX, displayed);
    blurInput(positionX);

    expect(onCommit).not.toHaveBeenCalled();
  });

  it("delegates component and all reset actions", () => {
    const onReset = vi.fn<
      (component: "position" | "rotation" | "scale" | "all") => {
        status: "unchanged";
        revision: number;
      }
    >(() => ({ status: "unchanged", revision: 1 }));
    renderEditor(
      vi.fn(() => ({ status: "unchanged" as const, revision: 1 })),
      onReset,
    );
    act(() =>
      container
        .querySelector<HTMLButtonElement>('button[aria-label="Reset local rotation"]')!
        .click(),
    );
    act(() => button("Reset all").click());
    expect(onReset.mock.calls.map(([component]) => component)).toEqual(["rotation", "all"]);
  });

  function renderEditor(
    onCommit: (
      after: Transform,
    ) =>
      | { readonly status: "changed"; readonly revision: number }
      | { readonly status: "unchanged"; readonly revision: number }
      | { readonly status: "rejected"; readonly message: string },
    onReset:
      | ((component: TransformResetComponent) => {
          readonly status: "unchanged";
          readonly revision: number;
        })
      | undefined = undefined,
    sourceTransform: Transform = transform,
  ): void {
    act(() => {
      root.render(
        createElement(
          StudioI18nProvider,
          null,
          createElement(TransformEditor, {
            transform: sourceTransform,
            editable: true,
            canReset: true,
            onCommit,
            onReset: onReset ?? vi.fn(() => ({ status: "unchanged" as const, revision: 1 })),
          }),
        ),
      );
    });
  }

  function input(label: string): HTMLInputElement {
    return container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
  }

  function button(text: string): HTMLButtonElement {
    const result = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
      (candidate) => candidate.textContent?.trim() === text,
    );
    if (result === undefined) throw new Error(`Button '${text}' was not found.`);
    return result;
  }
});

function changeInput(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  if (setter === undefined) throw new Error("HTMLInputElement value setter is unavailable.");
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function blurInput(input: HTMLInputElement, relatedTarget: EventTarget | null = null): void {
  act(() => input.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget })));
}
