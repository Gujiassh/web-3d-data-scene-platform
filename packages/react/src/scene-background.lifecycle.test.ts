// @vitest-environment happy-dom

import { StrictMode, act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SceneSource } from "@web3d/runtime";

interface FakeViewer {
  readonly canvas: HTMLCanvasElement;
  readonly dispose: ReturnType<typeof vi.fn>;
  readonly load: ReturnType<typeof vi.fn>;
  readonly setBackgroundPreview: ReturnType<typeof vi.fn>;
  readonly setThemeBackground: ReturnType<typeof vi.fn>;
}

const runtime = vi.hoisted(() => ({
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
      setBackgroundPreview: vi.fn(),
      setCanvasLabel: vi.fn(),
      setDataRuntimeEnabled: vi.fn(() => Promise.resolve()),
      setThemeBackground: vi.fn(),
      setTool: vi.fn(),
      setTransformSettings: vi.fn(),
      setView: vi.fn(() => Promise.resolve()),
    };
  };

  return {
    createAuthoringSceneViewer(container: HTMLElement) {
      const viewer = createViewer(container);
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
import { SceneViewer } from "./SceneViewer";

describe("React scene background lifecycle", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    runtime.authoringViewers.length = 0;
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

    await act(async () => {
      root.render(
        createElement(
          StrictMode,
          null,
          createElement(AuthoringScene, {
            source: sourceB,
            themeBackground: "#445566",
            backgroundPreview: "#AABBCC",
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
        }),
      );
      await Promise.resolve();
    });

    expect(runtime.readonlyViewers).toHaveLength(1);
    expect(container.querySelector("canvas")).toBe(canvas);
    expect(viewer.load).toHaveBeenLastCalledWith(sourceB);
    expect(viewer.setThemeBackground).toHaveBeenLastCalledWith("#445566");
    expect(viewer.setBackgroundPreview).toHaveBeenLastCalledWith("#AABBCC");
  });
});

function scene(id: string): SceneSource {
  return {
    schemaVersion: "1.1.0",
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
