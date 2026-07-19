// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Annotation } from "@web3d/document";

import { StudioI18nProvider } from "../i18n/I18nProvider";
import { HotspotPopover } from "./HotspotPopover";
import { HotspotRunContent } from "./HotspotRunContent";
import { HotspotTitleEditor } from "./HotspotTitleEditor";

describe("Studio hotspot overlays", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    localStorage.clear();
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    localStorage.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("disables locked Rename, Reposition, and Delete while preserving allowed actions", () => {
    const callbacks = {
      onRename: vi.fn(),
      onReposition: vi.fn(),
      onToggleVisibility: vi.fn(),
      onToggleLock: vi.fn(),
      onDelete: vi.fn(),
      onMore: vi.fn(),
    };
    render(
      createElement(HotspotPopover, {
        annotation: hotspot({ locked: true }),
        anchor: { clientX: 500, clientY: 300 },
        ...callbacks,
      }),
    );

    expect(button("Rename").disabled).toBe(true);
    expect(button("Reposition").disabled).toBe(true);
    expect(button("Delete").disabled).toBe(true);
    expect(button("Hide").disabled).toBe(false);
    expect(button("Unlock").disabled).toBe(false);
    expect(button("More").disabled).toBe(false);
  });

  it.each([
    { width: 1280, height: 720 },
    { width: 1440, height: 900 },
  ])("clamps measured popover and title editor bounds at $width x $height", ({ width, height }) => {
    vi.stubGlobal("innerWidth", width);
    vi.stubGlobal("innerHeight", height);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
      this: HTMLElement,
    ) {
      const box = this.classList.contains("hotspot-popover")
        ? { width: 188, height: 34 }
        : this.classList.contains("hotspot-title-editor")
          ? { width: 280, height: 58 }
          : { width: 0, height: 0 };
      return rect(box.width, box.height);
    });

    render(
      createElement(
        "div",
        null,
        createElement(HotspotPopover, {
          annotation: hotspot(),
          anchor: { clientX: width - 1, clientY: height - 1 },
          onRename: vi.fn(),
          onReposition: vi.fn(),
          onToggleVisibility: vi.fn(),
          onToggleLock: vi.fn(),
          onDelete: vi.fn(),
          onMore: vi.fn(),
        }),
        createElement(HotspotTitleEditor, {
          editor: {
            kind: "rename" as const,
            session: null,
            annotationId: "hotspot-a",
            hit: null,
            screenAnchor: { clientX: width - 1, clientY: height - 1 },
            initialTitle: "Pump",
          },
          onCancel: vi.fn(),
          onConfirm: vi.fn(),
        }),
      ),
    );

    expectInside(container.querySelector<HTMLElement>(".hotspot-popover")!, 188, 34, width, height);
    expectInside(
      container.querySelector<HTMLElement>(".hotspot-title-editor")!,
      280,
      58,
      width,
      height,
    );
  });

  it("limits titles by Unicode scalars without rewriting accepted title bytes", () => {
    const onConfirm = vi.fn();
    render(
      createElement(HotspotTitleEditor, {
        editor: {
          kind: "create" as const,
          session: null,
          annotationId: null,
          hit: null,
          screenAnchor: { clientX: 300, clientY: 200 },
          initialTitle: "",
        },
        onCancel: vi.fn(),
        onConfirm,
      }),
    );
    const input = container.querySelector<HTMLInputElement>("input")!;
    const scalarLimit = ` ${"x".repeat(157)}\u{1F600} `;

    change(input, scalarLimit);
    act(() => input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter" })));
    expect(onConfirm).toHaveBeenCalledWith(scalarLimit);

    change(input, `${scalarLimit}y`);
    expect(input.value).toBe(scalarLimit);
  });

  it("renders a localized host request state without any host key", () => {
    render(
      createElement(HotspotRunContent, {
        content: {
          annotationId: "hotspot-a",
          title: "Pump",
          kind: "host-content" as const,
        },
        onClose: vi.fn(),
      }),
    );

    expect(container.textContent).toContain("Trusted host content request");
    expect(container.textContent).not.toContain("private.host.key");
  });

  function render(child: React.ReactNode): void {
    act(() => root.render(createElement(StudioI18nProvider, null, child)));
  }

  function button(label: string): HTMLButtonElement {
    return container.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!;
  }
});

function hotspot(overrides: Partial<Annotation> = {}): Annotation {
  return {
    id: "hotspot-a",
    title: "Pump",
    visible: true,
    locked: false,
    anchor: {
      kind: "surface",
      entityId: "entity-a",
      assetHash: "a".repeat(64),
      nodeIndex: 1,
      nodeLocalPosition: [0, 0, 0],
      nodeLocalNormal: [0, 1, 0],
    },
    content: { kind: "plain-text", text: "" },
    action: { type: "show-content" },
    ...overrides,
  };
}

function rect(width: number, height: number): DOMRect {
  return {
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: width,
    bottom: height,
    width,
    height,
    toJSON: () => ({}),
  };
}

function expectInside(
  element: HTMLElement,
  width: number,
  height: number,
  viewportWidth: number,
  viewportHeight: number,
): void {
  const left = Number.parseFloat(element.style.left);
  const top = Number.parseFloat(element.style.top);
  expect(left).toBeGreaterThanOrEqual(12);
  expect(top).toBeGreaterThanOrEqual(12);
  expect(left + width).toBeLessThanOrEqual(viewportWidth - 12);
  expect(top + height).toBeLessThanOrEqual(viewportHeight - 12);
}

function change(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  if (setter === undefined) throw new Error("HTMLInputElement value setter is unavailable.");
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
