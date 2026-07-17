import { readFile } from "node:fs/promises";

import {
  parseSceneDocument,
  type LightEntity,
  type SceneDocument,
  type Transform,
} from "@web3d/document";
import type { Camera, Material, Object3D, Scene } from "three";
import { BoxHelper, Color, LineSegments, Mesh, Raycaster, Vector3 } from "three";
import type * as ThreeModule from "three";
import { beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";

import {
  InspectGltfError,
  MAX_GLTF_INSPECTION_BYTES,
  createAuthoringSceneViewer,
  inspectGltf,
  type GltfInspectionSummary,
} from "../index";
import type { AuthoringViewerEvent, DataAdapter, DataEnvelope } from "../types";
import { AuthoredLightController } from "../viewer/authored-light-controller";

const runtime = vi.hoisted(() => ({
  canvases: [] as ReturnType<typeof fakeCanvas>[],
  dispose: vi.fn(),
  frames: [] as FrameRequestCallback[],
  reportError: vi.fn(),
  scenes: [] as Scene[],
  transformControls: [] as FakeTransformControls[],
  views: [] as FakeView[],
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
      readonly camera: Camera;
      enableDamping = false;
      enabled = true;

      constructor(camera: Camera) {
        this.camera = camera;
      }

      addEventListener(): void {}
      dispose(): void {}
      removeEventListener(): void {}
      update(): void {
        this.camera.lookAt(this.target);
        this.camera.updateMatrixWorld(true);
      }
    },
  };
});

vi.mock("three/addons/controls/TransformControls.js", async () => {
  const { Object3D } = await import("three");
  class MockTransformControls {
    readonly helper = new Object3D();
    readonly listeners = new Map<string, Set<(event: Record<string, unknown>) => void>>();
    mode = "translate";
    axis: string | null = "X";
    object: Object3D | undefined;
    translationSnap: number | null = null;
    rotationSnap: number | null = null;
    scaleSnap: number | null = null;
    readonly setTranslationSnap = vi.fn((value: number | null) => {
      this.translationSnap = value;
    });
    readonly setRotationSnap = vi.fn((value: number | null) => {
      this.rotationSnap = value;
    });
    readonly setScaleSnap = vi.fn((value: number | null) => {
      this.scaleSnap = value;
    });

    constructor() {
      runtime.transformControls.push(this as unknown as FakeTransformControls);
    }

    addEventListener(type: string, listener: (event: Record<string, unknown>) => void): void {
      const entries = this.listeners.get(type) ?? new Set();
      entries.add(listener);
      this.listeners.set(type, entries);
    }

    attach(object: Object3D): this {
      this.object = object;
      return this;
    }

    detach(): void {
      this.object = undefined;
    }

    setMode(mode: string): void {
      this.mode = mode;
    }

    emit(type: string, event: Record<string, unknown> = {}): void {
      this.listeners.get(type)?.forEach((listener) => listener({ type, target: this, ...event }));
    }

    getHelper(): Object3D {
      return this.helper;
    }

    removeEventListener(type: string, listener: (event: Record<string, unknown>) => void): void {
      this.listeners.get(type)?.delete(listener);
    }

    dispose(): void {}
  }

  return { TransformControls: MockTransformControls };
});

describe("createAuthoringSceneViewer", () => {
  beforeEach(() => {
    runtime.canvases.length = 0;
    runtime.frames.length = 0;
    runtime.scenes.length = 0;
    runtime.transformControls.length = 0;
    runtime.views.length = 0;
    runtime.dispose.mockClear();
    runtime.reportError.mockClear();
    vi.restoreAllMocks();
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

  it("applies the initial canvas aria-label and updates it in place", async () => {
    const viewer = createAuthoringSceneViewer(fakeContainer(), {
      canvasLabel: "Authoring 3D scene",
    });
    const canvas = runtime.canvases.at(-1);
    if (canvas === undefined) throw new Error("Canvas not created.");

    expect(canvas.attributes["aria-label"]).toBe("Authoring 3D scene");
    const snapshot = viewer.getSnapshot();
    viewer.setCanvasLabel("Authoring layout scene");
    expect(canvas.attributes["aria-label"]).toBe("Authoring layout scene");
    expect(viewer.getSnapshot()).toEqual(snapshot);
    await viewer.dispose();
  });

  it("updates transient backgrounds without recreating authoring controls or lifecycle", async () => {
    const { asset, scene } = await fixture();
    const events: AuthoringViewerEvent[] = [];
    const viewer = createAuthoringSceneViewer(fakeContainer(), {
      assetResolver: { resolve: () => Promise.resolve(new Blob([asset])) },
      onEvent: (event) => events.push(event),
    });
    const canvas = runtime.canvases.at(-1);
    await viewer.load(withBackground(scene, "theme", "#102030"));
    const controls = requiredControls();

    viewer.setThemeBackground("#336699");
    expect(sceneBackground()).toBe("#336699");
    viewer.setBackgroundPreview("#AABBCC");
    expect(sceneBackground()).toBe("#AABBCC");
    viewer.setBackgroundPreview(null);
    expect(sceneBackground()).toBe("#336699");

    expect(runtime.canvases.at(-1)).toBe(canvas);
    expect(runtime.transformControls).toEqual([controls]);
    expect(events.filter((event) => event.type === "ready")).toHaveLength(1);
    await viewer.dispose();
  });

  it("uses the live runtime transform as before across consecutive drags", async () => {
    const { asset, scene } = await fixture();
    const events: AuthoringViewerEvent[] = [];
    const viewer = createAuthoringSceneViewer(fakeContainer(), {
      assetResolver: { resolve: () => Promise.resolve(new Blob([asset])) },
      onEvent: (event) => events.push(event),
    });
    await viewer.load(scene);

    viewer.selectEntity("factory-cell");
    viewer.setTool("translate");
    const controls = requiredControls();
    expect(controls.object).toBeDefined();
    controls.emit("mouseDown", { mode: "translate" });
    if (controls.object === undefined) throw new Error("TransformControls did not attach.");
    controls.object.position.x += 2;
    controls.object.updateMatrixWorld(true);
    controls.emit("objectChange");
    controls.emit("mouseUp", { mode: "translate" });

    controls.emit("mouseDown", { mode: "translate" });
    controls.object.position.x += 3;
    controls.object.updateMatrixWorld(true);
    controls.emit("objectChange");
    controls.emit("mouseUp", { mode: "translate" });

    const previews = events.filter((event) => event.type === "transform-preview");
    const commits = events.filter((event) => event.type === "transform-commit");
    expect(previews).toHaveLength(2);
    expect(previews[0]).toMatchObject({
      type: "transform-preview",
      entityId: "factory-cell",
      transform: { position: [2, 0, 0] },
    });
    expect(commits).toHaveLength(2);
    expect(commits[0]).toMatchObject({
      type: "transform-commit",
      entityId: "factory-cell",
      before: { position: [0, 0, 0] },
      after: { position: [2, 0, 0] },
    });
    expect(commits[1]).toMatchObject({
      type: "transform-commit",
      entityId: "factory-cell",
      before: { position: [2, 0, 0] },
      after: { position: [5, 0, 0] },
    });
    await viewer.dispose();
  });

  it("synchronously reverts an active drag and suppresses authoring surfaces in Run", async () => {
    const { asset, scene } = await fixture();
    const events: AuthoringViewerEvent[] = [];
    const viewer = createAuthoringSceneViewer(fakeContainer(), {
      assetResolver: { resolve: () => Promise.resolve(new Blob([asset])) },
      onEvent: (event) => events.push(event),
    });
    await viewer.load(scene);
    viewer.selectEntity("factory-cell");
    viewer.setTool("translate");
    const controls = requiredControls();
    const helper = controls.helper;
    controls.emit("mouseDown", { mode: "translate" });
    if (controls.object === undefined) throw new Error("TransformControls did not attach.");
    const draggedObject = controls.object;
    draggedObject.position.x = 4;
    draggedObject.updateMatrixWorld(true);
    controls.emit("objectChange");
    expect(draggedObject.position.x).toBe(4);
    const previewCount = events.filter((event) => event.type === "transform-preview").length;

    viewer.setAuthoringMode("run");
    expect(draggedObject.position.x).toBe(0);
    expect(viewer.isTransformDragging()).toBe(false);
    expect(controls.object).toBeUndefined();
    expect(helper.parent).toBeNull();
    expect(viewer.getSnapshot()).toMatchObject({
      selectedEntityId: "factory-cell",
      selectedEntityIds: ["factory-cell"],
    });

    controls.emit("objectChange");
    controls.emit("mouseUp", { mode: "translate" });
    expect(events.filter((event) => event.type === "transform-preview")).toHaveLength(previewCount);
    expect(events.filter((event) => event.type === "transform-commit")).toHaveLength(0);

    viewer.setAuthoringMode("edit");
    expect(helper.parent).not.toBeNull();
    expect(controls.object).toBe(draggedObject);
    await viewer.dispose();
  });

  it("exposes a deeply immutable finite creation frame only while ready", async () => {
    const { asset, scene } = await fixture();
    const replacement = deferred<Blob>();
    let loadCount = 0;
    const viewer = createAuthoringSceneViewer(fakeContainer(), {
      assetResolver: {
        resolve: () => {
          loadCount += 1;
          if (loadCount === 1) return Promise.resolve(new Blob([asset]));
          return replacement.promise;
        },
      },
    });

    expect(viewer.getLightCreationFrame()).toBeNull();
    await viewer.load(scene);
    const frame = viewer.getLightCreationFrame();
    const target = new Vector3(0, 0.75, 0);
    const camera = new Vector3(7.5, 5.5, 8.5);
    const offsetY = Math.min(5, Math.max(0.5, camera.distanceTo(target) * 0.2));
    expect(frame).toEqual({
      position: [0, 0.75 + offsetY, 0],
      target: [0, 0.75, 0],
    });
    expect(Object.isFrozen(frame)).toBe(true);
    expect(Object.isFrozen(frame?.position)).toBe(true);
    expect(Object.isFrozen(frame?.target)).toBe(true);

    const loading = viewer.load({ ...scene, revision: scene.revision + 1 });
    await vi.waitFor(() => expect(viewer.getSnapshot().lifecycle).toBe("loading"));
    expect(viewer.getLightCreationFrame()).toBeNull();
    replacement.resolve(new Blob([asset]));
    await loading;
    expect(viewer.getLightCreationFrame()).not.toBeNull();

    await viewer.dispose();
    expect(viewer.getLightCreationFrame()).toBeNull();
  });

  it("never fabricates a creation frame after an initial load failure", async () => {
    const { asset, scene } = await fixture();
    const viewer = createAuthoringSceneViewer(fakeContainer(), {
      assetResolver: { resolve: () => Promise.resolve(new Blob([asset])) },
    });

    await expect(
      viewer.load({
        ...scene,
        assets: scene.assets.map((candidate) => ({
          ...candidate,
          sha256: "0".repeat(64),
        })),
        targets: scene.targets.map((target) => ({
          ...target,
          assetHash: "0".repeat(64),
        })),
      }),
    ).rejects.toMatchObject({ diagnostic: { code: "ASSET_HASH_MISMATCH" } });

    expect(viewer.getSnapshot().lifecycle).toBe("created");
    expect(viewer.getLightCreationFrame()).toBeNull();
    await viewer.dispose();
  });

  it("enforces light tool capabilities and removes light picks in Run", async () => {
    const { asset, scene } = await fixture();
    const point = pointLight("point-a");
    const spot = spotLight("spot-a");
    const viewer = createAuthoringSceneViewer(fakeContainer(), {
      assetResolver: { resolve: () => Promise.resolve(new Blob([asset])) },
    });
    await viewer.load(withLights(scene, [point, spot], scene.revision + 1));

    viewer.selectEntity(point.id);
    viewer.setTool("translate");
    const controls = requiredControls();
    expect(controls.object?.name).toBe(point.id);
    expect(() => viewer.setTool("rotate")).toThrow(/Point light.*rotate/u);
    expect(() => viewer.setTool("scale")).toThrow(/light.*scale/u);
    expect(viewer.getTool()).toBe("translate");

    viewer.selectEntity(spot.id);
    viewer.setTool("rotate");
    expect(controls.object?.name).toBe(spot.id);
    expect(() => viewer.setTool("scale")).toThrow(/light.*scale/u);

    const sceneRoot = runtime.scenes.at(-1);
    expect(sceneRoot?.getObjectByName(`light-helper:${point.id}`)).toBeDefined();
    expect(sceneRoot?.getObjectByName(`light-pick-proxy:${spot.id}`)).toBeDefined();
    expect(sceneRoot?.children.filter((object) => object instanceof BoxHelper)).toHaveLength(1);
    viewer.setAuthoringMode("run");
    expect(() => viewer.setTool("translate")).toThrow(/Run/u);
    expect(sceneRoot?.getObjectByName(`light-helper:${point.id}`)).toBeUndefined();
    expect(sceneRoot?.getObjectByName(`light-pick-proxy:${spot.id}`)).toBeUndefined();
    expect(sceneRoot?.children.filter((object) => object instanceof BoxHelper)).toHaveLength(0);

    viewer.selectEntity(point.id);
    expect(viewer.getSnapshot().selectedEntityId).toBe(point.id);
    const selectedPoint = sceneRoot?.getObjectByName(point.id);
    if (selectedPoint === undefined) throw new Error("Point runtime object is missing.");
    vi.spyOn(Raycaster.prototype, "intersectObject").mockReturnValue([
      { object: selectedPoint } as ReturnType<Raycaster["intersectObject"]>[number],
    ]);
    const canvas = runtime.canvases.at(-1);
    if (canvas === undefined) throw new Error("Canvas not created.");
    canvas.dispatch("pointerdown", { clientX: 100, clientY: 100 });
    canvas.dispatch("pointerup", { clientX: 100, clientY: 100 });
    expect(viewer.getSnapshot().selectedEntityId).toBe(point.id);

    viewer.setAuthoringMode("edit");
    expect(sceneRoot?.getObjectByName(`light-pick-proxy:${point.id}`)).toBeDefined();
    expect(sceneRoot?.children.filter((object) => object instanceof BoxHelper)).toHaveLength(1);
    expect(controls.object).toBeUndefined();
    viewer.setTool("translate");
    expect(controls.object?.name).toBe(point.id);
    await viewer.dispose();
  });

  it.each([
    {
      label: "Point translate",
      entity: pointLight("point-sanitize"),
      tool: "translate" as const,
      allowed: { position: [4, 5, 6] as const },
      forbidden: {
        rotation: [0, Math.SQRT1_2, 0, Math.SQRT1_2] as const,
        scale: [2, 3, 4] as const,
      },
    },
    {
      label: "Spot translate",
      entity: spotLight("spot-translate-sanitize"),
      tool: "translate" as const,
      allowed: { position: [4, 5, 6] as const },
      forbidden: {
        rotation: [0, Math.SQRT1_2, 0, Math.SQRT1_2] as const,
        scale: [2, 3, 4] as const,
      },
    },
    {
      label: "Spot rotate",
      entity: spotLight("spot-rotate-sanitize"),
      tool: "rotate" as const,
      allowed: { rotation: [0, Math.SQRT1_2, 0, Math.SQRT1_2] as const },
      forbidden: {
        position: [4, 5, 6] as const,
        scale: [2, 3, 4] as const,
      },
    },
  ])("restores unsupported TRS before $label preview and commit", async (caseData) => {
    const { asset, scene } = await fixture();
    const authored =
      caseData.entity.light.kind === "spot"
        ? {
            ...caseData.entity,
            transform: {
              ...caseData.entity.transform,
              rotation: [Math.SQRT1_2, 0, 0, Math.SQRT1_2] as const,
            },
          }
        : caseData.entity;
    const events: AuthoringViewerEvent[] = [];
    const viewer = createAuthoringSceneViewer(fakeContainer(), {
      assetResolver: { resolve: () => Promise.resolve(new Blob([asset])) },
      onEvent: (event) => events.push(event),
    });
    await viewer.load(withLights(scene, [authored], scene.revision + 1));
    viewer.selectEntity(authored.id);
    viewer.setTool(caseData.tool);
    const controls = requiredControls();
    controls.emit("mouseDown", { mode: caseData.tool });
    if (controls.object === undefined) throw new Error("TransformControls did not attach.");
    if (caseData.allowed.position !== undefined) {
      controls.object.position.fromArray(caseData.allowed.position);
    }
    if (caseData.allowed.rotation !== undefined) {
      controls.object.quaternion.fromArray(caseData.allowed.rotation);
    }
    if (caseData.forbidden.position !== undefined) {
      controls.object.position.fromArray(caseData.forbidden.position);
    }
    if (caseData.forbidden.rotation !== undefined) {
      controls.object.quaternion.fromArray(caseData.forbidden.rotation);
    }
    controls.object.scale.fromArray(caseData.forbidden.scale);
    controls.object.updateMatrixWorld(true);
    controls.emit("objectChange");

    const expected = {
      position:
        caseData.tool === "translate" ? caseData.allowed.position : authored.transform.position,
      rotation:
        caseData.tool === "rotate" ? caseData.allowed.rotation : authored.transform.rotation,
      scale: authored.transform.scale,
    };
    expect(readObjectTransform(controls.object)).toEqual(expected);
    expect(transformEvents(events, "transform-preview").at(-1)?.transform).toEqual(expected);

    controls.object.scale.set(7, 8, 9);
    if (caseData.tool === "translate") controls.object.quaternion.set(0, 0, 1, 0);
    else controls.object.position.set(7, 8, 9);
    controls.emit("mouseUp", { mode: caseData.tool });

    expect(readObjectTransform(controls.object)).toEqual(expected);
    const commit = transformEvents(events, "transform-commit").at(-1);
    expect(commit?.before).toEqual(authored.transform);
    expect(commit?.after).toEqual(expected);
    await viewer.dispose();
  });

  it("retains authoring identity and controlled selection across light-only revisions", async () => {
    const { asset, scene } = await fixture();
    const events: AuthoringViewerEvent[] = [];
    const point = pointLight("point-a");
    const viewer = createAuthoringSceneViewer(fakeContainer(), {
      assetResolver: { resolve: () => Promise.resolve(new Blob([asset])) },
      onEvent: (event) => events.push(event),
    });
    await viewer.load(withLights(scene, [point], 10));
    viewer.selectEntity(point.id);
    viewer.setTool("translate");
    const canvas = runtime.canvases.at(-1);
    const controls = requiredControls();
    const firstObject = controls.object;
    const helper = controls.helper;
    const selectionEventsBefore = selectionEvents(events).length;

    const updated = {
      ...point,
      light: { ...point.light, intensity: 50 },
    } satisfies LightEntity;
    await viewer.load(withLights(scene, [updated], 11));

    expect(runtime.canvases.at(-1)).toBe(canvas);
    expect(requiredControls()).toBe(controls);
    expect(controls.helper).toBe(helper);
    expect(controls.object).not.toBe(firstObject);
    expect(controls.object?.name).toBe(point.id);
    expect(viewer.getSnapshot()).toMatchObject({
      revision: 11,
      selectedEntityId: point.id,
      selectedEntityIds: [point.id],
      activeTool: "translate",
    });
    expect(selectionEvents(events)).toHaveLength(selectionEventsBefore);

    await viewer.load(withLights(scene, [], 12));
    expect(viewer.getSnapshot().selectedEntityId).toBeNull();
    expect(controls.object).toBeUndefined();
    expect(selectionEvents(events).at(-1)).toMatchObject({ entityId: null, origin: "api" });
    await viewer.dispose();
  });

  it("keeps Run authoritative when mode changes after a light-only stage", async () => {
    const { asset, scene } = await fixture();
    const events: AuthoringViewerEvent[] = [];
    const point = pointLight("point-mode-race");
    const viewer = createAuthoringSceneViewer(fakeContainer(), {
      assetResolver: { resolve: () => Promise.resolve(new Blob([asset])) },
      onEvent: (event) => events.push(event),
    });
    await viewer.load(withLights(scene, [point], 20));
    viewer.selectEntity(point.id);
    viewer.setTool("translate");
    const controls = requiredControls();
    const canvas = runtime.canvases.at(-1);
    const sceneRoot = runtime.scenes.at(-1);
    if (canvas === undefined || sceneRoot === undefined) throw new Error("Viewport not created.");
    const stageReached = deferred<void>();
    const originalStage = AuthoredLightController.prototype.stage;
    vi.spyOn(AuthoredLightController.prototype, "stage").mockImplementation(function (
      this: AuthoredLightController,
      lights,
    ) {
      const staged = originalStage.call(this, lights);
      stageReached.resolve();
      return staged;
    });
    const intersect = vi.spyOn(Raycaster.prototype, "intersectObject");
    const selectionEventCount = selectionEvents(events).length;
    const loading = viewer.load(
      withLights(scene, [{ ...point, light: { ...point.light, intensity: 75 } }], 21),
    );

    await stageReached.promise;
    viewer.setAuthoringMode("run");
    await loading;

    expect(viewer.getSnapshot()).toMatchObject({
      revision: 21,
      selectedEntityId: point.id,
      selectedEntityIds: [point.id],
    });
    expect(requiredControls()).toBe(controls);
    expect(controls.object).toBeUndefined();
    expect(controls.helper.parent).toBeNull();
    expect(sceneRoot.getObjectsByProperty("name", `light-helper:${point.id}`)).toHaveLength(0);
    expect(sceneRoot.getObjectsByProperty("name", `light-pick-proxy:${point.id}`)).toHaveLength(0);
    expect(sceneRoot.children.filter((object) => object instanceof BoxHelper)).toHaveLength(0);
    canvas.dispatch("pointerdown", { clientX: 100, clientY: 100 });
    canvas.dispatch("pointerup", { clientX: 100, clientY: 100 });
    expect(intersect).not.toHaveBeenCalled();
    expect(selectionEvents(events)).toHaveLength(selectionEventCount);
    await viewer.dispose();
  });

  it("keeps Edit authoritative when mode changes after a light-only stage", async () => {
    const { asset, scene } = await fixture();
    const point = pointLight("point-mode-race");
    const viewer = createAuthoringSceneViewer(fakeContainer(), {
      assetResolver: { resolve: () => Promise.resolve(new Blob([asset])) },
    });
    await viewer.load(withLights(scene, [point], 30));
    viewer.selectEntity(point.id);
    viewer.setTool("translate");
    const controls = requiredControls();
    const previousObject = controls.object;
    const sceneRoot = runtime.scenes.at(-1);
    if (sceneRoot === undefined) throw new Error("Scene not created.");
    viewer.setAuthoringMode("run");
    const stageReached = deferred<void>();
    const originalStage = AuthoredLightController.prototype.stage;
    vi.spyOn(AuthoredLightController.prototype, "stage").mockImplementation(function (
      this: AuthoredLightController,
      lights,
    ) {
      const staged = originalStage.call(this, lights);
      stageReached.resolve();
      return staged;
    });
    const loading = viewer.load(
      withLights(scene, [{ ...point, light: { ...point.light, intensity: 100 } }], 31),
    );

    await stageReached.promise;
    viewer.setAuthoringMode("edit");
    await loading;

    expect(viewer.getSnapshot()).toMatchObject({
      revision: 31,
      selectedEntityId: point.id,
      selectedEntityIds: [point.id],
      activeTool: "translate",
    });
    expect(requiredControls()).toBe(controls);
    expect(controls.object).not.toBe(previousObject);
    expect(controls.object?.name).toBe(point.id);
    expect(controls.helper.parent).not.toBeNull();
    expect(sceneRoot.getObjectsByProperty("name", `light-helper:${point.id}`)).toHaveLength(1);
    expect(sceneRoot.getObjectsByProperty("name", `light-pick-proxy:${point.id}`)).toHaveLength(1);
    expect(sceneRoot.children.filter((object) => object instanceof BoxHelper)).toHaveLength(1);
    await viewer.dispose();
  });

  it("delivers base viewer events once through the authoring callback", async () => {
    const { asset, scene } = await fixture();
    const events: AuthoringViewerEvent[] = [];
    const viewer = createAuthoringSceneViewer(fakeContainer(), {
      assetResolver: { resolve: () => Promise.resolve(new Blob([asset])) },
      onEvent: (event) => events.push(event),
    });

    await viewer.load(scene);
    expect(events.filter((event) => event.type === "ready")).toHaveLength(1);
    expect(() => viewer.selectEntity("missing-entity")).toThrow();
    expect(events.filter((event) => event.type === "diagnostic")).toHaveLength(1);
    runtime.frames.shift()?.(0);
    expect(events.filter((event) => event.type === "performance")).toHaveLength(1);
    await viewer.dispose();
  });

  it("gates data runtime and completely restores authoring state when disabled", async () => {
    const { asset, scene: fixtureScene } = await fixture();
    const scene = withObjectVisibilityRules(fixtureScene);
    const adapter = controlledAdapter();
    const events: AuthoringViewerEvent[] = [];
    const viewer = createAuthoringSceneViewer(fakeContainer(), {
      adapters: { "factory-telemetry": adapter.value },
      assetResolver: { resolve: () => Promise.resolve(new Blob([asset])) },
      onEvent: (event) => events.push(event),
    });
    const canvas = runtime.canvases.at(-1);
    if (canvas === undefined) throw new Error("Canvas not created.");

    await viewer.load(scene);
    expect(adapter.start).not.toHaveBeenCalled();
    expect(viewer.getSnapshot()).toMatchObject({
      dataRuntimeEnabled: false,
      connections: {},
      alarms: [],
      bindingStates: [],
    });

    viewer.selectEntity("factory-cell");
    viewer.setTool("translate");
    const generationObject = requiredControls().object;
    const press = generationObject?.getObjectByName("PressStation");
    if (generationObject === undefined || press === undefined) {
      throw new Error("Press runtime object is missing.");
    }
    const baselineColor = firstMaterialColor(press);
    const baselineVisibility = press.visible;

    await viewer.setDataRuntimeEnabled(true);
    expect(adapter.start).toHaveBeenCalledOnce();
    expect(viewer.getSnapshot().dataRuntimeEnabled).toBe(true);
    events.length = 0;
    adapter.emit({
      kind: "snapshot",
      sourceId: "factory-telemetry",
      streamId: "preview",
      sequence: 1,
      sourceTime: "2026-07-15T10:00:00.000Z",
      quality: "good",
      value: {
        machines: {
          "PRESS-01": { status: "fault" },
          "CONVEYOR-01": { status: "running" },
        },
      },
    });

    const active = viewer.getSnapshot();
    expect(active.connections).toEqual({ "factory-telemetry": "online" });
    expect(active.bindingStates).toMatchObject([
      {
        bindingId: "conveyor-01-status-binding",
        value: { status: "running" },
        ruleId: "status-running",
      },
      {
        bindingId: "press-01-status-binding",
        value: { status: "fault" },
        ruleId: "status-fault",
      },
    ]);
    expect(active.alarms).toEqual([
      expect.objectContaining({
        bindingId: "press-01-status-binding",
        level: "critical",
        message: "Equipment fault",
      }),
    ]);
    expect(press.visible).toBe(false);
    expect(firstMaterialColor(press)).toBe("b93632");

    const exposedValue = active.bindingStates.find(
      (state) => state.bindingId === "press-01-status-binding",
    )?.value;
    if (exposedValue === null || typeof exposedValue !== "object" || Array.isArray(exposedValue)) {
      throw new Error("Expected an object-valued binding state.");
    }
    exposedValue["status"] = "mutated";
    expect(
      viewer
        .getSnapshot()
        .bindingStates.find((state) => state.bindingId === "press-01-status-binding")?.value,
    ).toEqual({ status: "fault" });

    const bindingEventsBeforeDuplicate = bindingStateEvents(events).length;
    const alarmEventsBeforeDuplicate = alarmEvents(events).length;
    adapter.emit({
      kind: "snapshot",
      sourceId: "factory-telemetry",
      streamId: "preview",
      sequence: 2,
      sourceTime: "2026-07-15T10:00:00.000Z",
      quality: "good",
      value: {
        machines: {
          "PRESS-01": { status: "fault" },
          "CONVEYOR-01": { status: "running" },
        },
      },
    });
    expect(bindingStateEvents(events)).toHaveLength(bindingEventsBeforeDuplicate);
    expect(alarmEvents(events)).toHaveLength(alarmEventsBeforeDuplicate);

    await viewer.setDataRuntimeEnabled(false);
    expect(adapter.stop).toHaveBeenCalledOnce();
    expect(adapter.unsubscribe).toHaveBeenCalledOnce();
    expect(viewer.getSnapshot()).toMatchObject({
      dataRuntimeEnabled: false,
      connections: {},
      alarms: [],
      bindingStates: [],
      selectedEntityId: "factory-cell",
    });
    expect(bindingStateEvents(events).filter((event) => event.transition === "cleared")).toEqual([
      {
        type: "binding-state-change",
        transition: "cleared",
        bindingId: "conveyor-01-status-binding",
      },
      {
        type: "binding-state-change",
        transition: "cleared",
        bindingId: "press-01-status-binding",
      },
    ]);
    expect(alarmEvents(events).at(-1)).toMatchObject({
      transition: "cleared",
      alarm: { bindingId: "press-01-status-binding", ruleId: "status-fault" },
    });
    expect(firstMaterialColor(press)).toBe(baselineColor);
    expect(press.visible).toBe(baselineVisibility);
    expect(requiredControls().object).toBe(generationObject);
    expect(runtime.canvases.at(-1)).toBe(canvas);

    const firstEnable = viewer.setDataRuntimeEnabled(true);
    const interveningDisable = viewer.setDataRuntimeEnabled(false);
    const latestEnable = viewer.setDataRuntimeEnabled(true);
    await Promise.all([firstEnable, interveningDisable, latestEnable]);
    expect(viewer.getSnapshot().dataRuntimeEnabled).toBe(true);
    expect(adapter.maxActiveSubscriptions).toBe(1);
    expect(adapter.activeSubscriptions).toBe(1);

    await viewer.dispose();
    expect(adapter.activeSubscriptions).toBe(0);
    expect(adapter.stop).toHaveBeenCalledTimes(adapter.start.mock.calls.length);
    expect(adapter.unsubscribe).toHaveBeenCalledTimes(adapter.start.mock.calls.length);
  });

  it("preempts a pending adapter start when data runtime is disabled", async () => {
    const { asset, scene } = await fixture();
    const starting = deferred<void>();
    const adapter = controlledAdapter({ start: () => starting.promise });
    const viewer = createAuthoringSceneViewer(fakeContainer(), {
      adapters: { "factory-telemetry": adapter.value },
      assetResolver: { resolve: () => Promise.resolve(new Blob([asset])) },
    });
    await viewer.load(scene);

    const enabling = viewer.setDataRuntimeEnabled(true);
    await vi.waitFor(() => expect(adapter.start).toHaveBeenCalledOnce());
    const disabling = viewer.setDataRuntimeEnabled(false);

    await expect(disabling).resolves.toBeUndefined();
    await expect(enabling).resolves.toBeUndefined();
    expect(viewer.getSnapshot()).toMatchObject({
      dataRuntimeEnabled: false,
      connections: {},
      alarms: [],
      bindingStates: [],
    });
    expect(adapter.stop).toHaveBeenCalledOnce();
    expect(adapter.unsubscribe).toHaveBeenCalledOnce();
    expect(adapter.activeSubscriptions).toBe(0);
    await viewer.dispose();
    expect(adapter.stop).toHaveBeenCalledOnce();
    expect(adapter.unsubscribe).toHaveBeenCalledOnce();
  });

  it("clears transient effects immediately while physical adapter stop is slow", async () => {
    const { asset, scene: fixtureScene } = await fixture();
    const scene = withObjectVisibilityRules(fixtureScene);
    const stopped = deferred<void>();
    const adapter = controlledAdapter({ stop: () => stopped.promise });
    const viewer = createAuthoringSceneViewer(fakeContainer(), {
      adapters: { "factory-telemetry": adapter.value },
      assetResolver: { resolve: () => Promise.resolve(new Blob([asset])) },
    });
    await viewer.load(scene);
    viewer.selectEntity("factory-cell");
    viewer.setTool("translate");
    const press = requiredControls().object?.getObjectByName("PressStation");
    if (press === undefined) throw new Error("Press runtime object is missing.");
    const baselineColor = firstMaterialColor(press);
    const baselineVisibility = press.visible;

    await viewer.setDataRuntimeEnabled(true);
    adapter.emit({
      kind: "snapshot",
      sourceId: "factory-telemetry",
      streamId: "preview",
      sequence: 1,
      quality: "good",
      value: {
        machines: {
          "PRESS-01": { status: "fault" },
          "CONVEYOR-01": { status: "running" },
        },
      },
    });
    expect(press.visible).toBe(false);
    expect(firstMaterialColor(press)).toBe("b93632");

    let disableSettled = false;
    const disabling = viewer.setDataRuntimeEnabled(false).then(() => {
      disableSettled = true;
    });

    expect(adapter.stop).toHaveBeenCalledOnce();
    expect(adapter.unsubscribe).toHaveBeenCalledOnce();
    expect(adapter.activeSubscriptions).toBe(0);
    expect(viewer.getSnapshot()).toMatchObject({
      dataRuntimeEnabled: false,
      connections: {},
      alarms: [],
      bindingStates: [],
    });
    expect(firstMaterialColor(press)).toBe(baselineColor);
    expect(press.visible).toBe(baselineVisibility);
    await Promise.resolve();
    expect(disableSettled).toBe(false);

    stopped.resolve();
    await disabling;
    await viewer.dispose();
    expect(adapter.stop).toHaveBeenCalledOnce();
    expect(adapter.unsubscribe).toHaveBeenCalledOnce();
  });

  it("does not attach transform controls for locked or hidden entities", async () => {
    const { asset, scene } = await fixture();
    const viewer = createAuthoringSceneViewer(fakeContainer(), {
      assetResolver: { resolve: () => Promise.resolve(new Blob([asset])) },
    });
    await viewer.load(lockEntity(scene, { locked: true }));
    viewer.setTool("translate");
    viewer.selectEntity("factory-cell");
    expect(requiredControls().object).toBeUndefined();
    await viewer.dispose();

    const hidden = createAuthoringSceneViewer(fakeContainer(), {
      assetResolver: { resolve: () => Promise.resolve(new Blob([asset])) },
    });
    await hidden.load(lockEntity(scene, { visible: false }));
    hidden.setTool("translate");
    hidden.selectEntity("factory-cell");
    expect(requiredControls().object).toBeUndefined();
    await hidden.dispose();
  });

  it("uses hierarchy visibility but only local lock state for transform attachment", async () => {
    const { asset, scene } = await fixture();
    const hiddenParent = createAuthoringSceneViewer(fakeContainer(), {
      assetResolver: { resolve: () => Promise.resolve(new Blob([asset])) },
    });
    await hiddenParent.load(withParentState(scene, { visible: false, locked: false }));
    hiddenParent.setTool("translate");
    hiddenParent.selectEntity("factory-cell");
    expect(requiredControls().object).toBeUndefined();
    await hiddenParent.dispose();

    const lockedParent = createAuthoringSceneViewer(fakeContainer(), {
      assetResolver: { resolve: () => Promise.resolve(new Blob([asset])) },
    });
    await lockedParent.load(withParentState(scene, { visible: true, locked: true }));
    lockedParent.setTool("translate");
    lockedParent.selectEntity("factory-cell");
    expect(requiredControls().object?.name).toBe("factory-cell");
    await lockedParent.dispose();
  });

  it("reconciles validated transform settings without recreating controls or listeners", async () => {
    const viewer = createAuthoringSceneViewer(fakeContainer());
    const controls = requiredControls();
    const settings = {
      translationSnap: 0.5,
      rotationSnapRadians: Math.PI / 12,
      scaleSnap: 0.1,
    };

    viewer.setTransformSettings(settings);
    expect(controls.translationSnap).toBe(0.5);
    expect(controls.rotationSnap).toBe(Math.PI / 12);
    expect(controls.scaleSnap).toBe(0.1);
    expect(controls.setTranslationSnap).toHaveBeenCalledOnce();
    expect(controls.setRotationSnap).toHaveBeenCalledOnce();
    expect(controls.setScaleSnap).toHaveBeenCalledOnce();

    viewer.setTransformSettings({ ...settings });
    expect(controls.setTranslationSnap).toHaveBeenCalledOnce();
    expect(() =>
      viewer.setTransformSettings({
        translationSnap: 0,
        rotationSnapRadians: null,
        scaleSnap: null,
      }),
    ).toThrow("finite numbers greater than zero");
    expect(controls.translationSnap).toBe(0.5);
    expect(controls.rotationSnap).toBe(Math.PI / 12);
    expect(controls.scaleSnap).toBe(0.1);
    expect(runtime.transformControls).toHaveLength(1);
    expect([...controls.listeners.values()].every((listeners) => listeners.size === 1)).toBe(true);
    await viewer.dispose();
  });

  it("prefers a smart candidate over fixed world-grid snap and commits the snapped preview once", async () => {
    const { asset, scene } = await fixture();
    const events: AuthoringViewerEvent[] = [];
    const source = withEntityPosition(scene, "secondary-entity", [2.08, 0, 0]);
    const viewer = createAuthoringSceneViewer(fakeContainer(), {
      assetResolver: { resolve: () => Promise.resolve(new Blob([asset])) },
      onEvent: (event) => events.push(event),
    });
    await viewer.load(source);
    viewer.setTransformSettings({
      translationSnap: 0.5,
      rotationSnapRadians: null,
      scaleSnap: null,
    });
    viewer.selectEntity("factory-cell");
    viewer.setTool("translate");
    const controls = requiredControls();
    controls.axis = "X";
    controls.emit("mouseDown");
    if (controls.object === undefined) throw new Error("TransformControls did not attach.");

    controls.object.position.x = 1.99;
    controls.object.updateMatrixWorld(true);
    controls.emit("objectChange");

    expect(controls.object.position.x).toBeCloseTo(2.08, 10);
    expect(requiredGuideGroup().visible).toBe(true);
    const previews = transformEvents(events, "transform-preview");
    expect(previews).toHaveLength(1);
    expect(previews[0]?.transform.position[0]).toBeCloseTo(2.08, 10);
    controls.emit("mouseUp");
    const commits = transformEvents(events, "transform-commit");
    expect(commits).toHaveLength(1);
    expect(commits[0]?.after).toEqual(previews[0]?.transform);
    expect(requiredGuideGroup().visible).toBe(false);
    expect(controls.translationSnap).toBe(0.5);
    await viewer.dispose();
  });

  it("uses fixed world-grid fallback for negative world coordinates under a transformed parent", async () => {
    const { asset, scene } = await fixture();
    const events: AuthoringViewerEvent[] = [];
    const viewer = createAuthoringSceneViewer(fakeContainer(), {
      assetResolver: { resolve: () => Promise.resolve(new Blob([asset])) },
      onEvent: (event) => events.push(event),
    });
    await viewer.load(withParentTransform(scene, [10, 0, 0]));
    viewer.setTransformSettings({
      translationSnap: 0.5,
      rotationSnapRadians: null,
      scaleSnap: null,
    });
    viewer.selectEntity("factory-cell");
    viewer.setTool("translate");
    const controls = requiredControls();
    controls.axis = "X";
    controls.emit("mouseDown");
    if (controls.object === undefined) throw new Error("TransformControls did not attach.");

    controls.object.position.y = 5.13;
    controls.object.updateMatrixWorld(true);
    controls.emit("objectChange");
    controls.emit("mouseUp");

    expect(controls.object.getWorldPosition(new Vector3()).x).toBeCloseTo(-0.5, 10);
    expect(transformEvents(events, "transform-preview")[0]?.transform.position[1]).toBeCloseTo(
      5.25,
      10,
    );
    expect(transformEvents(events, "transform-commit")).toHaveLength(1);
    expect(requiredGuideGroup().visible).toBe(false);
    await viewer.dispose();
  });

  it("keeps fixed world-grid fallback when revision-bound smart snapshots are stale", async () => {
    const { asset, scene } = await fixture();
    const events: AuthoringViewerEvent[] = [];
    const viewer = createAuthoringSceneViewer(fakeContainer(), {
      assetResolver: { resolve: () => Promise.resolve(new Blob([asset])) },
      onEvent: (event) => events.push(event),
    });
    await viewer.load(scene);
    viewer.setTransformSettings({
      translationSnap: 0.5,
      rotationSnapRadians: null,
      scaleSnap: null,
    });
    viewer.selectEntity("factory-cell");
    viewer.setTool("translate");
    const controls = requiredControls();
    controls.axis = "X";
    if (controls.object === undefined) throw new Error("TransformControls did not attach.");
    controls.object.position.x = 0.1;
    controls.object.updateMatrixWorld(true);

    controls.emit("mouseDown");
    controls.object.position.x = -0.76;
    controls.object.updateMatrixWorld(true);
    controls.emit("objectChange");
    controls.emit("mouseUp");

    expect(controls.object.position.x).toBe(-1);
    expect(requiredGuideGroup().visible).toBe(false);
    expect(transformEvents(events, "transform-preview")[0]?.transform.position[0]).toBe(-1);
    expect(transformEvents(events, "transform-commit")).toHaveLength(1);
    await viewer.dispose();
  });

  it("bypasses smart and fixed translation snapping with Alt for the active drag", async () => {
    const { asset, scene } = await fixture();
    const events: AuthoringViewerEvent[] = [];
    const viewer = createAuthoringSceneViewer(fakeContainer(), {
      assetResolver: { resolve: () => Promise.resolve(new Blob([asset])) },
      onEvent: (event) => events.push(event),
    });
    await viewer.load(withEntityPosition(scene, "secondary-entity", [2.08, 0, 0]));
    viewer.setTransformSettings({
      translationSnap: 0.5,
      rotationSnapRadians: null,
      scaleSnap: null,
    });
    viewer.selectEntity("factory-cell");
    viewer.setTool("translate");
    const controls = requiredControls();
    controls.axis = "X";
    controls.emit("mouseDown");
    requiredView().dispatch("keydown", { altKey: true });
    if (controls.object === undefined) throw new Error("TransformControls did not attach.");

    controls.object.position.x = 1.99;
    controls.object.updateMatrixWorld(true);
    controls.emit("objectChange");
    controls.emit("mouseUp");

    expect(controls.object.position.x).toBeCloseTo(1.99, 10);
    expect(transformEvents(events, "transform-preview")[0]?.transform.position[0]).toBeCloseTo(
      1.99,
      10,
    );
    expect(transformEvents(events, "transform-commit")).toHaveLength(1);
    expect(requiredGuideGroup().visible).toBe(false);

    controls.emit("mouseDown");
    controls.object.position.x = 2.19;
    controls.object.updateMatrixWorld(true);
    controls.emit("objectChange");
    expect(controls.object.position.x).toBeCloseTo(2.19, 10);
    requiredView().dispatch("keyup", { altKey: false });
    controls.emit("mouseUp");
    expect(transformEvents(events, "transform-commit")).toHaveLength(2);
    await viewer.dispose();
  });

  it("snaps only the axes enabled by a plane TransformControls handle", async () => {
    const { asset, scene } = await fixture();
    const events: AuthoringViewerEvent[] = [];
    const viewer = createAuthoringSceneViewer(fakeContainer(), {
      assetResolver: { resolve: () => Promise.resolve(new Blob([asset])) },
      onEvent: (event) => events.push(event),
    });
    await viewer.load(withEntityPosition(scene, "secondary-entity", [2.08, 0.08, 0]));
    viewer.selectEntity("factory-cell");
    viewer.setTool("translate");
    const controls = requiredControls();
    controls.axis = "XY";
    controls.emit("mouseDown");
    if (controls.object === undefined) throw new Error("TransformControls did not attach.");

    controls.object.position.set(1.99, 0.04, 0.24);
    controls.object.updateMatrixWorld(true);
    controls.emit("objectChange");

    expect(controls.object.position.x).toBeCloseTo(2.08, 10);
    expect(controls.object.position.y).toBeCloseTo(0.08, 10);
    expect(controls.object.position.z).toBe(0.24);
    expect(requiredGuideGroup().getObjectByName("smart-align-guide-x")?.visible).toBe(true);
    expect(requiredGuideGroup().getObjectByName("smart-align-guide-y")?.visible).toBe(true);
    expect(requiredGuideGroup().getObjectByName("smart-align-guide-z")?.visible).toBe(false);
    const xPositions = requiredGuidePositions("x");
    expect(xPositions[1]).toBeCloseTo(0.83, 6);
    controls.emit("mouseUp");
    expect(transformEvents(events, "transform-commit")).toHaveLength(1);
    await viewer.dispose();
  });

  it("clears guides and cancels a drag when selection changes without changing primary", async () => {
    const { asset, scene } = await fixture();
    const events: AuthoringViewerEvent[] = [];
    const viewer = createAuthoringSceneViewer(fakeContainer(), {
      assetResolver: { resolve: () => Promise.resolve(new Blob([asset])) },
      onEvent: (event) => events.push(event),
    });
    await viewer.load(withEntityPosition(scene, "secondary-entity", [2.08, 0, 0]));
    viewer.selectEntity("factory-cell");
    viewer.setTool("translate");
    const controls = requiredControls();
    controls.axis = "X";
    controls.emit("mouseDown");
    if (controls.object === undefined) throw new Error("TransformControls did not attach.");
    const draggedObject = controls.object;
    draggedObject.position.x = 1.99;
    draggedObject.updateMatrixWorld(true);
    controls.emit("objectChange");
    expect(requiredGuideGroup().visible).toBe(true);
    const selectionEventCount = selectionEvents(events).length;

    viewer.selectEntities(["factory-cell", "secondary-entity"], "factory-cell");

    expect(viewer.isTransformDragging()).toBe(false);
    expect(draggedObject.position.x).toBe(0);
    expect(requiredGuideGroup().visible).toBe(false);
    expect(controls.object).toBe(draggedObject);
    expect(selectionEvents(events)).toHaveLength(selectionEventCount);
    expect(transformEvents(events, "transform-commit")).toHaveLength(0);
    await viewer.dispose();
    expect(runtime.scenes.at(-1)?.getObjectByName("smart-align-guides")).toBeUndefined();
  });

  it("clears active guides on a superseding load and reattaches without committing", async () => {
    const { asset, scene } = await fixture();
    const events: AuthoringViewerEvent[] = [];
    const source = withEntityPosition(scene, "secondary-entity", [2.08, 0, 0]);
    const viewer = createAuthoringSceneViewer(fakeContainer(), {
      assetResolver: { resolve: () => Promise.resolve(new Blob([asset])) },
      onEvent: (event) => events.push(event),
    });
    await viewer.load(source);
    viewer.selectEntity("factory-cell");
    viewer.setTool("translate");
    const controls = requiredControls();
    controls.axis = "X";
    controls.emit("mouseDown");
    if (controls.object === undefined) throw new Error("TransformControls did not attach.");
    const previousObject = controls.object;
    previousObject.position.x = 1.99;
    previousObject.updateMatrixWorld(true);
    controls.emit("objectChange");
    expect(requiredGuideGroup().visible).toBe(true);

    await viewer.load({ ...source, revision: source.revision + 1 });

    expect(viewer.isTransformDragging()).toBe(false);
    expect(previousObject.position.x).toBe(0);
    expect(requiredGuideGroup().visible).toBe(false);
    expect(controls.object).toBeDefined();
    expect(controls.object).not.toBe(previousObject);
    expect(transformEvents(events, "transform-commit")).toHaveLength(0);
    await viewer.dispose();
  });

  it("silently reverts invalid interactive scale without preview or commit", async () => {
    const { asset, scene } = await fixture();
    const events: AuthoringViewerEvent[] = [];
    const viewer = createAuthoringSceneViewer(fakeContainer(), {
      assetResolver: { resolve: () => Promise.resolve(new Blob([asset])) },
      onEvent: (event) => events.push(event),
    });
    await viewer.load(scene);
    const diagnosticsBefore = viewer.getDiagnostics();
    viewer.selectEntity("factory-cell");
    viewer.setTool("scale");
    const controls = requiredControls();
    controls.emit("mouseDown", { mode: "scale" });
    if (controls.object === undefined) throw new Error("TransformControls did not attach.");

    controls.object.scale.x = 0;
    controls.emit("objectChange");
    expect(controls.object.scale.toArray()).toEqual([1, 1, 1]);
    controls.object.scale.y = -1;
    controls.emit("objectChange");
    controls.emit("mouseUp", { mode: "scale" });

    expect(controls.object.scale.toArray()).toEqual([1, 1, 1]);
    expect(events.filter((event) => event.type === "transform-preview")).toHaveLength(0);
    expect(events.filter((event) => event.type === "transform-commit")).toHaveLength(0);
    expect(events.filter((event) => event.type === "diagnostic")).toHaveLength(0);
    expect(viewer.getDiagnostics()).toEqual(diagnosticsBefore);
    await viewer.dispose();
  });

  it("detaches and reverts an in-progress preview when the tool returns to select", async () => {
    const { asset, scene } = await fixture();
    const events: AuthoringViewerEvent[] = [];
    const viewer = createAuthoringSceneViewer(fakeContainer(), {
      assetResolver: { resolve: () => Promise.resolve(new Blob([asset])) },
      onEvent: (event) => events.push(event),
    });
    await viewer.load(scene);
    viewer.selectEntity("factory-cell");
    viewer.setTool("translate");
    const controls = requiredControls();
    expect(viewer.isTransformDragging()).toBe(false);
    controls.emit("mouseDown", { mode: "translate" });
    expect(viewer.isTransformDragging()).toBe(true);
    if (controls.object === undefined) throw new Error("TransformControls did not attach.");
    const draggedObject = controls.object;
    draggedObject.position.x = 4;
    draggedObject.updateMatrixWorld(true);
    controls.emit("objectChange");

    viewer.setTool("select");

    expect(viewer.isTransformDragging()).toBe(false);
    expect(draggedObject.position.x).toBe(0);
    expect(controls.object).toBeUndefined();
    expect(events.filter((event) => event.type === "transform-preview")).toHaveLength(1);
    expect(events.filter((event) => event.type === "transform-commit")).toHaveLength(0);
    await viewer.dispose();
  });

  it("exposes transform drag state without adding authoring events", async () => {
    const { asset, scene } = await fixture();
    const events: AuthoringViewerEvent[] = [];
    const viewer = createAuthoringSceneViewer(fakeContainer(), {
      assetResolver: { resolve: () => Promise.resolve(new Blob([asset])) },
      onEvent: (event) => events.push(event),
    });
    await viewer.load(scene);
    viewer.selectEntity("factory-cell");
    viewer.setTool("translate");
    const controls = requiredControls();
    const eventsBeforeDrag = events.length;

    controls.emit("mouseDown", { mode: "translate" });
    expect(viewer.isTransformDragging()).toBe(true);
    expect(events).toHaveLength(eventsBeforeDrag);
    controls.emit("mouseUp", { mode: "translate" });
    expect(viewer.isTransformDragging()).toBe(false);
    expect(events).toHaveLength(eventsBeforeDrag);
    await viewer.dispose();
  });

  it("maps viewport picks back to entity ids", async () => {
    const { asset, scene } = await fixture();
    const events: AuthoringViewerEvent[] = [];
    const viewer = createAuthoringSceneViewer(fakeContainer(), {
      assetResolver: { resolve: () => Promise.resolve(new Blob([asset])) },
      onEvent: (event) => events.push(event),
    });
    await viewer.load(scene);
    viewer.selectEntity("factory-cell");
    viewer.setTool("translate");
    const object = requiredControls().object;
    if (object === undefined) throw new Error("Expected a selected entity object.");
    viewer.selectEntity(null);
    vi.spyOn(Raycaster.prototype, "intersectObject").mockReturnValue([
      { object } as ReturnType<Raycaster["intersectObject"]>[number],
    ]);

    const canvas = runtime.canvases.at(-1);
    if (canvas === undefined) throw new Error("Canvas not created.");
    canvas.dispatch("pointerdown", { clientX: 100, clientY: 100 });
    canvas.dispatch("pointerup", { clientX: 100, clientY: 100 });

    expect(viewer.getSnapshot().selectedEntityId).toBe("factory-cell");
    expect(events).toContainEqual({
      type: "entity-selection-change",
      entityId: "factory-cell",
      origin: "viewport",
    });
    await viewer.dispose();
  });

  it("preserves selection across revisions and reattaches to the new runtime object", async () => {
    const { asset, scene } = await fixture();
    const events: AuthoringViewerEvent[] = [];
    const viewer = createAuthoringSceneViewer(fakeContainer(), {
      assetResolver: { resolve: () => Promise.resolve(new Blob([asset])) },
      onEvent: (event) => events.push(event),
    });
    await viewer.load(scene);
    viewer.selectEntity("factory-cell");
    viewer.setTool("translate");
    const previousObject = requiredControls().object;
    const selectionEventCount = selectionEvents(events).length;

    await viewer.load({ ...scene, revision: scene.revision + 1 });

    expect(viewer.getSnapshot().selectedEntityId).toBe("factory-cell");
    expect(requiredControls().object).toBeDefined();
    expect(requiredControls().object).not.toBe(previousObject);
    expect(selectionEvents(events)).toHaveLength(selectionEventCount);
    await viewer.dispose();
  });

  it("normalizes multi-selection, preserves survivors, and attaches controls only to primary", async () => {
    const { asset, scene } = await fixture();
    const events: AuthoringViewerEvent[] = [];
    const withSecondEntity = withEntity(scene, "secondary-entity");
    const viewer = createAuthoringSceneViewer(fakeContainer(), {
      assetResolver: { resolve: () => Promise.resolve(new Blob([asset])) },
      onEvent: (event) => events.push(event),
    });
    await viewer.load(withSecondEntity);
    viewer.setTool("translate");

    viewer.selectEntities(
      ["secondary-entity", "factory-cell", "secondary-entity"],
      "secondary-entity",
    );
    expect(viewer.getSnapshot()).toMatchObject({
      selectedEntityId: "secondary-entity",
      selectedEntityIds: ["factory-cell", "secondary-entity"],
      primaryEntityId: "secondary-entity",
    });
    expect(requiredControls().object?.name).toBe("secondary-entity");

    const beforeInvalid = viewer.getSnapshot();
    expect(() => viewer.selectEntities(["factory-cell"], "secondary-entity")).toThrow(
      "must belong to the selection",
    );
    expect(() =>
      viewer.selectEntities(["factory-cell", "missing-entity"], "factory-cell"),
    ).toThrow();
    expect(viewer.getSnapshot()).toEqual(beforeInvalid);

    const selectionEventCount = selectionEvents(events).length;
    await viewer.load({ ...withSecondEntity, revision: withSecondEntity.revision + 1 });
    expect(viewer.getSnapshot().selectedEntityIds).toEqual(["factory-cell", "secondary-entity"]);
    expect(requiredControls().object?.name).toBe("secondary-entity");
    expect(selectionEvents(events)).toHaveLength(selectionEventCount);

    await viewer.load(
      withoutEntity(
        { ...withSecondEntity, revision: withSecondEntity.revision + 2 },
        "secondary-entity",
      ),
    );
    expect(viewer.getSnapshot()).toMatchObject({
      selectedEntityId: "factory-cell",
      selectedEntityIds: ["factory-cell"],
      primaryEntityId: "factory-cell",
    });
    expect(requiredControls().object?.name).toBe("factory-cell");
    expect(selectionEvents(events).at(-1)).toEqual({
      type: "entity-selection-change",
      entityId: "factory-cell",
      origin: "api",
    });
    expect(runtime.transformControls).toHaveLength(1);
    await viewer.dispose();
  });

  it("applies an entity selection requested while its source revision is loading", async () => {
    const { asset, scene } = await fixture();
    const events: AuthoringViewerEvent[] = [];
    const viewer = createAuthoringSceneViewer(fakeContainer(), {
      assetResolver: { resolve: () => Promise.resolve(new Blob([asset])) },
      onEvent: (event) => events.push(event),
    });
    await viewer.load(scene);
    viewer.setTool("translate");
    const next = withEntity(scene, "imported-entity");

    const loading = viewer.load(next);
    expect(() => viewer.selectEntity("imported-entity")).not.toThrow();
    await loading;

    expect(viewer.getSnapshot().selectedEntityId).toBe("imported-entity");
    expect(requiredControls().object?.name).toBe("imported-entity");
    expect(selectionEvents(events).at(-1)).toEqual({
      type: "entity-selection-change",
      entityId: "imported-entity",
      origin: "api",
    });
    expect(viewer.getDiagnostics()).not.toContainEqual(
      expect.objectContaining({ code: "ENTITY_NOT_FOUND" }),
    );
    await viewer.dispose();
  });

  it("clears a queued selection when the committed revision still lacks the entity", async () => {
    const { asset, scene } = await fixture();
    const events: AuthoringViewerEvent[] = [];
    const viewer = createAuthoringSceneViewer(fakeContainer(), {
      assetResolver: { resolve: () => Promise.resolve(new Blob([asset])) },
      onEvent: (event) => events.push(event),
    });
    await viewer.load(scene);
    viewer.selectEntity("factory-cell");
    viewer.setTool("translate");

    const loading = viewer.load({ ...scene, revision: scene.revision + 1 });
    expect(() => viewer.selectEntity("stale-entity")).not.toThrow();
    await loading;

    expect(viewer.getSnapshot().selectedEntityId).toBeNull();
    expect(requiredControls().object).toBeUndefined();
    expect(selectionEvents(events).at(-1)).toEqual({
      type: "entity-selection-change",
      entityId: null,
      origin: "api",
    });
    expect(viewer.getDiagnostics()).not.toContainEqual(
      expect.objectContaining({ code: "ENTITY_NOT_FOUND" }),
    );
    await viewer.dispose();
  });

  it("clears selection when the document changes or the selected entity is removed", async () => {
    const { asset, scene } = await fixture();
    const events: AuthoringViewerEvent[] = [];
    const viewer = createAuthoringSceneViewer(fakeContainer(), {
      assetResolver: { resolve: () => Promise.resolve(new Blob([asset])) },
      onEvent: (event) => events.push(event),
    });
    await viewer.load(scene);
    viewer.selectEntity("factory-cell");
    viewer.setTool("translate");

    await viewer.load({ ...scene, id: "other-document", revision: scene.revision + 1 });
    expect(viewer.getSnapshot().selectedEntityId).toBeNull();
    expect(requiredControls().object).toBeUndefined();
    expect(selectionEvents(events).at(-1)).toEqual({
      type: "entity-selection-change",
      entityId: null,
      origin: "api",
    });

    viewer.selectEntity("factory-cell");
    const clearsBeforeRemoval = selectionEvents(events).filter(
      (event) => event.entityId === null,
    ).length;
    await viewer.load(
      withoutEntities({ ...scene, id: "other-document", revision: scene.revision + 2 }),
    );
    expect(viewer.getSnapshot().selectedEntityId).toBeNull();
    expect(requiredControls().object).toBeUndefined();
    expect(selectionEvents(events).filter((event) => event.entityId === null)).toHaveLength(
      clearsBeforeRemoval + 1,
    );
    await viewer.dispose();
  });

  it("owns the TransformControls helper and exports the accepted inspection API", async () => {
    const viewer = createAuthoringSceneViewer(fakeContainer());
    const controls = requiredControls();
    expect(controls.helper.parent).not.toBeNull();
    expect(typeof inspectGltf).toBe("function");
    expect(MAX_GLTF_INSPECTION_BYTES).toBe(50 * 1024 * 1024);
    expect(new InspectGltfError("TEST", "test")).toBeInstanceOf(InspectGltfError);
    expectTypeOf<Awaited<ReturnType<typeof inspectGltf>>>().toEqualTypeOf<GltfInspectionSummary>();
    await viewer.dispose();
    expect(controls.helper.parent).toBeNull();
  });

  it("exposes atomic revision-bound spatial snapshots only for a live loaded generation", async () => {
    const { asset, scene } = await fixture();
    const source = withGroup(scene, "empty-group", [3, 0, 0]);
    const viewer = createAuthoringSceneViewer(fakeContainer(), {
      assetResolver: { resolve: () => Promise.resolve(new Blob([asset])) },
    });

    expect(() => viewer.getEntitySpatialSnapshots(["factory-cell"])).toThrow("loaded");
    await viewer.load(source);
    const snapshots = viewer.getEntitySpatialSnapshots([
      "factory-cell",
      "empty-group",
      "factory-cell",
    ]);
    expect(snapshots.map((snapshot) => snapshot.entityId)).toEqual(["empty-group", "factory-cell"]);
    expect(snapshots[0]).toMatchObject({
      documentId: source.id,
      documentRevision: source.revision,
      worldPivot: [3, 0, 0],
      worldBounds: null,
    });
    expect(snapshots[1]?.worldBounds).not.toBeNull();
    expect(Object.isFrozen(snapshots[1]?.localTransform.scale)).toBe(true);

    viewer.selectEntity("factory-cell");
    viewer.setTool("translate");
    const runtimeObject = requiredControls().object;
    const sourceEntity = source.entities.find((entity) => entity.id === "factory-cell");
    if (runtimeObject === undefined || sourceEntity === undefined) {
      throw new Error("Spatial fixture entity is missing.");
    }
    runtimeObject.position.y = 5e-10;
    runtimeObject.updateMatrixWorld(true);
    const canonical = viewer.getEntitySpatialSnapshots(["factory-cell"])[0];
    expect(canonical?.localTransform).toEqual(sourceEntity.transform);
    expect(canonical?.localTransform).not.toBe(sourceEntity.transform);
    expect(canonical?.worldPivot[1]).toBe(5e-10);
    expect(() => viewer.getEntitySpatialSnapshots(["factory-cell", "missing-entity"])).toThrow(
      "missing-entity",
    );

    await viewer.dispose();
    expect(() => viewer.getEntitySpatialSnapshots(["factory-cell"])).toThrow("disposed");
  });

  it("rejects spatial snapshots while a transform preview is not committed to the document", async () => {
    const { asset, scene } = await fixture();
    const viewer = createAuthoringSceneViewer(fakeContainer(), {
      assetResolver: { resolve: () => Promise.resolve(new Blob([asset])) },
    });
    await viewer.load(scene);
    viewer.selectEntity("factory-cell");
    viewer.setTool("translate");
    const controls = requiredControls();
    controls.emit("mouseDown", { mode: "translate" });
    if (controls.object === undefined) throw new Error("TransformControls did not attach.");
    controls.object.position.x = 1;
    controls.object.updateMatrixWorld(true);
    controls.emit("objectChange");

    expect(() => viewer.getEntitySpatialSnapshots(["factory-cell"])).toThrowError(
      expect.objectContaining({ name: "StaleSpatialMeasurementError" }),
    );

    viewer.setTool("rotate");
    expect(viewer.getEntitySpatialSnapshots(["factory-cell"])[0]?.localTransform.position).toEqual([
      0, 0, 0,
    ]);
    await viewer.dispose();
  });
});

async function fixture(): Promise<{ asset: Uint8Array<ArrayBuffer>; scene: SceneDocument }> {
  const sceneUrl = new URL(
    "../../../../tests/fixtures/m0-factory/public/m0-scene.json",
    import.meta.url,
  );
  const assetUrl = new URL(
    "../../../../tests/fixtures/m0-factory/public/m0-factory-cell.glb",
    import.meta.url,
  );
  const [sceneJson, asset] = await Promise.all([readFile(sceneUrl, "utf8"), readFile(assetUrl)]);
  const parsed = parseSceneDocument(sceneJson);
  if (!parsed.ok) throw new Error(parsed.diagnostics[0]?.message ?? "M0 fixture is invalid.");
  return { asset: Uint8Array.from(asset), scene: parsed.value };
}

function withBackground(
  scene: SceneDocument,
  backgroundMode: "theme" | "custom",
  background: string,
): SceneDocument {
  return {
    ...scene,
    environment: { ...scene.environment, background, backgroundMode },
  };
}

function sceneBackground(): string {
  const background = runtime.scenes.at(-1)?.background;
  if (!(background instanceof Color)) throw new Error("Scene color background is missing.");
  return `#${background.getHexString().toUpperCase()}`;
}

function lockEntity(
  scene: SceneDocument,
  patch: Partial<Pick<SceneDocument["entities"][number], "locked" | "visible">>,
): SceneDocument {
  return {
    ...scene,
    entities: scene.entities.map((entity) =>
      entity.id === "factory-cell"
        ? ({ ...entity, ...patch } as SceneDocument["entities"][number])
        : entity,
    ),
  };
}

function withParentState(
  scene: SceneDocument,
  state: { readonly visible: boolean; readonly locked: boolean },
): SceneDocument {
  return {
    ...scene,
    entities: [
      {
        id: "fixture-parent",
        type: "group",
        parentId: null,
        name: "Fixture parent",
        visible: state.visible,
        locked: state.locked,
        transform: {
          position: [0, 0, 0],
          rotation: [0, 0, 0, 1],
          scale: [1, 1, 1],
        },
        metadata: {},
      },
      ...scene.entities.map((entity) =>
        entity.id === "factory-cell" && entity.type !== "light"
          ? { ...entity, parentId: "fixture-parent" }
          : entity,
      ),
    ],
  };
}

function withoutEntities(scene: SceneDocument): SceneDocument {
  return {
    ...scene,
    entities: [],
    targets: [],
    bindings: [],
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

function pointLight(id: string): LightEntity {
  return {
    ...lightBase(id),
    light: { kind: "point", color: "#FFFFFF", intensity: 25, range: null },
  };
}

function spotLight(id: string): LightEntity {
  return {
    ...lightBase(id),
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

function withoutEntity(scene: SceneDocument, entityId: string): SceneDocument {
  return {
    ...scene,
    entities: scene.entities.filter((entity) => entity.id !== entityId),
    targets: scene.targets.filter((target) => target.entityId !== entityId),
  };
}

function withEntity(scene: SceneDocument, entityId: string): SceneDocument {
  const template = scene.entities[0];
  if (template === undefined) throw new Error("Fixture entity is missing.");
  return {
    ...scene,
    revision: scene.revision + 1,
    entities: [
      ...scene.entities,
      {
        ...template,
        id: entityId,
        name: "Imported entity",
        transform: {
          position: [2, 0, 0],
          rotation: [0, 0, 0, 1],
          scale: [1, 1, 1],
        },
      },
    ],
  };
}

function withEntityPosition(
  scene: SceneDocument,
  entityId: string,
  position: readonly [number, number, number],
): SceneDocument {
  const source = withEntity(scene, entityId);
  return {
    ...source,
    entities: source.entities.map((entity) =>
      entity.id === entityId
        ? { ...entity, transform: { ...entity.transform, position: [...position] } }
        : entity,
    ),
  };
}

function withParentTransform(
  scene: SceneDocument,
  position: readonly [number, number, number],
): SceneDocument {
  const source = withParentState(scene, { visible: true, locked: false });
  return {
    ...source,
    entities: source.entities.map((entity) =>
      entity.id === "fixture-parent"
        ? {
            ...entity,
            transform: {
              position: [...position],
              rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2],
              scale: [2, 2, 2],
            },
          }
        : entity,
    ),
  };
}

function withGroup(
  scene: SceneDocument,
  entityId: string,
  position: readonly [number, number, number],
): SceneDocument {
  return {
    ...scene,
    revision: scene.revision + 1,
    entities: [
      ...scene.entities,
      {
        id: entityId,
        type: "group",
        parentId: null,
        name: "Empty group",
        visible: true,
        locked: false,
        transform: { position, rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
        metadata: {},
      },
    ],
  };
}

function withObjectVisibilityRules(scene: SceneDocument): SceneDocument {
  return {
    ...scene,
    bindings: scene.bindings.map((binding) => ({
      ...binding,
      pointer: binding.pointer.replace(/\/status$/u, ""),
      writes: [...binding.writes, "visibility"],
    })),
    ruleSets: scene.ruleSets.map((ruleSet) => ({
      ...ruleSet,
      rules: ruleSet.rules.map((rule) => ({
        ...rule,
        when:
          rule.when.fact === "value" && typeof rule.when.expected === "string"
            ? { ...rule.when, expected: { status: rule.when.expected } }
            : rule.when,
        effects: [
          ...rule.effects,
          { type: "visibility" as const, value: rule.id !== "status-fault" },
        ],
      })),
      fallback: [...ruleSet.fallback, { type: "visibility" as const, value: true }],
    })),
  };
}

function selectionEvents(events: readonly AuthoringViewerEvent[]) {
  return events.filter(
    (event): event is Extract<AuthoringViewerEvent, { type: "entity-selection-change" }> =>
      event.type === "entity-selection-change",
  );
}

function bindingStateEvents(events: readonly AuthoringViewerEvent[]) {
  return events.filter(
    (event): event is Extract<AuthoringViewerEvent, { type: "binding-state-change" }> =>
      event.type === "binding-state-change",
  );
}

function alarmEvents(events: readonly AuthoringViewerEvent[]) {
  return events.filter(
    (event): event is Extract<AuthoringViewerEvent, { type: "alarm" }> => event.type === "alarm",
  );
}

function controlledAdapter(
  options: {
    start?: () => Promise<void>;
    stop?: () => Promise<void>;
  } = {},
) {
  let listener: ((envelope: DataEnvelope) => void) | null = null;
  let activeSubscriptions = 0;
  let maxActiveSubscriptions = 0;
  const start = vi.fn(options.start ?? (() => Promise.resolve()));
  const stop = vi.fn(options.stop ?? (() => Promise.resolve()));
  const unsubscribe = vi.fn(() => {
    listener = null;
    activeSubscriptions -= 1;
  });
  const value: DataAdapter = {
    sourceId: "factory-telemetry",
    start,
    stop,
    subscribe: vi.fn((next) => {
      listener = next;
      activeSubscriptions += 1;
      maxActiveSubscriptions = Math.max(maxActiveSubscriptions, activeSubscriptions);
      return unsubscribe;
    }),
  };
  return {
    value,
    start,
    stop,
    unsubscribe,
    emit(envelope: DataEnvelope) {
      if (listener === null) throw new Error("Adapter is not subscribed.");
      listener(envelope);
    },
    get activeSubscriptions() {
      return activeSubscriptions;
    },
    get maxActiveSubscriptions() {
      return maxActiveSubscriptions;
    },
  };
}

function deferred<T>() {
  let resolve: (value: T | PromiseLike<T>) => void = () => undefined;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function firstMaterialColor(object: Object3D): string | undefined {
  let result: string | undefined;
  object.traverse((candidate) => {
    if (result !== undefined || !(candidate instanceof Mesh)) return;
    const materials = Array.isArray(candidate.material) ? candidate.material : [candidate.material];
    const material = materials.find(hasColor);
    result = material?.color.getHexString();
  });
  return result;
}

function hasColor(material: Material): material is Material & { color: Color } {
  return "color" in material && material.color instanceof Color;
}

function requiredControls(): FakeTransformControls {
  const controls = runtime.transformControls.at(-1);
  if (controls === undefined) throw new Error("TransformControls were not created.");
  return controls;
}

function requiredGuideGroup(): Object3D {
  const guide = runtime.scenes.at(-1)?.getObjectByName("smart-align-guides");
  if (guide === undefined) throw new Error("Smart Align guide group was not created.");
  return guide;
}

function requiredGuidePositions(axis: "x" | "y" | "z"): Float32Array {
  const guide = requiredGuideGroup().getObjectByName(`smart-align-guide-${axis}`);
  if (!(guide instanceof LineSegments)) throw new Error(`Missing ${axis} Smart Align guide.`);
  const positions = guide.geometry.getAttribute("position").array;
  if (!(positions instanceof Float32Array))
    throw new Error("Guide positions are not Float32 data.");
  return positions;
}

function requiredView(): FakeView {
  const view = runtime.views.at(-1);
  if (view === undefined) throw new Error("Fake canvas view was not created.");
  return view;
}

function transformEvents<T extends "transform-preview" | "transform-commit">(
  events: readonly AuthoringViewerEvent[],
  type: T,
): Array<Extract<AuthoringViewerEvent, { type: T }>> {
  return events.filter(
    (event): event is Extract<AuthoringViewerEvent, { type: T }> => event.type === type,
  );
}

function readObjectTransform(object: Object3D): Transform {
  return {
    position: object.position.toArray(),
    rotation: object.quaternion.toArray(),
    scale: object.scale.toArray(),
  };
}

function fakeCanvas() {
  const attributes: Record<string, string> = {};
  const listeners = new Map<string, Set<(event: Record<string, number>) => void>>();
  const view = fakeView();
  runtime.views.push(view);
  return {
    attributes,
    clientHeight: 600,
    clientWidth: 800,
    dataset: {} as Record<string, string>,
    ownerDocument: { defaultView: view },
    style: {} as Record<string, string>,
    tabIndex: 0,
    addEventListener(type: string, listener: (event: Record<string, number>) => void): void {
      const entries = listeners.get(type) ?? new Set();
      entries.add(listener);
      listeners.set(type, entries);
    },
    dispatch(type: string, event: Record<string, number>): void {
      listeners.get(type)?.forEach((listener) => listener(event));
    },
    getBoundingClientRect: () => ({
      bottom: 600,
      height: 600,
      left: 0,
      right: 800,
      top: 0,
      width: 800,
    }),
    remove(): void {},
    removeEventListener(type: string, listener: (event: Record<string, number>) => void): void {
      listeners.get(type)?.delete(listener);
    },
    setAttribute(name: string, value: string): void {
      attributes[name] = value;
    },
  };
}

function fakeView(): FakeView {
  const listeners = new Map<string, Set<(event: Record<string, unknown>) => void>>();
  return {
    addEventListener(type, listener): void {
      const entries = listeners.get(type) ?? new Set();
      entries.add(listener);
      listeners.set(type, entries);
    },
    dispatch(type, event): void {
      listeners.get(type)?.forEach((listener) => listener(event));
    },
    removeEventListener(type, listener): void {
      listeners.get(type)?.delete(listener);
    },
  };
}

function fakeContainer(): HTMLElement {
  return {
    clientHeight: 600,
    clientWidth: 800,
    replaceChildren(): void {},
  } as unknown as HTMLElement;
}

type FakeTransformControls = {
  object: Object3D | undefined;
  helper: Object3D;
  listeners: Map<string, Set<(event: Record<string, unknown>) => void>>;
  translationSnap: number | null;
  rotationSnap: number | null;
  scaleSnap: number | null;
  axis: string | null;
  setTranslationSnap: ReturnType<typeof vi.fn>;
  setRotationSnap: ReturnType<typeof vi.fn>;
  setScaleSnap: ReturnType<typeof vi.fn>;
  emit: (type: string, event?: Record<string, unknown>) => void;
};

type FakeView = {
  addEventListener(type: string, listener: (event: Record<string, unknown>) => void): void;
  dispatch(type: string, event: Record<string, unknown>): void;
  removeEventListener(type: string, listener: (event: Record<string, unknown>) => void): void;
};
