// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Annotation, SceneDocument } from "@web3d/document";

import { StudioI18nProvider } from "../i18n/I18nProvider";
import { HotspotInspector } from "./HotspotInspector";

describe("HotspotInspector", () => {
  let container: HTMLDivElement;
  let root: Root;
  let onUpdate: ReturnType<typeof vi.fn<(before: Annotation, after: Annotation) => boolean>>;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    onUpdate = vi.fn(() => true);
    localStorage.clear();
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("commits at most 2000 plain-text Unicode scalars with one direct update", () => {
    const annotation = hotspot({ content: { kind: "plain-text", text: "Before" } });
    render(annotation);
    const editor = container.querySelector<HTMLTextAreaElement>("textarea")!;
    const scalarLimit = `${"x".repeat(1999)}\u{1F600}`;

    change(editor, scalarLimit);
    blur(editor);
    expect(onUpdate).toHaveBeenCalledOnce();
    expect(onUpdate).toHaveBeenCalledWith(annotation, {
      ...annotation,
      content: { kind: "plain-text", text: scalarLimit },
    });

    change(editor, `${scalarLimit}y`);
    expect(editor.value).toBe(scalarLimit);
    blur(editor);
    expect(onUpdate).toHaveBeenCalledOnce();
  });

  it("shows trusted content only by display name and replaces unavailable keys exactly", () => {
    const annotation = hotspot({
      content: { kind: "host-content", key: "private.raw.key" },
    });
    render(annotation, {
      trustedContentCatalog: [{ key: "trusted.summary", displayName: "Shift summary" }],
    });

    expect(container.textContent).not.toContain("private.raw.key");
    expect(container.textContent).not.toContain("trusted.summary");
    expect(container.textContent).toContain("saved trusted content is unavailable");
    expect(
      [...container.querySelectorAll<HTMLInputElement>("input")].some(
        (input) => input.value === "private.raw.key",
      ),
    ).toBe(false);

    act(() => button("Shift summary").click());
    expect(onUpdate).toHaveBeenCalledOnce();
    expect(onUpdate).toHaveBeenCalledWith(annotation, {
      ...annotation,
      content: { kind: "host-content", key: "trusted.summary" },
    });
  });

  it("does not guess a Target and stores only the exact searched selection", () => {
    const annotation = hotspot();
    render(annotation, { document: scene(annotation, true) });

    act(() => button("Focus target").click());
    expect(onUpdate).not.toHaveBeenCalled();
    expect(container.querySelector('input[placeholder="https://example.com"]')).toBeNull();
    const targetSearch = container.querySelector<HTMLInputElement>(
      'input[placeholder="Search targets"]',
    )!;
    change(targetSearch, "boiler");
    expect(container.textContent).not.toContain("target-boiler");
    act(() => button("Boiler feed").click());

    expect(onUpdate).toHaveBeenCalledOnce();
    expect(onUpdate).toHaveBeenCalledWith(annotation, {
      ...annotation,
      action: { type: "focus-target", targetId: "target-boiler" },
    });
  });

  it("renders URL controls only for Open link and blocks invalid values without mutation", () => {
    const annotation = hotspot();
    render(annotation, { document: scene(annotation, true) });

    act(() => button("Open link").click());
    expect(container.querySelector('input[placeholder="Search targets"]')).toBeNull();
    const link = container.querySelector<HTMLInputElement>(
      'input[placeholder="https://example.com"]',
    )!;
    change(link, "http://example.com");
    blur(link);
    expect(onUpdate).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Enter a valid HTTPS link");

    change(link, `https://${"a".repeat(2041)}`);
    blur(link);
    expect(onUpdate).not.toHaveBeenCalled();

    change(link, "https://example.com/manual");
    act(() => link.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    expect(onUpdate).toHaveBeenCalledOnce();
    expect(onUpdate).toHaveBeenCalledWith(annotation, {
      ...annotation,
      action: { type: "open-link", href: "https://example.com/manual" },
    });
  });

  it("disables every content and behavior mutation for locked hotspots", () => {
    const annotation = hotspot({ locked: true });
    render(annotation, { editable: false, document: scene(annotation, true) });

    const controls = [
      ...container.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLTextAreaElement>(
        "button, input, textarea",
      ),
    ].filter((control) => control.getAttribute("aria-label") !== "Close hotspot inspector");
    expect(controls.length).toBeGreaterThan(0);
    expect(controls.every((control) => control.disabled)).toBe(true);
    for (const control of controls) act(() => control.click());
    expect(onUpdate).not.toHaveBeenCalled();
  });

  function render(
    annotation: Annotation,
    overrides: Partial<{
      document: SceneDocument;
      editable: boolean;
      trustedContentCatalog: readonly { readonly key: string; readonly displayName: string }[];
    }> = {},
  ): void {
    act(() =>
      root.render(
        createElement(
          StudioI18nProvider,
          null,
          createElement(HotspotInspector, {
            annotation,
            document: overrides.document ?? scene(annotation),
            editable: overrides.editable ?? true,
            trustedContentCatalog: overrides.trustedContentCatalog ?? [],
            onClose: vi.fn(),
            onUpdate,
          }),
        ),
      ),
    );
  }

  function button(text: string): HTMLButtonElement {
    return [...container.querySelectorAll<HTMLButtonElement>("button")].find(
      (candidate) => candidate.textContent?.trim() === text,
    )!;
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

function scene(annotation: Annotation, withTargets = false): SceneDocument {
  return {
    schemaVersion: "1.4.0",
    id: "scene-a",
    name: "Scene",
    revision: 1,
    assets: [],
    entities: [],
    targets: withTargets
      ? [
          {
            id: "target-boiler",
            entityId: "entity-a",
            name: "Boiler feed",
            assetHash: "a".repeat(64),
            nodeIndex: 1,
            metadata: {},
          },
          {
            id: "target-pump",
            entityId: "entity-a",
            name: "Pump outlet",
            assetHash: "a".repeat(64),
            nodeIndex: 2,
            metadata: {},
          },
        ]
      : [],
    dataSources: [],
    bindings: [],
    ruleSets: [],
    annotations: [annotation],
    views: [],
    environment: {
      backgroundMode: "theme",
      background: "#FFFFFF",
      grid: true,
      unit: "m",
      upAxis: "Y",
      lighting: {
        fill: { skyColor: "#FFFFFF", groundColor: "#65706A", intensity: 1 },
        key: { color: "#FFFFFF", intensity: 1, directionToLight: [0, 1, 0] },
      },
    },
  };
}

function change(element: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const prototype =
    element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  if (setter === undefined) throw new Error("Form control value setter is unavailable.");
  act(() => {
    setter.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

function blur(element: HTMLInputElement | HTMLTextAreaElement): void {
  act(() => {
    element.focus();
    element.blur();
  });
}
