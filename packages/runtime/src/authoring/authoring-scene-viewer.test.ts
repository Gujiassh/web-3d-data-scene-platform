import { readFile } from "node:fs/promises";

import { parseSceneDocument, type SceneDocument } from "@web3d/document";
import type { Material, Object3D } from "three";
import { Color, Mesh, Raycaster } from "three";
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

const runtime = vi.hoisted(() => ({
  canvases: [] as ReturnType<typeof fakeCanvas>[],
  dispose: vi.fn(),
  frames: [] as FrameRequestCallback[],
  reportError: vi.fn(),
  transformControls: [] as FakeTransformControls[],
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

  return { ...actual, WebGLRenderer: FakeWebGLRenderer };
});

vi.mock("three/addons/controls/OrbitControls.js", async () => {
  const { Vector3 } = await import("three");
  return {
    OrbitControls: class FakeOrbitControls {
      readonly target = new Vector3();
      enableDamping = false;
      enabled = true;

      addEventListener(): void {}
      dispose(): void {}
      removeEventListener(): void {}
      update(): void {}
    },
  };
});

vi.mock("three/addons/controls/TransformControls.js", async () => {
  const { Object3D } = await import("three");
  class MockTransformControls {
    readonly helper = new Object3D();
    readonly listeners = new Map<string, Set<(event: Record<string, unknown>) => void>>();
    mode = "translate";
    object: Object3D | undefined;

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
    runtime.transformControls.length = 0;
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

  it("reverts an in-progress preview when the transform tool changes", async () => {
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
    controls.emit("mouseDown", { mode: "translate" });
    if (controls.object === undefined) throw new Error("TransformControls did not attach.");
    controls.object.position.x = 4;
    controls.object.updateMatrixWorld(true);
    controls.emit("objectChange");

    viewer.setTool("rotate");

    expect(controls.object?.position.x).toBe(0);
    expect(events.filter((event) => event.type === "transform-preview")).toHaveLength(1);
    expect(events.filter((event) => event.type === "transform-commit")).toHaveLength(0);
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

function withoutEntities(scene: SceneDocument): SceneDocument {
  return {
    ...scene,
    entities: [],
    targets: [],
    bindings: [],
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

function fakeCanvas() {
  const attributes: Record<string, string> = {};
  const listeners = new Map<string, Set<(event: Record<string, number>) => void>>();
  return {
    attributes,
    dataset: {} as Record<string, string>,
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
  emit: (type: string, event?: Record<string, unknown>) => void;
};
