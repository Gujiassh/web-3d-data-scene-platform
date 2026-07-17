// @vitest-environment happy-dom

import { StrictMode, act, createElement, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  AuthoredLightPropertyPreview,
  CreateAuthoringViewerOptions,
  SceneSource,
} from "@web3d/runtime";
import type { SceneLighting } from "@web3d/document";

interface FakeViewer {
  readonly canvas: HTMLCanvasElement;
  readonly dispose: ReturnType<typeof vi.fn>;
  readonly load: ReturnType<typeof vi.fn>;
  readonly getLightCreationFrame: ReturnType<typeof vi.fn>;
  readonly setAuthoringMode: ReturnType<typeof vi.fn>;
  readonly setBackgroundPreview: ReturnType<typeof vi.fn>;
  readonly setGridPreview: ReturnType<typeof vi.fn>;
  readonly setLightingPreview: ReturnType<typeof vi.fn>;
  readonly setAuthoredLightPropertyPreview: ReturnType<typeof vi.fn>;
  readonly setThemeBackground: ReturnType<typeof vi.fn>;
}

const runtime = vi.hoisted(() => ({
  authoringOptions: [] as CreateAuthoringViewerOptions[],
  authoringViewers: [] as FakeViewer[],
  loadImplementation: null as ((source: SceneSource) => Promise<void>) | null,
  readonlyViewers: [] as FakeViewer[],
}));

vi.mock("@web3d/runtime", () => {
  const createViewer = (container: HTMLElement): FakeViewer & Record<string, unknown> => {
    const canvas = document.createElement("canvas");
    container.append(canvas);
    return {
      canvas,
      dispose: vi.fn(() => {
        canvas.remove();
        return Promise.resolve();
      }),
      getDiagnostics: vi.fn(() => []),
      getEntitySpatialSnapshots: vi.fn(() => []),
      getLightCreationFrame: vi.fn(() =>
        Object.freeze({
          position: Object.freeze([0, 2, 0]),
          target: Object.freeze([0, 0, 0]),
        }),
      ),
      isTransformDragging: vi.fn(() => false),
      getSnapshot: vi.fn(() => ({ lifecycle: "created" })),
      getTool: vi.fn(() => "select"),
      load: vi.fn(
        (source: SceneSource) => runtime.loadImplementation?.(source) ?? Promise.resolve(),
      ),
      resize: vi.fn(),
      selectEntity: vi.fn(),
      selectEntities: vi.fn(),
      selectTarget: vi.fn(),
      setAdapter: vi.fn(() => Promise.resolve()),
      setAuthoringMode: vi.fn(),
      setBackgroundPreview: vi.fn(),
      setGridPreview: vi.fn(),
      setLightingPreview: vi.fn(),
      setAuthoredLightPropertyPreview: vi.fn(() => true),
      setCanvasLabel: vi.fn(),
      setDataRuntimeEnabled: vi.fn(() => Promise.resolve()),
      setThemeBackground: vi.fn(),
      setTool: vi.fn(),
      setTransformSettings: vi.fn(),
      setSmartAlignEnabled: vi.fn(),
      setView: vi.fn(() => Promise.resolve()),
    };
  };

  return {
    createAuthoringSceneViewer(container: HTMLElement, options: CreateAuthoringViewerOptions) {
      const viewer = createViewer(container);
      runtime.authoringOptions.push(options);
      runtime.authoringViewers.push(viewer);
      return viewer;
    },
    createSceneViewer(container: HTMLElement) {
      const viewer = createViewer(container);
      runtime.readonlyViewers.push(viewer);
      return viewer;
    },
  };
});

import { AuthoringScene } from "./AuthoringScene";
import type { AuthoringSceneHandle } from "./AuthoringScene";
import { SceneViewer } from "./SceneViewer";

describe("React scene environment lifecycle", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    runtime.authoringViewers.length = 0;
    runtime.authoringOptions.length = 0;
    runtime.readonlyViewers.length = 0;
    runtime.loadImplementation = null;
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  it("reconciles StrictMode theme updates without recreating the authoring viewer or canvas", async () => {
    const sourceA = scene("scene-a");
    const sourceB = scene("scene-b");
    await act(async () => {
      root.render(
        createElement(
          StrictMode,
          null,
          createElement(AuthoringScene, {
            source: sourceA,
            themeBackground: "#112233",
            backgroundPreview: null,
            gridPreview: null,
            lightingPreview: null,
          }),
        ),
      );
      await Promise.resolve();
    });

    expect(runtime.authoringViewers).toHaveLength(2);
    const viewer = requiredViewer(runtime.authoringViewers);
    const canvas = viewer.canvas;
    expect(viewer.setThemeBackground).toHaveBeenLastCalledWith("#112233");
    expect(viewer.setBackgroundPreview).toHaveBeenLastCalledWith(null);
    expect(viewer.setGridPreview).toHaveBeenLastCalledWith(null);
    expect(viewer.setLightingPreview).toHaveBeenLastCalledWith(null);

    await act(async () => {
      root.render(
        createElement(
          StrictMode,
          null,
          createElement(AuthoringScene, {
            source: sourceB,
            themeBackground: "#445566",
            backgroundPreview: "#AABBCC",
            gridPreview: true,
            lightingPreview: previewLighting(),
          }),
        ),
      );
      await Promise.resolve();
    });

    expect(runtime.authoringViewers).toHaveLength(2);
    expect(requiredViewer(runtime.authoringViewers)).toBe(viewer);
    expect(container.querySelector("canvas")).toBe(canvas);
    expect(viewer.load).toHaveBeenLastCalledWith(sourceB);
    expect(viewer.setThemeBackground).toHaveBeenLastCalledWith("#445566");
    expect(viewer.setBackgroundPreview).toHaveBeenLastCalledWith("#AABBCC");
    expect(viewer.setGridPreview).toHaveBeenLastCalledWith(true);
    expect(viewer.setLightingPreview).toHaveBeenLastCalledWith(previewLighting());
  });

  it("keeps the latest controlled background inputs when source loads settle out of order", async () => {
    const sourceA = scene("scene-a");
    const sourceB = scene("scene-b");
    const first = deferred<void>();
    const second = deferred<void>();
    runtime.loadImplementation = (source) =>
      source.id === sourceA.id ? first.promise : second.promise;

    await act(async () => {
      root.render(
        createElement(AuthoringScene, {
          source: sourceA,
          themeBackground: "#112233",
          backgroundPreview: "#223344",
          gridPreview: false,
          lightingPreview: authoredLighting(),
        }),
      );
      await Promise.resolve();
    });
    const viewer = requiredViewer(runtime.authoringViewers);
    const canvas = viewer.canvas;

    await act(async () => {
      root.render(
        createElement(AuthoringScene, {
          source: sourceB,
          themeBackground: "#445566",
          backgroundPreview: "#AABBCC",
          gridPreview: true,
          lightingPreview: previewLighting(),
        }),
      );
      await Promise.resolve();
    });
    await act(async () => {
      second.resolve();
      first.resolve();
      await Promise.all([first.promise, second.promise]);
    });

    expect(runtime.authoringViewers).toHaveLength(1);
    expect(container.querySelector("canvas")).toBe(canvas);
    expect(viewer.setThemeBackground).toHaveBeenLastCalledWith("#445566");
    expect(viewer.setBackgroundPreview).toHaveBeenLastCalledWith("#AABBCC");
    expect(viewer.setGridPreview).toHaveBeenLastCalledWith(true);
    expect(viewer.setLightingPreview).toHaveBeenLastCalledWith(previewLighting());
  });

  it("reconciles readonly theme state independently from source loading", async () => {
    const sourceA = scene("scene-a");
    const sourceB = scene("scene-b");
    await act(async () => {
      root.render(createElement(SceneViewer, { source: sourceA, themeBackground: "#112233" }));
      await Promise.resolve();
    });
    const viewer = requiredViewer(runtime.readonlyViewers);
    const canvas = viewer.canvas;

    await act(async () => {
      root.render(
        createElement(SceneViewer, {
          source: sourceB,
          themeBackground: "#445566",
          backgroundPreview: "#AABBCC",
          gridPreview: true,
          lightingPreview: previewLighting(),
        }),
      );
      await Promise.resolve();
    });

    expect(runtime.readonlyViewers).toHaveLength(1);
    expect(container.querySelector("canvas")).toBe(canvas);
    expect(viewer.load).toHaveBeenLastCalledWith(sourceB);
    expect(viewer.setThemeBackground).toHaveBeenLastCalledWith("#445566");
    expect(viewer.setBackgroundPreview).toHaveBeenLastCalledWith("#AABBCC");
    expect(viewer.setGridPreview).toHaveBeenLastCalledWith(true);
    expect(viewer.setLightingPreview).toHaveBeenLastCalledWith(previewLighting());
  });

  it("controls authoring mode in place and exposes mode and creation-frame handles", async () => {
    const source = scene("scene-a");
    const ref = createRef<AuthoringSceneHandle>();
    await act(async () => {
      root.render(createElement(AuthoringScene, { ref, source, authoringMode: "run" }));
      await Promise.resolve();
    });
    const viewer = requiredViewer(runtime.authoringViewers);
    const canvas = viewer.canvas;
    expect(runtime.authoringOptions.at(-1)?.authoringMode).toBe("run");
    expect(viewer.setAuthoringMode).toHaveBeenLastCalledWith("run");

    await act(async () => {
      root.render(createElement(AuthoringScene, { ref, source, authoringMode: "edit" }));
      await Promise.resolve();
    });
    expect(runtime.authoringViewers).toHaveLength(1);
    expect(container.querySelector("canvas")).toBe(canvas);
    expect(viewer.setAuthoringMode).toHaveBeenLastCalledWith("edit");

    ref.current?.setAuthoringMode("run");
    expect(viewer.setAuthoringMode).toHaveBeenLastCalledWith("run");
    expect(ref.current?.getLightCreationFrame()).toEqual({
      position: [0, 2, 0],
      target: [0, 0, 0],
    });
    const preview: AuthoredLightPropertyPreview = {
      documentId: "scene-a",
      documentRevision: 0,
      entityId: "light-a",
      light: { kind: "point", color: "#FFFFFF", intensity: 25, range: null },
    };
    expect(ref.current?.setAuthoredLightPropertyPreview(preview)).toBe(true);
    expect(viewer.setAuthoredLightPropertyPreview).toHaveBeenCalledWith(preview);
  });
});

function scene(id: string): SceneSource {
  return {
    schemaVersion: "1.3.0",
    id,
    name: id,
    revision: 0,
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
      background: "#F4F6F5",
      grid: false,
      unit: "m",
      upAxis: "Y",
      lighting: authoredLighting(),
    },
  };
}

function authoredLighting(): SceneLighting {
  return {
    fill: { skyColor: "#FFFFFF", groundColor: "#65706A", intensity: 1.8 },
    key: {
      color: "#FFFFFF",
      intensity: 2.2,
      directionToLight: [0.37904902178945177, 0.7580980435789035, 0.5306686305052324],
    },
  };
}

function previewLighting(): SceneLighting {
  return {
    fill: { skyColor: "#DDE7E3", groundColor: "#3D4743", intensity: 0.9 },
    key: {
      color: "#FFF1D6",
      intensity: 3,
      directionToLight: [0, 0.7071067811865475, -0.7071067811865476],
    },
  };
}

function requiredViewer(viewers: readonly FakeViewer[]): FakeViewer {
  const viewer = viewers.at(-1);
  if (viewer === undefined) throw new Error("Viewer was not created.");
  return viewer;
}

function deferred<T>() {
  let resolve: (value: T | PromiseLike<T>) => void = () => undefined;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}
