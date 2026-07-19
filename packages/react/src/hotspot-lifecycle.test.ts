// @vitest-environment happy-dom

import { StrictMode, act, createElement, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  AuthoringViewerEvent,
  CreateAuthoringViewerOptions,
  SceneSource,
} from "@web3d/runtime";

const runtime = vi.hoisted(() => ({
  options: [] as CreateAuthoringViewerOptions[],
  viewers: [] as Array<Record<string, ReturnType<typeof vi.fn>>>,
}));

vi.mock("@web3d/runtime", () => ({
  createAuthoringSceneViewer(_container: HTMLElement, options: CreateAuthoringViewerOptions) {
    const viewer = fakeViewer();
    runtime.options.push(options);
    runtime.viewers.push(viewer);
    return viewer;
  },
}));

import { AuthoringScene, type AuthoringSceneHandle } from "./AuthoringScene";

describe("React hotspot lifecycle", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    runtime.options.length = 0;
    runtime.viewers.length = 0;
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("reconciles controlled authority in place under StrictMode", async () => {
    const first = { projectId: "project-a", sourceId: "source-a" };
    const second = { projectId: "project-b", sourceId: "source-b" };
    await act(async () => {
      root.render(
        createElement(
          StrictMode,
          null,
          createElement(AuthoringScene, { source: scene(), hotspotAuthority: first }),
        ),
      );
      await Promise.resolve();
    });

    expect(runtime.viewers).toHaveLength(2);
    const viewer = runtime.viewers.at(-1)!;
    expect(viewer.setHotspotAuthority).toHaveBeenLastCalledWith(first);

    await act(async () => {
      root.render(
        createElement(
          StrictMode,
          null,
          createElement(AuthoringScene, { source: scene(), hotspotAuthority: second }),
        ),
      );
      await Promise.resolve();
    });

    expect(runtime.viewers).toHaveLength(2);
    expect(runtime.viewers.at(-1)).toBe(viewer);
    expect(viewer.setHotspotAuthority).toHaveBeenLastCalledWith(second);
  });

  it("reconciles controlled hotspot order once without recreating the StrictMode viewer", async () => {
    const first = ["hotspot-b", "hotspot-a"];
    const second = ["hotspot-a", "hotspot-b"];
    await act(async () => {
      root.render(
        createElement(
          StrictMode,
          null,
          createElement(AuthoringScene, { source: scene(), hotspotOrder: first }),
        ),
      );
      await Promise.resolve();
    });

    expect(runtime.viewers).toHaveLength(2);
    const viewer = runtime.viewers.at(-1)!;
    expect(runtime.options.at(-1)?.hotspotOrder).toBe(first);
    expect(viewer.setHotspotOrder).not.toHaveBeenCalled();

    await act(async () => {
      root.render(
        createElement(
          StrictMode,
          null,
          createElement(AuthoringScene, { source: scene(), hotspotOrder: second }),
        ),
      );
      await Promise.resolve();
    });

    expect(runtime.viewers).toHaveLength(2);
    expect(runtime.viewers.at(-1)).toBe(viewer);
    expect(viewer.setHotspotOrder).toHaveBeenCalledOnce();
    expect(viewer.setHotspotOrder).toHaveBeenCalledWith(second);

    await act(async () => {
      root.render(
        createElement(
          StrictMode,
          null,
          createElement(AuthoringScene, {
            source: scene(),
            hotspotOrder: [...second],
          }),
        ),
      );
      await Promise.resolve();
    });
    expect(viewer.setHotspotOrder).toHaveBeenCalledOnce();
  });

  it("forwards current typed callbacks once and exposes narrow handles", async () => {
    const ref = createRef<AuthoringSceneHandle>();
    const first = vi.fn();
    const latest = vi.fn();
    const onSessionStart = vi.fn();
    const onSessionCancel = vi.fn();
    await act(async () => {
      root.render(
        createElement(AuthoringScene, {
          ref,
          source: scene(),
          onHotspotPlacementPreview: first,
        }),
      );
      await Promise.resolve();
    });
    const viewer = runtime.viewers.at(-1)!;
    const emit = runtime.options.at(-1)?.onEvent;

    await act(async () => {
      root.render(
        createElement(AuthoringScene, {
          ref,
          source: scene(),
          onHotspotPlacementPreview: latest,
          onHotspotSessionStart: onSessionStart,
          onHotspotSessionCancel: onSessionCancel,
        }),
      );
      await Promise.resolve();
    });
    const event = previewEvent();
    emit?.(event);
    expect(first).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledOnce();
    expect(latest).toHaveBeenCalledWith(event);
    const sessionStart = {
      type: "hotspot-session-start" as const,
      session: event.session,
      origin: "direct-pointer" as const,
    };
    emit?.(sessionStart);
    expect(onSessionStart).toHaveBeenCalledWith(sessionStart);
    expect(onSessionStart.mock.calls[0]?.[0].session.sessionId).toBe(event.session.sessionId);
    const invalidDrop = {
      type: "hotspot-session-cancel" as const,
      session: event.session,
      reason: "cancel" as const,
      requiresAcknowledgment: false,
      rejectionReason: "unsupported" as const,
    };
    emit?.(invalidDrop);
    expect(onSessionCancel).toHaveBeenCalledWith(invalidDrop);

    ref.current?.startHotspotReposition("hotspot-a");
    ref.current?.updateHotspotReticle(10, 20);
    ref.current?.cancelHotspotSession();
    ref.current?.finishHotspotDraft(7);
    ref.current?.acknowledgeHotspotCancellation(7);
    await ref.current?.focusHotspot("hotspot-a");
    ref.current?.focusHotspotProxy("hotspot-a");
    ref.current?.getHotspotViewState("hotspot-a");
    await ref.current?.activateHotspot("hotspot-a", "keyboard");
    expect(viewer.startHotspotReposition).toHaveBeenCalledWith("hotspot-a");
    expect(viewer.updateHotspotReticle).toHaveBeenCalledWith(10, 20);
    expect(viewer.cancelHotspotSession).toHaveBeenCalledOnce();
    expect(viewer.finishHotspotDraft).toHaveBeenCalledWith(7);
    expect(viewer.acknowledgeHotspotCancellation).toHaveBeenCalledWith(7);
    expect(viewer.focusHotspot).toHaveBeenCalledWith("hotspot-a");
    expect(viewer.focusHotspotProxy).toHaveBeenCalledWith("hotspot-a");
    expect(viewer.getHotspotViewState).toHaveBeenCalledWith("hotspot-a");
    expect(viewer.activateHotspot).toHaveBeenCalledWith("hotspot-a", "keyboard");
  });
});

function fakeViewer(): Record<string, ReturnType<typeof vi.fn>> {
  return {
    acknowledgeHotspotCancellation: vi.fn(() => true),
    acceptHotspotReticle: vi.fn(() => true),
    activateHotspot: vi.fn(() => Promise.resolve({})),
    cancelHotspotSession: vi.fn(),
    dispose: vi.fn(() => Promise.resolve()),
    focusEntity: vi.fn(() => Promise.resolve()),
    focusHotspot: vi.fn(() => Promise.resolve()),
    focusHotspotProxy: vi.fn(() => true),
    finishHotspotDraft: vi.fn(() => true),
    getDiagnostics: vi.fn(() => []),
    getEntitySpatialSnapshots: vi.fn(() => []),
    getLightCreationFrame: vi.fn(() => null),
    getHotspotViewState: vi.fn(() => ({
      annotationId: "hotspot-a",
      availability: "unavailable",
      unavailableReason: "annotation-not-found",
      resolution: "unresolved",
      unresolvedReason: null,
      markerVisible: false,
      screenAnchor: null,
    })),
    getSnapshot: vi.fn(() => ({ lifecycle: "created" })),
    getTool: vi.fn(() => "select"),
    isTransformDragging: vi.fn(() => false),
    load: vi.fn(() => Promise.resolve()),
    selectEntities: vi.fn(),
    selectEntity: vi.fn(),
    setAdapter: vi.fn(() => Promise.resolve()),
    setAuthoredLightPropertyPreview: vi.fn(() => true),
    setAuthoringMode: vi.fn(),
    setBackgroundPreview: vi.fn(),
    setCanvasLabel: vi.fn(),
    setDataRuntimeEnabled: vi.fn(() => Promise.resolve()),
    setGridPreview: vi.fn(),
    setHotspotAuthority: vi.fn(),
    setHotspotOrder: vi.fn(),
    setLightingPreview: vi.fn(),
    setSmartAlignEnabled: vi.fn(),
    setThemeBackground: vi.fn(),
    setTool: vi.fn(),
    setTransformSettings: vi.fn(),
    startHotspotPlacement: vi.fn(() => ({ sessionId: 1 })),
    startHotspotReposition: vi.fn(() => ({ sessionId: 2 })),
    updateHotspotReticle: vi.fn(),
  };
}

function previewEvent(): Extract<AuthoringViewerEvent, { type: "hotspot-placement-preview" }> {
  return {
    type: "hotspot-placement-preview",
    session: {
      sessionId: 7,
      kind: "placement",
      annotationId: null,
      authority: {
        mode: "edit",
        documentId: "scene-a",
        documentRevision: 1,
        projectId: "project-a",
        sourceId: "source-a",
        contextId: "webgl:0",
      },
    },
    result: { status: "rejected", reason: "unsupported" },
    screenAnchor: null,
  };
}

function scene(): SceneSource {
  return {
    schemaVersion: "1.4.0",
    id: "scene-a",
    name: "Scene",
    revision: 1,
    assets: [],
    entities: [],
    targets: [],
    dataSources: [],
    bindings: [],
    ruleSets: [],
    annotations: [],
    views: [],
    environment: {
      backgroundMode: "theme",
      background: "#FFFFFF",
      grid: false,
      unit: "m",
      upAxis: "Y",
      lighting: {
        fill: { skyColor: "#FFFFFF", groundColor: "#65706A", intensity: 1 },
        key: { color: "#FFFFFF", intensity: 1, directionToLight: [0, 1, 0] },
      },
    },
  };
}
