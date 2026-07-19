import { readFile } from "node:fs/promises";

import {
  parseSceneDocument,
  type LightEntity,
  type SceneDocument,
  type SceneLighting,
} from "@web3d/document";
import {
  BufferGeometry,
  Color,
  DirectionalLight,
  GridHelper,
  HemisphereLight,
  PointLight,
  SpotLight,
  type Scene,
  type Vector3,
} from "three";
import type * as ThreeModule from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DataAdapter } from "../types";
import { createHotspotTestContainer } from "../hotspots/hotspot-test-dom";
import { HotspotOverlay } from "../hotspots/hotspot-overlay";
import { AuthoredLightController } from "./authored-light-controller";
import type * as RuntimeGenerationModule from "./runtime-generation";
import { SelectionOverlay } from "./selection-overlay";

const runtime = vi.hoisted(() => ({
  canvases: [] as ReturnType<typeof fakeCanvas>[],
  dispose: vi.fn(),
  frames: [] as FrameRequestCallback[],
  generations: [] as RuntimeGenerationModule.RuntimeGeneration[],
  generationDisposals: [] as Array<ReturnType<typeof vi.fn>>,
  orbitControls: [] as Array<{ readonly target: Vector3 }>,
  reportError: vi.fn(),
  scenes: [] as Scene[],
}));

vi.mock("three", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof ThreeModule;
  class FakeWebGLRenderer {
    readonly domElement = fakeCanvas();
    readonly info = { render: { calls: 0, triangles: 0 } };

    constructor() {
      runtime.canvases.push(this.domElement);
    }

    dispose(): void {
      runtime.dispose();
    }

    render(): void {}
    setPixelRatio(): void {}
    setSize(): void {}
  }

  class FakeScene extends actual.Scene {
    constructor() {
      super();
      runtime.scenes.push(this);
    }
  }

  return { ...actual, Scene: FakeScene, WebGLRenderer: FakeWebGLRenderer };
});

vi.mock("three/addons/controls/OrbitControls.js", async () => {
  const { Vector3 } = await import("three");
  return {
    OrbitControls: class FakeOrbitControls {
      readonly target = new Vector3();
      enableDamping = false;

      constructor() {
        runtime.orbitControls.push(this);
      }

      addEventListener(): void {}
      dispose(): void {}
      removeEventListener(): void {}
      update(): void {}
    },
  };
});

vi.mock("./runtime-generation", async (importOriginal) => {
  const actual = await importOriginal<typeof RuntimeGenerationModule>();
  return {
    ...actual,
    async buildRuntimeGeneration(...args: Parameters<typeof actual.buildRuntimeGeneration>) {
      const generation = await actual.buildRuntimeGeneration(...args);
      const dispose = vi.fn(generation.dispose);
      runtime.generationDisposals.push(dispose);
      const instrumented = { ...generation, dispose };
      runtime.generations.push(instrumented);
      return instrumented;
    },
  };
});

import { createSceneViewer } from "./scene-viewer";

const sceneUrl = new URL(
  "../../../../tests/fixtures/m0-factory/public/m0-scene.json",
  import.meta.url,
);
const assetUrl = new URL(
  "../../../../tests/fixtures/m0-factory/public/m0-factory-cell.glb",
  import.meta.url,
);

describe("SceneViewer lifecycle", () => {
  beforeEach(() => {
    runtime.canvases.length = 0;
    runtime.dispose.mockClear();
    runtime.frames.length = 0;
    runtime.generations.length = 0;
    runtime.generationDisposals.length = 0;
    runtime.orbitControls.length = 0;
    runtime.reportError.mockClear();
    runtime.scenes.length = 0;
    vi.stubGlobal(
      "ResizeObserver",
      class FakeResizeObserver {
        disconnect(): void {}
        observe(): void {}
      },
    );
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      runtime.frames.push(callback);
      return runtime.frames.length;
    });
    vi.stubGlobal("cancelAnimationFrame", () => undefined);
    vi.stubGlobal("reportError", runtime.reportError);
  });

  it("defaults the canvas aria-label and updates it in place", async () => {
    const viewer = createSceneViewer(fakeContainer());
    const canvas = runtime.canvases.at(-1);
    if (canvas === undefined) throw new Error("Canvas not created.");

    expect(canvas.attributes["aria-label"]).toBe("Interactive 3D scene");
    const snapshot = viewer.getSnapshot();
    viewer.setCanvasLabel("Factory operations scene");
    expect(canvas.attributes["aria-label"]).toBe("Factory operations scene");
    expect(viewer.getSnapshot()).toEqual(snapshot);
    await viewer.dispose();
  });

  it("resolves theme and preview backgrounds without restarting viewer resources", async () => {
    const { asset, scene } = await fixture();
    const active = adapter("theme-background");
    const events: Array<{ type: string }> = [];
    const viewer = createSceneViewer(fakeContainer(), {
      adapters: { "factory-telemetry": active.value },
      assetResolver: { resolve: () => Promise.resolve(new Blob([asset])) },
      onEvent: (event) => events.push(event),
    });
    const canvas = runtime.canvases.at(-1);
    await viewer.load(withBackground(scene, "theme", "#102030"));
    flushFrames();

    expect(sceneBackground()).toBe("#102030");
    expect(active.start).toHaveBeenCalledOnce();
    expect(events.filter((event) => event.type === "ready")).toHaveLength(1);
    const generationDisposals = runtime.generationDisposals.map(
      (dispose) => dispose.mock.calls.length,
    );

    viewer.setThemeBackground("#336699");
    expect(sceneBackground()).toBe("#336699");
    expect(runtime.frames).toHaveLength(1);
    flushFrames();

    viewer.setBackgroundPreview("#AABBCC");
    expect(sceneBackground()).toBe("#AABBCC");
    flushFrames();
    viewer.setThemeBackground("#445566");
    expect(sceneBackground()).toBe("#AABBCC");
    expect(runtime.frames).toHaveLength(0);
    viewer.setBackgroundPreview(null);
    expect(sceneBackground()).toBe("#445566");
    flushFrames();
    viewer.setThemeBackground(null);
    expect(sceneBackground()).toBe("#102030");
    flushFrames();
    viewer.setThemeBackground("#445566");
    expect(sceneBackground()).toBe("#445566");
    flushFrames();

    expect(runtime.canvases.at(-1)).toBe(canvas);
    expect(active.start).toHaveBeenCalledOnce();
    expect(events.filter((event) => event.type === "ready")).toHaveLength(1);
    expect(runtime.generationDisposals.map((dispose) => dispose.mock.calls.length)).toEqual(
      generationDisposals,
    );

    await viewer.load(withBackground(scene, "custom", "#123456", 2));
    flushFrames();
    const customGenerationDisposals = runtime.generationDisposals.map(
      (dispose) => dispose.mock.calls.length,
    );
    const customAdapterStarts = active.start.mock.calls.length;
    viewer.setThemeBackground("#778899");
    expect(sceneBackground()).toBe("#123456");
    expect(runtime.frames).toHaveLength(0);
    viewer.setBackgroundPreview("#ABCDEF");
    expect(sceneBackground()).toBe("#ABCDEF");
    flushFrames();
    viewer.setBackgroundPreview(null);
    expect(sceneBackground()).toBe("#123456");
    expect(runtime.generationDisposals.map((dispose) => dispose.mock.calls.length)).toEqual(
      customGenerationDisposals,
    );
    expect(active.start).toHaveBeenCalledTimes(customAdapterStarts);
    await viewer.dispose();
  });

  it("rejects invalid transient colors without changing effective or stored state", async () => {
    const { asset, scene } = await fixture();
    const viewer = createSceneViewer(fakeContainer(), {
      assetResolver: { resolve: () => Promise.resolve(new Blob([asset])) },
    });
    await viewer.load(withBackground(scene, "theme", "#102030"));
    flushFrames();

    viewer.setThemeBackground("#336699");
    flushFrames();
    expect(() => viewer.setThemeBackground("rgb(1, 2, 3)")).toThrow(TypeError);
    expect(sceneBackground()).toBe("#336699");
    expect(runtime.frames).toHaveLength(0);

    viewer.setBackgroundPreview("#AABBCC");
    flushFrames();
    expect(() => viewer.setBackgroundPreview("#bad")).toThrow(TypeError);
    expect(sceneBackground()).toBe("#AABBCC");
    expect(runtime.frames).toHaveLength(0);
    viewer.setBackgroundPreview(null);
    expect(sceneBackground()).toBe("#336699");
    await viewer.dispose();
  });

  it("reconciles authored and preview lighting without restarting viewer resources", async () => {
    const { asset, scene } = await fixture();
    const active = adapter("lighting-preview");
    const events: Array<{ type: string }> = [];
    const viewer = createSceneViewer(fakeContainer(), {
      adapters: { "factory-telemetry": active.value },
      assetResolver: { resolve: () => Promise.resolve(new Blob([asset])) },
      onEvent: (event) => events.push(event),
    });
    const canvas = runtime.canvases.at(-1);
    await viewer.load(scene);
    flushFrames();
    const originalGenerationDisposals = runtime.generationDisposals.map(
      (dispose) => dispose.mock.calls.length,
    );
    const fill = sceneFill();
    const key = sceneKey();
    const preview = lighting("#DDE7E3", "#3D4743", 0.9, "#FFF1D6", 3, [-4, 8, 2]);

    viewer.setLightingPreview(preview);
    expect(sceneFill()).toBe(fill);
    expect(sceneKey()).toBe(key);
    expect(fill.color.getHexString()).toBe("dde7e3");
    expect(key.intensity).toBe(3);
    flushFrames();

    const component = 1 / Math.sqrt(3);
    const nextAuthored = lighting("#FFFFFF", "#84918B", 2, "#FFF4E5", 1.2, [
      component,
      component,
      component,
    ]);
    await viewer.load(withLighting(scene, nextAuthored, 2));
    flushFrames();
    expect(fill.color.getHexString()).toBe("dde7e3");
    viewer.setLightingPreview(null);
    expect(fill.groundColor.getHexString()).toBe("84918b");
    expect(key.color.getHexString()).toBe("fff4e5");

    expect(runtime.canvases.at(-1)).toBe(canvas);
    expect(active.start).toHaveBeenCalledTimes(2);
    expect(events.filter((event) => event.type === "ready")).toHaveLength(2);
    expect(runtime.generationDisposals.map((dispose) => dispose.mock.calls.length)).toEqual(
      originalGenerationDisposals.map((count, index) => count + (index === 0 ? 1 : 0)).concat(0),
    );
    await viewer.dispose();
  });

  it("reconciles grid preview in place and keeps it across authored loads", async () => {
    const { asset, scene } = await fixture();
    const active = adapter("grid-preview");
    const events: Array<{ type: string }> = [];
    const viewer = createSceneViewer(fakeContainer(), {
      adapters: { "factory-telemetry": active.value },
      assetResolver: { resolve: () => Promise.resolve(new Blob([asset])) },
      onEvent: (event) => events.push(event),
    });
    const canvas = runtime.canvases.at(-1);
    await viewer.load(withGrid(scene, false));
    flushFrames();
    expect(sceneGrid()).toBeNull();
    const generationDisposals = runtime.generationDisposals.map(
      (dispose) => dispose.mock.calls.length,
    );

    viewer.setGridPreview(true);
    const previewGrid = sceneGrid();
    expect(previewGrid).toBeInstanceOf(GridHelper);
    flushFrames();
    viewer.setGridPreview(true);
    expect(sceneGrid()).toBe(previewGrid);
    expect(runtime.frames).toHaveLength(0);
    expect(runtime.canvases.at(-1)).toBe(canvas);
    expect(active.start).toHaveBeenCalledOnce();
    expect(events.filter((event) => event.type === "ready")).toHaveLength(1);
    expect(runtime.generationDisposals.map((dispose) => dispose.mock.calls.length)).toEqual(
      generationDisposals,
    );

    await viewer.load(withGrid(scene, true, 2));
    flushFrames();
    expect(sceneGrid()).toBe(previewGrid);
    viewer.setGridPreview(null);
    expect(sceneGrid()).toBe(previewGrid);
    expect(runtime.frames).toHaveLength(0);

    viewer.setGridPreview(false);
    expect(sceneGrid()).toBeNull();
    flushFrames();
    await viewer.load(withGrid(scene, true, 3));
    flushFrames();
    expect(sceneGrid()).toBeNull();
    viewer.setGridPreview(null);
    expect(sceneGrid()).toBeInstanceOf(GridHelper);

    expect(runtime.canvases.at(-1)).toBe(canvas);
    expect(active.start).toHaveBeenCalledTimes(3);
    expect(events.filter((event) => event.type === "ready")).toHaveLength(3);
    await viewer.dispose();
  });

  it("keeps the latest theme and preview inputs across an asynchronous load", async () => {
    const { asset, scene } = await fixture();
    let resolveAsset: ((value: Blob) => void) | undefined;
    const viewer = createSceneViewer(fakeContainer(), {
      assetResolver: {
        resolve: () =>
          new Promise<Blob>((resolve) => {
            resolveAsset = resolve;
          }),
      },
    });

    const loading = viewer.load(withBackground(scene, "theme", "#102030"));
    viewer.setThemeBackground("#445566");
    viewer.setBackgroundPreview("#AABBCC");
    await vi.waitFor(() => expect(resolveAsset).toBeTypeOf("function"));
    resolveAsset?.(new Blob([asset]));
    await loading;

    expect(sceneBackground()).toBe("#AABBCC");
    viewer.setBackgroundPreview(null);
    expect(sceneBackground()).toBe("#445566");
    await viewer.dispose();
  });

  it("stays disposed when an in-flight load aborts after disposal", async () => {
    const { asset, scene } = await fixture();

    let resolveAsset: ((value: Blob) => void) | undefined;
    const viewer = createSceneViewer(fakeContainer(), {
      assetResolver: {
        resolve: () =>
          new Promise<Blob>((resolve) => {
            resolveAsset = resolve;
          }),
      },
    });

    const loading = viewer.load(scene);
    await viewer.dispose();
    resolveAsset?.(new Blob([asset]));
    await expect(loading).rejects.toMatchObject({ name: "AbortError" });

    expect(viewer.getSnapshot().lifecycle).toBe("disposed");
    expect(runtime.dispose).toHaveBeenCalledOnce();
  });

  it("keeps the previous scene ready when a replacement asset fails", async () => {
    const { asset, scene } = await fixture();
    const viewer = createSceneViewer(fakeContainer(), {
      assetResolver: { resolve: () => Promise.resolve(new Blob([asset])) },
    });
    await viewer.load(scene);

    await expect(viewer.load(invalidHash(scene, 2))).rejects.toMatchObject({
      diagnostic: { code: "ASSET_HASH_MISMATCH" },
    });
    expect(viewer.getSnapshot()).toMatchObject({
      documentId: scene.id,
      lifecycle: "ready",
      revision: scene.revision,
    });
    await viewer.dispose();
  });

  it("restores old hotspot authority and markers when replacement loading fails", async () => {
    const { asset, scene } = await fixture();
    const accepted = withSurfaceHotspot(scene);
    const markerSets = vi.spyOn(HotspotOverlay.prototype, "setMarkers");
    const viewer = createSceneViewer(fakeContainer(), {
      assetResolver: { resolve: () => Promise.resolve(new Blob([asset])) },
      reducedMotion: true,
    });
    await viewer.load(accepted);
    flushFrames();
    expect(markerSets.mock.calls.at(-1)?.[0]).toMatchObject([{ id: "runtime-hotspot" }]);
    await expect(
      viewer.focusHotspot("runtime-hotspot", { durationMs: 0 }),
    ).resolves.toBeUndefined();

    await expect(viewer.load(invalidHash(accepted, accepted.revision + 1))).rejects.toMatchObject({
      diagnostic: { code: "ASSET_HASH_MISMATCH" },
    });
    flushFrames();

    expect(viewer.getSnapshot()).toMatchObject({
      documentId: accepted.id,
      lifecycle: "ready",
      revision: accepted.revision,
    });
    expect(markerSets.mock.calls.some(([markers]) => markers.length === 0)).toBe(true);
    expect(markerSets.mock.calls.at(-1)?.[0]).toMatchObject([{ id: "runtime-hotspot" }]);
    await expect(
      viewer.focusHotspot("runtime-hotspot", { durationMs: 0 }),
    ).resolves.toBeUndefined();
    await viewer.dispose();
    markerSets.mockRestore();
  });

  it("validates before load classification and preserves the accepted Runtime", async () => {
    const { asset, scene } = await fixture();
    const resolve = vi.fn(() => Promise.resolve(new Blob([asset])));
    const events: Array<{ type: string }> = [];
    const viewer = createSceneViewer(fakeContainer(), {
      assetResolver: { resolve },
      onEvent: (event) => events.push(event),
    });
    await viewer.load({ ...scene, revision: 5 });
    const accepted = viewer.getSnapshot();
    const readyCount = events.filter((event) => event.type === "ready").length;
    const resolveCount = resolve.mock.calls.length;
    const generationDisposals = runtime.generationDisposals.map(
      (dispose) => dispose.mock.calls.length,
    );
    const invalid = {
      ...scene,
      revision: 6,
      environment: { ...scene.environment, grid: "invalid" },
    } as unknown as SceneDocument;

    await expect(viewer.load(invalid)).rejects.toMatchObject({
      diagnostic: { code: "DOCUMENT_REFERENCE_INVALID" },
    });
    expect(viewer.getSnapshot()).toEqual(accepted);
    expect(resolve).toHaveBeenCalledTimes(resolveCount);
    expect(events.filter((event) => event.type === "ready")).toHaveLength(readyCount);
    expect(runtime.generationDisposals.map((dispose) => dispose.mock.calls.length)).toEqual(
      generationDisposals,
    );
    await viewer.dispose();
  });

  it("enforces same-document revision authority before fast or full loading", async () => {
    const { asset, scene } = await fixture();
    const resolve = vi.fn(() => Promise.resolve(new Blob([asset])));
    const events: Array<{ type: string }> = [];
    const viewer = createSceneViewer(fakeContainer(), {
      assetResolver: { resolve },
      onEvent: (event) => events.push(event),
    });
    const accepted = { ...scene, revision: 5 };
    await viewer.load(accepted);
    const canvas = runtime.canvases.at(-1);
    const acceptedSnapshot = viewer.getSnapshot();
    const acceptedReadyCount = events.filter((event) => event.type === "ready").length;
    const acceptedResolveCount = resolve.mock.calls.length;
    const acceptedDisposals = runtime.generationDisposals.map(
      (dispose) => dispose.mock.calls.length,
    );

    await expect(viewer.load({ ...accepted, revision: 4 })).rejects.toMatchObject({
      diagnostic: { code: "DOCUMENT_REVISION_STALE" },
    });
    await expect(viewer.load({ ...accepted, name: "Conflict" })).rejects.toMatchObject({
      diagnostic: { code: "DOCUMENT_REVISION_CONFLICT" },
    });
    await expect(viewer.load(structuredClone(accepted))).resolves.toBeUndefined();

    expect(viewer.getSnapshot()).toEqual(acceptedSnapshot);
    expect(runtime.canvases.at(-1)).toBe(canvas);
    expect(resolve).toHaveBeenCalledTimes(acceptedResolveCount);
    expect(events.filter((event) => event.type === "ready")).toHaveLength(acceptedReadyCount);
    expect(runtime.generationDisposals.map((dispose) => dispose.mock.calls.length)).toEqual(
      acceptedDisposals,
    );

    await viewer.load({ ...accepted, id: "independent-document", revision: 1 });
    expect(viewer.getSnapshot()).toMatchObject({
      documentId: "independent-document",
      revision: 1,
      lifecycle: "ready",
    });
    expect(events.filter((event) => event.type === "ready")).toHaveLength(acceptedReadyCount + 1);
    await viewer.dispose();
  });

  it("atomically reconciles light-only revisions without replacing viewer resources", async () => {
    const { asset, scene } = await fixture();
    const resolve = vi.fn(() => Promise.resolve(new Blob([asset])));
    const active = adapter("light-only");
    const events: Array<{ type: string; revision?: number }> = [];
    const viewer = createSceneViewer(fakeContainer(), {
      adapters: { "factory-telemetry": active.value },
      assetResolver: { resolve },
      onEvent: (event) => events.push(event),
    });
    const point = pointLight("point-a", 25);
    const initial = withLights(scene, [point], 10);
    await viewer.load(initial);
    viewer.selectTarget("press-01");

    const canvas = runtime.canvases.at(-1);
    const generation = runtime.generations.at(-1);
    const root = generation?.root;
    const target = runtime.orbitControls.at(-1)?.target;
    target?.set(3, 4, 5);
    const fill = sceneFill();
    const key = sceneKey();
    const resolveCount = resolve.mock.calls.length;
    const disposals = runtime.generationDisposals.map((dispose) => dispose.mock.calls.length);

    const updatedPoint = pointLight("point-a", 50);
    await viewer.load(withLights(scene, [updatedPoint], 11));
    expect(scenePoint("point-a").intensity).toBe(50);

    await viewer.load(withLights(scene, [point], 12));
    expect(scenePoint("point-a").intensity).toBe(25);
    await viewer.load(withLights(scene, [updatedPoint], 13));
    expect(scenePoint("point-a").intensity).toBe(50);

    const spot = spotLight("spot-a", 10);
    await viewer.load(withLights(scene, [updatedPoint, spot], 14));
    expect(sceneSpot("spot-a").intensity).toBe(10);

    await viewer.load(withLights(scene, [spot], 15));
    expect(root?.getObjectByName("point-a")).toBeUndefined();
    expect(viewer.getSnapshot()).toMatchObject({
      lifecycle: "ready",
      revision: 15,
      selectedTargetId: "press-01",
    });
    expect(events.filter((event) => event.type === "ready").map((event) => event.revision)).toEqual(
      [10, 11, 12, 13, 14, 15],
    );
    expect(runtime.canvases.at(-1)).toBe(canvas);
    expect(runtime.generations).toHaveLength(1);
    expect(runtime.generations.at(-1)).toBe(generation);
    expect(resolve).toHaveBeenCalledTimes(resolveCount);
    expect(active.start).toHaveBeenCalledOnce();
    expect(runtime.orbitControls.at(-1)?.target).toBe(target);
    expect(target?.toArray()).toEqual([3, 4, 5]);
    expect(sceneFill()).toBe(fill);
    expect(sceneKey()).toBe(key);
    expect(runtime.generationDisposals.map((dispose) => dispose.mock.calls.length)).toEqual(
      disposals,
    );
    await viewer.dispose();
  });

  it("retains old authority when light staging fails", async () => {
    const { asset, scene } = await fixture();
    const events: Array<{ type: string }> = [];
    const viewer = createSceneViewer(fakeContainer(), {
      assetResolver: { resolve: () => Promise.resolve(new Blob([asset])) },
      onEvent: (event) => events.push(event),
    });
    const point = pointLight("point-a", 25);
    await viewer.load(withLights(scene, [point], 10));
    const generation = runtime.generations.at(-1);
    const readyCount = events.filter((event) => event.type === "ready").length;
    const stage = vi
      .spyOn(AuthoredLightController.prototype, "stage")
      .mockImplementationOnce(() => {
        throw new Error("staging failed");
      });

    await expect(viewer.load(withLights(scene, [pointLight("point-a", 50)], 11))).rejects.toThrow(
      "staging failed",
    );

    expect(viewer.getSnapshot()).toMatchObject({ lifecycle: "ready", revision: 10 });
    expect(scenePoint("point-a").intensity).toBe(25);
    expect(runtime.generations.at(-1)).toBe(generation);
    expect(events.filter((event) => event.type === "ready")).toHaveLength(readyCount);
    expect(viewer.getDiagnostics().at(-1)?.code).toBe("AUTHORED_LIGHT_RECONCILE_FAILED");
    stage.mockRestore();
    await viewer.dispose();
  });

  it("disposes a staged light update when a newer revision supersedes it", async () => {
    const { asset, scene } = await fixture();
    const events: Array<{ type: string; revision?: number }> = [];
    const viewer = createSceneViewer(fakeContainer(), {
      assetResolver: { resolve: () => Promise.resolve(new Blob([asset])) },
      onEvent: (event) => events.push(event),
    });
    const point = pointLight("point-a", 25);
    await viewer.load(withLights(scene, [point], 10));
    const generation = runtime.generations.at(-1);
    const latestStarted = deferred<void>();
    let latestLoad: Promise<void> = Promise.reject(new Error("Latest load did not start."));
    void latestLoad.catch(() => undefined);
    const originalStage = AuthoredLightController.prototype.stage;
    const stagedDispose = vi.fn();
    const stage = vi
      .spyOn(AuthoredLightController.prototype, "stage")
      .mockImplementationOnce(function (this: AuthoredLightController, lights) {
        const staged = originalStage.call(this, lights);
        queueMicrotask(() => {
          latestLoad = viewer.load(withLights(scene, [pointLight("point-a", 75)], 12));
          latestStarted.resolve();
        });
        return {
          commit: staged.commit,
          dispose: () => {
            stagedDispose();
            staged.dispose();
          },
        };
      });

    const superseded = viewer.load(withLights(scene, [pointLight("point-a", 50)], 11));
    await latestStarted.promise;
    await expect(superseded).rejects.toMatchObject({ name: "AbortError" });
    await latestLoad;

    expect(stagedDispose).toHaveBeenCalledOnce();
    expect(viewer.getSnapshot()).toMatchObject({ lifecycle: "ready", revision: 12 });
    expect(scenePoint("point-a").intensity).toBe(75);
    expect(runtime.generations.at(-1)).toBe(generation);
    expect(events.filter((event) => event.type === "ready").map((event) => event.revision)).toEqual(
      [10, 12],
    );
    stage.mockRestore();
    await viewer.dispose();
  });

  it("lets a light-only revision safely supersede a full load blocked in adapter stop", async () => {
    const { asset, scene } = await fixture();
    const events: Array<{ type: string; revision?: number }> = [];
    const active = adapter("superseded-full");
    const viewer = createSceneViewer(fakeContainer(), {
      adapters: { "factory-telemetry": active.value },
      assetResolver: { resolve: () => Promise.resolve(new Blob([asset])) },
      onEvent: (event) => events.push(event),
    });
    const point = pointLight("point-a", 25);
    const initial = withLights(scene, [point], 10);
    await viewer.load(initial);
    const initialGeneration = runtime.generations.at(-1);
    const initialGrid = sceneGrid();
    const stopping = deferred<void>();
    active.stop.mockImplementationOnce(() => stopping.promise);

    const full = viewer.load({
      ...initial,
      revision: 11,
      environment: { ...initial.environment, grid: !initial.environment.grid },
    });
    await vi.waitFor(() => expect(active.stop).toHaveBeenCalledOnce());
    const lightOnly = viewer.load(withLights(scene, [pointLight("point-a", 50)], 12));
    stopping.resolve();

    await expect(full).rejects.toMatchObject({ name: "AbortError" });
    await lightOnly;

    expect(viewer.getSnapshot()).toMatchObject({ lifecycle: "ready", revision: 12 });
    expect(scenePoint("point-a").intensity).toBe(50);
    expect(sceneGrid()).toBe(initialGrid);
    expect(initialGeneration?.root.parent).not.toBeNull();
    expect(runtime.generationDisposals.at(-1)).toHaveBeenCalledOnce();
    expect(active.start).toHaveBeenCalledTimes(2);
    expect(active.stop).toHaveBeenCalledOnce();
    expect(events.filter((event) => event.type === "ready").map((event) => event.revision)).toEqual(
      [10, 12],
    );
    await viewer.dispose();
  });

  it("lets a newer light-only revision supersede adapter recovery from a full load", async () => {
    const { asset, scene } = await fixture();
    const events: Array<{ type: string; revision?: number }> = [];
    const active = adapter("adapter-recovery");
    const viewer = createSceneViewer(fakeContainer(), {
      adapters: { "factory-telemetry": active.value },
      assetResolver: { resolve: () => Promise.resolve(new Blob([asset])) },
      onEvent: (event) => events.push(event),
    });
    const point = pointLight("point-a", 25);
    const initial = withLights(scene, [point], 10);
    await viewer.load(initial);
    const stopping = deferred<void>();
    const recovering = deferred<void>();
    active.stop.mockImplementationOnce(() => stopping.promise);
    active.start.mockImplementationOnce(() => recovering.promise);

    const full = viewer.load({
      ...initial,
      revision: 11,
      environment: { ...initial.environment, grid: !initial.environment.grid },
    });
    await vi.waitFor(() => expect(active.stop).toHaveBeenCalledOnce());
    const firstLightOnly = viewer.load(withLights(scene, [pointLight("point-a", 50)], 12));
    stopping.resolve();
    await expect(full).rejects.toMatchObject({ name: "AbortError" });
    await vi.waitFor(() => expect(active.start).toHaveBeenCalledTimes(2));

    const latest = viewer.load(withLights(scene, [pointLight("point-a", 75)], 13));
    await expect(firstLightOnly).rejects.toMatchObject({ name: "AbortError" });
    await latest;

    expect(viewer.getSnapshot()).toMatchObject({ lifecycle: "ready", revision: 13 });
    expect(scenePoint("point-a").intensity).toBe(75);
    expect(active.start).toHaveBeenCalledTimes(3);
    expect(active.stop).toHaveBeenCalledTimes(2);
    expect(events.filter((event) => event.type === "ready").map((event) => event.revision)).toEqual(
      [10, 13],
    );
    recovering.resolve();
    await viewer.dispose();
  });

  it("uses full loading for non-light changes and retained-entity reordering", async () => {
    const { asset, scene } = await fixture();
    const resolve = vi.fn(() => Promise.resolve(new Blob([asset])));
    const viewer = createSceneViewer(fakeContainer(), { assetResolver: { resolve } });
    const point = pointLight("point-a", 25);
    const initial = withLights(scene, [point], 10);
    await viewer.load(initial);
    const initialGeneration = runtime.generations.at(-1);
    const initialResolveCount = resolve.mock.calls.length;

    await viewer.load({
      ...initial,
      revision: 11,
      environment: { ...initial.environment, grid: !initial.environment.grid },
    });
    expect(runtime.generations).toHaveLength(2);
    expect(runtime.generations.at(-1)).not.toBe(initialGeneration);
    expect(resolve.mock.calls.length).toBeGreaterThan(initialResolveCount);

    const current = withLights(
      { ...scene, environment: { ...scene.environment, grid: !scene.environment.grid } },
      [point],
      11,
    );
    const currentAsset = current.entities.find((entity) => entity.type === "asset");
    expect(currentAsset).toBeDefined();
    if (currentAsset === undefined) return;
    const beforeReorderGeneration = runtime.generations.at(-1);
    const beforeReorderResolveCount = resolve.mock.calls.length;
    await viewer.load({ ...current, revision: 12, entities: [point, currentAsset] });
    expect(runtime.generations.at(-1)).not.toBe(beforeReorderGeneration);
    expect(resolve.mock.calls.length).toBeGreaterThan(beforeReorderResolveCount);
    await viewer.dispose();
  });

  it("does not expose authoring state from the readonly snapshot object", async () => {
    const { asset, scene } = await fixture();
    const viewer = createSceneViewer(fakeContainer(), {
      assetResolver: { resolve: () => Promise.resolve(new Blob([asset])) },
    });
    await viewer.load(scene);

    const snapshot = viewer.getSnapshot();
    expect(snapshot).not.toHaveProperty("selectedEntityId");
    expect(snapshot).not.toHaveProperty("selectedEntityIds");
    expect(snapshot).not.toHaveProperty("primaryEntityId");
    expect(snapshot).not.toHaveProperty("activeTool");
    expect(snapshot).not.toHaveProperty("dataRuntimeEnabled");
    expect(snapshot).not.toHaveProperty("bindingStates");
    await viewer.dispose();
  });

  it("keeps readonly data adapters enabled by default", async () => {
    const { asset, scene } = await fixture();
    const active = adapter("readonly-default");
    const viewer = createSceneViewer(fakeContainer(), {
      adapters: { "factory-telemetry": active.value },
      assetResolver: { resolve: () => Promise.resolve(new Blob([asset])) },
    });

    await viewer.load(scene);
    expect(active.start).toHaveBeenCalledOnce();
    expect(viewer.getSnapshot().connections).toEqual({ "factory-telemetry": "connecting" });
    await viewer.dispose();
  });

  it("applies only the latest adapter after a slow replacement", async () => {
    const { asset, scene } = await fixture();
    const viewer = createSceneViewer(fakeContainer(), {
      assetResolver: { resolve: () => Promise.resolve(new Blob([asset])) },
    });
    await viewer.load(scene);

    const stopped = deferred<void>();
    const initial = adapter("initial", () => stopped.promise);
    const stale = adapter("stale");
    const latest = adapter("latest");
    await viewer.setAdapter("factory-telemetry", initial.value);

    const staleReplacement = viewer.setAdapter("factory-telemetry", stale.value);
    await vi.waitFor(() => expect(initial.stop).toHaveBeenCalledOnce());
    const latestReplacement = viewer.setAdapter("factory-telemetry", latest.value);
    stopped.resolve();
    await Promise.all([staleReplacement, latestReplacement]);

    expect(stale.start).not.toHaveBeenCalled();
    expect(latest.start).toHaveBeenCalledOnce();
    expect(latest.stop).not.toHaveBeenCalled();
    await viewer.dispose();
  });

  it("keeps old authority and restores adapters when a newer load supersedes then fails", async () => {
    const { asset, scene } = await fixture();
    const viewer = createSceneViewer(fakeContainer(), {
      assetResolver: { resolve: () => Promise.resolve(new Blob([asset])) },
    });
    await viewer.load(scene);

    const stopped = deferred<void>();
    let stopCalls = 0;
    const active = adapter("active", () => {
      stopCalls += 1;
      return stopCalls === 1 ? stopped.promise : Promise.resolve();
    });
    await viewer.setAdapter("factory-telemetry", active.value);

    const replacement = viewer.load({ ...scene, revision: 2 });
    await vi.waitFor(() => expect(active.stop).toHaveBeenCalledOnce());
    const failed = viewer.load(invalidHash(scene, 3));
    stopped.resolve();
    await expect(replacement).rejects.toMatchObject({ name: "AbortError" });
    await expect(failed).rejects.toMatchObject({
      diagnostic: { code: "ASSET_HASH_MISMATCH" },
    });

    expect(viewer.getSnapshot()).toMatchObject({
      documentId: scene.id,
      lifecycle: "ready",
      revision: scene.revision,
    });
    expect(active.start).toHaveBeenCalledTimes(2);
    await viewer.dispose();
  });

  it("supersedes a load blocked in adapter start", async () => {
    const { asset, scene } = await fixture();
    const firstStart = deferred<void>();
    const active = adapter("load-start");
    active.start
      .mockImplementationOnce(() => firstStart.promise)
      .mockImplementationOnce(() => Promise.resolve());
    const viewer = createSceneViewer(fakeContainer(), {
      adapters: { "factory-telemetry": active.value },
      assetResolver: { resolve: () => Promise.resolve(new Blob([asset])) },
    });

    const firstLoad = viewer.load(scene);
    await vi.waitFor(() => expect(active.start).toHaveBeenCalledOnce());
    const latestLoad = viewer.load({ ...scene, revision: scene.revision + 1 });
    await Promise.all([firstLoad, latestLoad]);

    expect(active.stop).toHaveBeenCalledOnce();
    expect(active.start).toHaveBeenCalledTimes(2);
    expect(viewer.getSnapshot()).toMatchObject({
      lifecycle: "ready",
      revision: scene.revision + 1,
    });
    await viewer.dispose();
  });

  it("releases renderer resources before a slow adapter finishes stopping", async () => {
    const { asset, scene } = await fixture();
    const viewer = createSceneViewer(fakeContainer(), {
      assetResolver: { resolve: () => Promise.resolve(new Blob([asset])) },
    });
    await viewer.load(scene);

    const stopped = deferred<void>();
    const active = adapter("slow-stop", () => stopped.promise);
    await viewer.setAdapter("factory-telemetry", active.value);
    const disposing = viewer.dispose();

    expect(runtime.dispose).toHaveBeenCalledOnce();
    stopped.resolve();
    await disposing;
    expect(viewer.getSnapshot().lifecycle).toBe("disposed");
  });

  it("lets the latest adapter replace a start that only ends on abort", async () => {
    const { asset, scene } = await fixture();
    const viewer = createSceneViewer(fakeContainer(), {
      assetResolver: { resolve: () => Promise.resolve(new Blob([asset])) },
    });
    await viewer.load(scene);

    const starting = deferred<void>();
    const hanging = adapter("hanging-start");
    hanging.start.mockImplementation(() => starting.promise);
    const latest = adapter("latest");
    const hangingReplacement = viewer.setAdapter("factory-telemetry", hanging.value);
    await vi.waitFor(() => expect(hanging.start).toHaveBeenCalledOnce());

    const latestReplacement = viewer.setAdapter("factory-telemetry", latest.value);
    await Promise.all([hangingReplacement, latestReplacement]);
    expect(hanging.stop).toHaveBeenCalledOnce();
    expect(latest.start).toHaveBeenCalledOnce();
    await viewer.dispose();
  });

  it("keeps load ready when adapter subscription fails", async () => {
    const { asset, scene } = await fixture();
    const broken: DataAdapter = {
      sourceId: "factory-telemetry",
      start: vi.fn(() => Promise.resolve()),
      stop: vi.fn(() => Promise.resolve()),
      subscribe: vi.fn(() => {
        throw new Error("subscription failed");
      }),
    };
    const viewer = createSceneViewer(fakeContainer(), {
      adapters: { "factory-telemetry": broken },
      assetResolver: { resolve: () => Promise.resolve(new Blob([asset])) },
    });

    await viewer.load(scene);
    expect(viewer.getSnapshot()).toMatchObject({ lifecycle: "ready" });
    expect(viewer.getSnapshot().connections).toEqual({ "factory-telemetry": "error" });
    expect(viewer.getDiagnostics()).toContainEqual(
      expect.objectContaining({ code: "DATASOURCE_CONNECTION_FAILED" }),
    );
    await viewer.dispose();
  });

  it("cleans up an adapter whose start rejects", async () => {
    const { asset, scene } = await fixture();
    const unsubscribe = vi.fn();
    const stop = vi.fn(() => Promise.resolve());
    const broken: DataAdapter = {
      sourceId: "factory-telemetry",
      start: vi.fn(() => Promise.reject(new Error("start failed"))),
      stop,
      subscribe: vi.fn(() => unsubscribe),
    };
    const viewer = createSceneViewer(fakeContainer(), {
      adapters: { "factory-telemetry": broken },
      assetResolver: { resolve: () => Promise.resolve(new Blob([asset])) },
    });

    await viewer.load(scene);

    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(stop).toHaveBeenCalledOnce();
    expect(viewer.getSnapshot()).toMatchObject({
      lifecycle: "ready",
      connections: { "factory-telemetry": "error" },
    });
    await viewer.dispose();
  });

  it("continues adapter stop and reload when unsubscribe throws", async () => {
    const { asset, scene } = await fixture();
    const start = vi.fn(() => Promise.resolve());
    const stop = vi.fn(() => Promise.resolve());
    const unsubscribe = vi.fn(() => {
      throw new Error("unsubscribe failed");
    });
    const active: DataAdapter = {
      sourceId: "factory-telemetry",
      start,
      stop,
      subscribe: vi.fn(() => unsubscribe),
    };
    const viewer = createSceneViewer(fakeContainer(), {
      assetResolver: { resolve: () => Promise.resolve(new Blob([asset])) },
    });
    await viewer.load(scene);
    await viewer.setAdapter("factory-telemetry", active);

    await viewer.load({ ...scene, revision: scene.revision + 1 });

    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(stop).toHaveBeenCalledOnce();
    expect(start).toHaveBeenCalledTimes(2);
    expect(viewer.getSnapshot()).toMatchObject({
      lifecycle: "ready",
      revision: scene.revision + 1,
    });
    expect(viewer.getDiagnostics()).toContainEqual(
      expect.objectContaining({
        code: "DATASOURCE_CONNECTION_FAILED",
        message: expect.stringContaining("unsubscribe"),
      }),
    );
    await viewer.dispose();
  });

  it("does not reject load when a host ready handler throws", async () => {
    const { asset, scene } = await fixture();
    const viewer = createSceneViewer(fakeContainer(), {
      assetResolver: { resolve: () => Promise.resolve(new Blob([asset])) },
      onEvent(event) {
        if (event.type === "ready") throw new Error("host callback failed");
      },
    });

    await viewer.load(scene);
    expect(viewer.getSnapshot().lifecycle).toBe("ready");
    expect(runtime.reportError).toHaveBeenCalledOnce();
    await viewer.dispose();
  });

  it("releases a built candidate while it waits behind an adapter stop", async () => {
    const { asset, scene } = await fixture();
    const viewer = createSceneViewer(fakeContainer(), {
      assetResolver: { resolve: () => Promise.resolve(new Blob([asset])) },
    });
    await viewer.load(scene);

    const stopped = deferred<void>();
    const active = adapter("active", () => stopped.promise);
    await viewer.setAdapter("factory-telemetry", active.value);
    const queuedAdapter = viewer.setAdapter("factory-telemetry", adapter("queued").value);
    await vi.waitFor(() => expect(active.stop).toHaveBeenCalledOnce());

    const originalParse = GLTFLoader.prototype.parseAsync;
    const parsedCandidate = deferred<void>();
    const parse = vi.spyOn(GLTFLoader.prototype, "parseAsync").mockImplementation(async function (
      this: GLTFLoader,
      data,
      path,
    ) {
      const result = await originalParse.call(this, data, path);
      parsedCandidate.resolve();
      return result;
    });
    const dispose = vi.spyOn(BufferGeometry.prototype, "dispose");
    const loading = viewer.load({ ...scene, revision: 2 });
    await parsedCandidate.promise;
    await new Promise((resolve) => setTimeout(resolve, 0));

    await viewer.dispose();
    expect(dispose.mock.calls.length).toBeGreaterThanOrEqual(2);
    stopped.resolve();
    await queuedAdapter;
    await expect(loading).rejects.toMatchObject({ name: "AbortError" });
    dispose.mockRestore();
    parse.mockRestore();
  });

  it("transfers a committed generation before a post-commit dispose race", async () => {
    const { asset, scene } = await fixture();
    const viewer = createSceneViewer(fakeContainer(), {
      assetResolver: { resolve: () => Promise.resolve(new Blob([asset])) },
    });
    await viewer.load(scene);
    const overlaySet = vi.spyOn(SelectionOverlay.prototype, "set").mockImplementationOnce(() => {
      void viewer.dispose();
      throw new Error("post-commit dispose race");
    });
    const loading = viewer.load({ ...scene, revision: scene.revision + 1 });
    await expect(loading).rejects.toThrow("post-commit dispose race");
    const committedDispose = runtime.generationDisposals.at(-1);
    if (committedDispose === undefined) throw new Error("Committed generation was not built.");
    await viewer.dispose();
    expect(committedDispose).toHaveBeenCalledOnce();
    overlaySet.mockRestore();
  });
});

async function fixture(): Promise<{ asset: Uint8Array<ArrayBuffer>; scene: SceneDocument }> {
  const [sceneJson, asset] = await Promise.all([readFile(sceneUrl, "utf8"), readFile(assetUrl)]);
  const parsed = parseSceneDocument(sceneJson);
  if (!parsed.ok) throw new Error(parsed.diagnostics[0]?.message ?? "M0 fixture is invalid.");
  return { asset: Uint8Array.from(asset), scene: parsed.value };
}

function invalidHash(scene: SceneDocument, revision: number): SceneDocument {
  const hash = "0".repeat(64);
  return {
    ...scene,
    revision,
    assets: scene.assets.map((asset) => ({ ...asset, sha256: hash })),
    targets: scene.targets.map((target) => ({ ...target, assetHash: hash })),
    annotations: scene.annotations.map((annotation) =>
      annotation.anchor.kind === "surface"
        ? { ...annotation, anchor: { ...annotation.anchor, assetHash: hash } }
        : annotation,
    ),
  };
}

function withSurfaceHotspot(scene: SceneDocument): SceneDocument {
  const entity = scene.entities.find((candidate) => candidate.type === "asset");
  const asset = scene.assets.find((candidate) => candidate.id === entity?.assetId);
  if (entity?.type !== "asset" || asset === undefined) throw new Error("M0 asset is missing.");
  return {
    ...scene,
    annotations: [
      {
        id: "runtime-hotspot",
        title: "Runtime hotspot",
        visible: true,
        locked: false,
        anchor: {
          kind: "surface",
          entityId: entity.id,
          assetHash: asset.sha256,
          nodeIndex: 0,
          nodeLocalPosition: [0, 0.5, 0],
          nodeLocalNormal: [0, 1, 0],
        },
        content: { kind: "plain-text", text: "Runtime" },
        action: { type: "show-content" },
      },
    ],
  };
}

function withBackground(
  scene: SceneDocument,
  backgroundMode: "theme" | "custom",
  background: string,
  revision = scene.revision,
): SceneDocument {
  return {
    ...scene,
    revision,
    environment: { ...scene.environment, background, backgroundMode },
  };
}

function withLighting(
  scene: SceneDocument,
  lighting: SceneLighting,
  revision = scene.revision,
): SceneDocument {
  return {
    ...scene,
    revision,
    environment: { ...scene.environment, lighting },
  };
}

function withGrid(scene: SceneDocument, grid: boolean, revision = scene.revision): SceneDocument {
  return {
    ...scene,
    revision,
    environment: { ...scene.environment, grid },
  };
}

function withLights(
  scene: SceneDocument,
  lights: readonly LightEntity[],
  revision: number,
): SceneDocument {
  return {
    ...scene,
    revision,
    entities: [...scene.entities.filter((entity) => entity.type !== "light"), ...lights],
  };
}

function pointLight(id: string, intensity: number): LightEntity {
  return {
    ...lightBase(id),
    light: { kind: "point", color: "#FFFFFF", intensity, range: null },
  };
}

function spotLight(id: string, intensity: number): LightEntity {
  return {
    ...lightBase(id),
    light: {
      kind: "spot",
      color: "#FFFFFF",
      intensity,
      range: null,
      angleRadians: Math.PI / 4,
      penumbra: 1 / 3,
    },
  };
}

function lightBase(id: string): Omit<LightEntity, "light"> {
  return {
    id,
    type: "light",
    parentId: null,
    name: id,
    visible: true,
    locked: false,
    transform: {
      position: [0, 2, 0],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
    },
    metadata: {},
  };
}

function lighting(
  skyColor: string,
  groundColor: string,
  fillIntensity: number,
  keyColor: string,
  keyIntensity: number,
  directionToLight: [number, number, number],
): SceneLighting {
  return {
    fill: { skyColor, groundColor, intensity: fillIntensity },
    key: { color: keyColor, intensity: keyIntensity, directionToLight },
  };
}

function sceneFill(): HemisphereLight {
  const fill = runtime.scenes.at(-1)?.children.find((object) => object instanceof HemisphereLight);
  if (!(fill instanceof HemisphereLight)) throw new Error("Scene fill light is missing.");
  return fill;
}

function sceneKey(): DirectionalLight {
  const key = runtime.scenes.at(-1)?.children.find((object) => object instanceof DirectionalLight);
  if (!(key instanceof DirectionalLight)) throw new Error("Scene key light is missing.");
  return key;
}

function scenePoint(entityId: string): PointLight {
  const light = runtime.scenes.at(-1)?.getObjectByName(`authored-point:${entityId}`);
  if (!(light instanceof PointLight)) throw new Error(`Point light ${entityId} is missing.`);
  return light;
}

function sceneSpot(entityId: string): SpotLight {
  const light = runtime.scenes.at(-1)?.getObjectByName(`authored-spot:${entityId}`);
  if (!(light instanceof SpotLight)) throw new Error(`Spot light ${entityId} is missing.`);
  return light;
}

function sceneGrid(): GridHelper | null {
  const grid = runtime.scenes.at(-1)?.children.find((object) => object instanceof GridHelper);
  return grid instanceof GridHelper ? grid : null;
}

function sceneBackground(): string {
  const background = runtime.scenes.at(-1)?.background;
  if (!(background instanceof Color)) throw new Error("Scene color background is missing.");
  return `#${background.getHexString().toUpperCase()}`;
}

function flushFrames(): void {
  while (runtime.frames.length > 0) runtime.frames.shift()?.(performance.now());
}

function adapter(name: string, stop = () => Promise.resolve()) {
  const start = vi.fn(() => Promise.resolve());
  const stopSpy = vi.fn(stop);
  const value: DataAdapter = {
    sourceId: "factory-telemetry",
    start,
    stop: stopSpy,
    subscribe: vi.fn(() => vi.fn()),
  };
  return { name, start, stop: stopSpy, value };
}

function deferred<T>() {
  let resolve: (value: T | PromiseLike<T>) => void = () => undefined;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function fakeCanvas() {
  const attributes: Record<string, string> = {};
  return {
    attributes,
    dataset: {} as Record<string, string>,
    style: {} as Record<string, string>,
    tabIndex: 0,
    addEventListener(): void {},
    getBoundingClientRect: () => ({
      bottom: 600,
      height: 600,
      left: 0,
      right: 800,
      top: 0,
      width: 800,
    }),
    remove(): void {},
    removeEventListener(): void {},
    setAttribute(name: string, value: string): void {
      attributes[name] = value;
    },
  };
}

function fakeContainer(): HTMLElement {
  return createHotspotTestContainer();
}
