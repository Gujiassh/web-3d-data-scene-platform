import { readFile } from "node:fs/promises";

import { parseSceneDocument, type SceneDocument } from "@web3d/document";
import type { Object3D } from "three";
import { Raycaster } from "three";
import type * as ThreeModule from "three";
import { beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";

import {
  InspectGltfError,
  MAX_GLTF_INSPECTION_BYTES,
  createAuthoringSceneViewer,
  inspectGltf,
  type GltfInspectionSummary,
} from "../index";
import type { AuthoringViewerEvent } from "../types";

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
  const sceneUrl = new URL("../../../../assets/factory/public/m0-scene.json", import.meta.url);
  const assetUrl = new URL(
    "../../../../assets/factory/public/m0-factory-cell.glb",
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

function selectionEvents(events: readonly AuthoringViewerEvent[]) {
  return events.filter(
    (event): event is Extract<AuthoringViewerEvent, { type: "entity-selection-change" }> =>
      event.type === "entity-selection-change",
  );
}

function requiredControls(): FakeTransformControls {
  const controls = runtime.transformControls.at(-1);
  if (controls === undefined) throw new Error("TransformControls were not created.");
  return controls;
}

function fakeCanvas() {
  const listeners = new Map<string, Set<(event: Record<string, number>) => void>>();
  return {
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
    setAttribute(): void {},
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
