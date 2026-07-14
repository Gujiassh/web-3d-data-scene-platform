import { readFile } from "node:fs/promises";

import { parseSceneDocument, type SceneDocument } from "@web3d/document";
import { BufferGeometry } from "three";
import type * as ThreeModule from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DataAdapter } from "../types";

const runtime = vi.hoisted(() => ({ dispose: vi.fn(), reportError: vi.fn() }));

vi.mock("three", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof ThreeModule;
  class FakeWebGLRenderer {
    readonly domElement = fakeCanvas();
    readonly info = { render: { calls: 0, triangles: 0 } };

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

      addEventListener(): void {}
      dispose(): void {}
      removeEventListener(): void {}
      update(): void {}
    },
  };
});

import { createSceneViewer } from "./scene-viewer";

const sceneUrl = new URL("../../../../assets/factory/public/m0-scene.json", import.meta.url);
const assetUrl = new URL("../../../../assets/factory/public/m0-factory-cell.glb", import.meta.url);

describe("SceneViewer lifecycle", () => {
  beforeEach(() => {
    runtime.dispose.mockClear();
    runtime.reportError.mockClear();
    vi.stubGlobal(
      "ResizeObserver",
      class FakeResizeObserver {
        disconnect(): void {}
        observe(): void {}
      },
    );
    vi.stubGlobal("requestAnimationFrame", () => 1);
    vi.stubGlobal("cancelAnimationFrame", () => undefined);
    vi.stubGlobal("reportError", runtime.reportError);
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

  it("finishes an adapter commit before a newer failed load", async () => {
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
    await replacement;
    await expect(failed).rejects.toMatchObject({
      diagnostic: { code: "ASSET_HASH_MISMATCH" },
    });

    expect(viewer.getSnapshot()).toMatchObject({
      documentId: scene.id,
      lifecycle: "ready",
      revision: 2,
    });
    expect(active.start).toHaveBeenCalledTimes(2);
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
  };
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
  return {
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
