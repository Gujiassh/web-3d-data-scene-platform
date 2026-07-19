// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Annotation } from "@web3d/document";

import { StudioI18nProvider } from "../i18n/I18nProvider";
import { HotspotsPanel } from "./HotspotsPanel";
import type { HotspotListItem, StudioHotspots, StudioHotspotsEdit } from "./useStudioHotspots";

describe("HotspotsPanel keyboard interaction", () => {
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
    vi.restoreAllMocks();
  });

  it("implements roving navigation, Enter, F2, Delete, and row actions locally", () => {
    const hotspots = editHotspots([item("a", "Alpha"), item("b", "Beta"), item("c", "Gamma")]);
    render(hotspots);
    const options = rows();
    setRowBounds(options, 220);

    expect(options.map((option) => option.tabIndex)).toEqual([0, -1, -1]);
    options[0]!.focus();
    key(options[0]!, "ArrowDown");
    expect(document.activeElement).toBe(options[1]);
    key(options[1]!, "End");
    expect(document.activeElement).toBe(options[2]);
    key(options[2]!, "Home");
    expect(document.activeElement).toBe(options[0]);

    key(options[0]!, "Enter");
    expect(hotspots.select).toHaveBeenLastCalledWith("a", true, {
      clientX: 220,
      clientY: 19,
    });
    key(options[0]!, "F2");
    expect(hotspots.startRename).toHaveBeenCalledWith("a", {
      clientX: 220,
      clientY: 19,
    });
    key(options[0]!, "Delete");
    expect(hotspots.remove).toHaveBeenCalledWith("a");

    const action = button("Actions for Alpha");
    act(() => action.click());
    expect(hotspots.select).toHaveBeenLastCalledWith("a", true, {
      clientX: 220,
      clientY: 19,
    });
  });

  it("routes locked F2 and Delete through hook guards for live feedback", () => {
    const hotspots = editHotspots([item("locked", "Locked", { locked: true })]);
    render(hotspots);
    const option = rows()[0]!;
    setRowBounds([option], 220);

    key(option, "F2");
    key(option, "Delete");
    expect(hotspots.startRename).toHaveBeenCalledWith("locked", expect.any(Object));
    expect(hotspots.remove).toHaveBeenCalledWith("locked");
    key(option, "Enter");
    expect(hotspots.select).toHaveBeenCalledWith("locked", true, expect.any(Object));
  });

  it("consumes deterministic row focus requests after document-driven updates", () => {
    const hotspots = editHotspots([item("a", "Alpha"), item("b", "Beta")], {
      focusRequest: { sequence: 7, target: "row", annotationId: "b" },
    });
    render(hotspots);

    expect(document.activeElement).toBe(rows()[1]);
    expect(hotspots.clearFocusRequest).toHaveBeenCalledWith(7);
  });

  it("keeps Run rows read-only and activates Enter without edit affordances", () => {
    const hotspots = runHotspots([item("a", "Alpha")]);
    render(hotspots);
    const option = rows()[0]!;
    setRowBounds([option], 220);

    expect(container.querySelector('[aria-label="Actions for Alpha"]')).toBeNull();
    key(option, "F2");
    key(option, "Delete");
    key(option, "Enter");
    expect(hotspots.activate).toHaveBeenCalledWith("a");
  });

  it("disables unresolved Run rows with the exact localized reason", () => {
    const unresolved = item("a", "Alpha");
    const hotspots = runHotspots([
      {
        ...unresolved,
        state: {
          annotationId: "a",
          availability: "available",
          unavailableReason: null,
          resolution: "unresolved",
          unresolvedReason: "asset-hash-mismatch",
          markerVisible: false,
          screenAnchor: null,
        },
      },
    ]);
    render(hotspots);

    const option = rows()[0]!;
    expect(option.disabled).toBe(true);
    expect(option.textContent).toContain("The model asset has changed");
    act(() => option.click());
    expect(hotspots.activate).not.toHaveBeenCalled();
  });

  function render(hotspots: StudioHotspots): void {
    act(() =>
      root.render(
        createElement(StudioI18nProvider, null, createElement(HotspotsPanel, { hotspots })),
      ),
    );
  }

  function rows(): HTMLButtonElement[] {
    return [...container.querySelectorAll<HTMLButtonElement>('[role="option"]')];
  }

  function button(label: string): HTMLButtonElement {
    return container.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!;
  }
});

function editHotspots(
  items: readonly HotspotListItem[],
  overrides: Partial<StudioHotspotsEdit> = {},
): StudioHotspotsEdit {
  return {
    ...baseHotspots(items),
    mode: "edit",
    startPlacement: vi.fn(),
    cancelDraft: vi.fn(),
    confirmTitle: vi.fn(),
    startRename: vi.fn(),
    startReposition: vi.fn(),
    toggleVisibility: vi.fn(),
    toggleLock: vi.fn(),
    remove: vi.fn(),
    update: vi.fn(() => true),
    closePopover: vi.fn(),
    openInspector: vi.fn(),
    closeInspector: vi.fn(),
    ...overrides,
  };
}

function runHotspots(items: readonly HotspotListItem[]) {
  return { ...baseHotspots(items), mode: "run" as const };
}

function baseHotspots(items: readonly HotspotListItem[]) {
  return {
    mode: "run" as const,
    items,
    orderedIds: items.map((value) => value.annotation.id),
    selectedId: null,
    selected: null,
    selectedViewState: null,
    titleEditor: null,
    popoverAnchor: null,
    runContent: null,
    status: null,
    focusRequest: null,
    placementActive: false,
    inspectorOpen: false,
    select: vi.fn(),
    clearSelection: vi.fn(),
    clearFocusRequest: vi.fn(),
    focus: vi.fn(),
    activate: vi.fn(),
    handlePlacementPreview: vi.fn(),
    handleSessionStart: vi.fn(),
    handlePlacementAccept: vi.fn(),
    handleSessionCancel: vi.fn(),
    handleSelectionRequest: vi.fn(),
    handleActivation: vi.fn(),
    handleContent: vi.fn(),
    handleHostContent: vi.fn(),
    closeRunContent: vi.fn(),
    handleViewerReady: vi.fn(),
  };
}

function item(id: string, title: string, overrides: Partial<Annotation> = {}): HotspotListItem {
  const annotation: Annotation = {
    id,
    title,
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
  return {
    annotation,
    state: {
      annotationId: id,
      availability: "available",
      unavailableReason: null,
      resolution: "resolved",
      unresolvedReason: null,
      markerVisible: annotation.visible,
      screenAnchor: annotation.visible ? { clientX: 500, clientY: 300 } : null,
    },
  };
}

function setRowBounds(options: readonly HTMLButtonElement[], right: number): void {
  for (const option of options) {
    const row = option.closest<HTMLElement>(".hotspot-row")!;
    vi.spyOn(row, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right,
      bottom: 38,
      width: right,
      height: 38,
      toJSON: () => ({}),
    });
  }
}

function key(element: HTMLElement, value: string): void {
  act(() =>
    element.dispatchEvent(
      new KeyboardEvent("keydown", { key: value, bubbles: true, cancelable: true }),
    ),
  );
}
