// @vitest-environment happy-dom

import {
  BoxGeometry,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  PerspectiveCamera,
  Scene,
} from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  HotspotOverlay,
  type HotspotOverlayActivation,
  type HotspotOverlayMarker,
} from "./hotspot-overlay";

describe("HotspotOverlay", () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("grows geometrically beyond the calibrated load without truncating stable IDs", () => {
    const fixture = overlayFixture({ initialCapacity: 2 });
    const initialMesh = fixture.scene.children.find((child) => child instanceof InstancedMesh)!;
    const initialMeshDispose = vi.spyOn(initialMesh, "dispose");
    const markers = Array.from({ length: 257 }, (_, index) =>
      marker(
        `marker-${String(index).padStart(3, "0")}`,
        index,
        `Title ${String(index).padStart(3, "0")}`,
      ),
    );

    fixture.overlay.setMarkers(markers);
    const result = fixture.overlay.updateNow();

    expect(fixture.overlay.capacity).toBe(512);
    expect(result).toEqual({ markerCount: 257, proxyCount: 257 });
    expect(fixture.overlay.instanceIds).toHaveLength(257);
    expect(fixture.overlay.instanceIds[0]).toBe("marker-000");
    expect(fixture.container.querySelectorAll("button")).toHaveLength(257);
    const meshes = fixture.scene.children.filter((child) => child instanceof InstancedMesh);
    expect(meshes).toHaveLength(1);
    expect(meshes[0]).not.toBe(initialMesh);
    expect(meshes[0]?.geometry).toBe(initialMesh.geometry);
    expect(meshes[0]?.material).toBe(initialMesh.material);
    expect(initialMesh.parent).toBeNull();
    expect(initialMeshDispose).toHaveBeenCalledOnce();
    fixture.overlay.dispose();
  });

  it("sorts proxies by title then ID, preserves overlap focus stops, and keeps pick activation parity", () => {
    const activations: HotspotOverlayActivation[] = [];
    const fixture = overlayFixture({ onActivate: (activation) => activations.push(activation) });
    fixture.overlay.setMarkers([
      marker("z-id", 0, "Zulu"),
      marker("c-id", 0, "Alpha"),
      marker("a-id", 0, "Alpha"),
    ]);
    fixture.overlay.updateNow();

    expect(fixture.overlay.visibleProxyIds).toEqual(["a-id", "c-id", "z-id"]);
    expect(fixture.overlay.instanceIds).toEqual(["a-id", "c-id", "z-id"]);
    const buttons = proxyButtons(fixture.container);
    expect(buttons.map((button) => button.dataset["hotspotId"])).toEqual(["a-id", "c-id", "z-id"]);
    expect(buttons.map((button) => button.tabIndex)).toEqual([0, -1, -1]);

    buttons[0]!.focus();
    buttons[0]!.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "ArrowDown" }));
    expect(document.activeElement).toBe(buttons[1]);
    buttons[1]!.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "End" }));
    expect(document.activeElement).toBe(buttons[2]);
    buttons[2]!.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Home" }));
    expect(document.activeElement).toBe(buttons[0]);

    expect(fixture.overlay.activateAt(410, 320)).toBe("a-id");
    buttons[1]!.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 0 }));
    buttons[2]!.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
    expect(activations).toEqual([
      { id: "a-id", origin: "marker-pointer" },
      { id: "c-id", origin: "proxy-keyboard" },
      { id: "z-id", origin: "proxy-pointer" },
    ]);
    fixture.overlay.dispose();
  });

  it("focuses only visible proxies while preserving the controlled roving order", () => {
    const fixture = overlayFixture();
    fixture.overlay.setMarkers([marker("alpha", 0, "Alpha"), marker("beta", 1, "Beta")]);
    fixture.overlay.setOrder(["beta", "alpha"]);
    fixture.overlay.updateNow();

    expect(fixture.overlay.focusProxy("beta")).toBe(true);
    expect(document.activeElement).toBe(proxy(fixture.container, "beta"));
    expect(proxy(fixture.container, "beta").tabIndex).toBe(0);
    expect(proxy(fixture.container, "alpha").tabIndex).toBe(-1);
    expect(fixture.overlay.focusProxy("missing")).toBe(false);

    fixture.overlay.setMarkers([{ ...marker("beta"), worldPosition: [100, 0, 0] }]);
    fixture.overlay.updateNow();
    expect(fixture.overlay.focusProxy("beta")).toBe(false);
    fixture.overlay.dispose();
  });

  it("renders a bounded non-color-only reticle and clears it synchronously", () => {
    const fixture = overlayFixture();
    fixture.overlay.setReticle({ clientX: 410, clientY: 320, status: "pending" });
    const reticle = fixture.container.querySelector<HTMLElement>(".web3d-hotspot-reticle")!;
    expect(reticle.hidden).toBe(false);
    expect(reticle.dataset["status"]).toBe("pending");
    expect(reticle.textContent).toBe("·");
    expect(reticle.style.transform).toContain("400px, 300px");

    fixture.overlay.setReticle({
      clientX: 411,
      clientY: 321,
      status: "rejected",
      reason: "unsupported",
    });
    expect(reticle.dataset["status"]).toBe("rejected");
    expect(reticle.style.borderStyle).toBe("dashed");
    expect(reticle.textContent).toBe("x");

    fixture.overlay.setReticle(null);
    expect(reticle.hidden).toBe(true);
    expect(reticle.textContent).toBe("");
    fixture.overlay.dispose();
  });

  it("subdues a direct-drag marker, removes it from picking, and suppresses one pointer click", () => {
    const activations: HotspotOverlayActivation[] = [];
    const pointerStarts: string[] = [];
    const fixture = overlayFixture({
      onActivate: (activation) => activations.push(activation),
      onPointerStart: (start) => pointerStarts.push(start.id),
    });
    fixture.overlay.setMarkers([marker("dragged"), marker("other", 1)]);
    fixture.overlay.updateNow();
    const button = proxy(fixture.container, "dragged");

    button.dispatchEvent(pointerEvent("pointerdown", 410, 320, 1));
    expect(pointerStarts).toEqual(["dragged"]);
    fixture.overlay.setDirectDrag("dragged");
    fixture.overlay.updateNow();
    expect(button.style.opacity).toBe("0.45");
    expect(button.style.pointerEvents).toBe("none");
    expect(fixture.overlay.pick(410, 320)).not.toBe("dragged");

    fixture.overlay.setDirectDrag(null, true);
    fixture.overlay.updateNow();
    button.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
    expect(activations).toEqual([]);
    button.dispatchEvent(pointerEvent("pointerdown", 410, 320, 2));
    button.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
    expect(activations).toEqual([{ id: "dragged", origin: "proxy-pointer" }]);
    fixture.overlay.dispose();
  });

  it("keeps injected callbacks untouched and wraps receiver-sensitive native RAF functions", () => {
    const receiver = globalThis;
    const callbacks = new Map<number, FrameRequestCallback>();
    let nextHandle = 1;
    const request = vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation(function (
      this: typeof globalThis,
      callback,
    ) {
      if (this !== receiver) throw new TypeError("Illegal invocation");
      const handle = nextHandle++;
      callbacks.set(handle, callback);
      return handle;
    });
    const cancel = vi.spyOn(globalThis, "cancelAnimationFrame").mockImplementation(function (
      this: typeof globalThis,
      handle,
    ) {
      if (this !== receiver) throw new TypeError("Illegal invocation");
      callbacks.delete(handle);
    });

    const nativeFixture = overlayFixture();
    expect(() => nativeFixture.overlay.setMarkers([marker("native")])).not.toThrow();
    expect(request).toHaveBeenCalledOnce();
    nativeFixture.overlay.dispose();
    expect(cancel).toHaveBeenCalledOnce();

    const scheduler = new FakeFrameScheduler();
    const injectedFixture = overlayFixture({
      requestFrame: scheduler.request,
      cancelFrame: scheduler.cancel,
    });
    injectedFixture.overlay.setMarkers([marker("injected")]);
    expect(scheduler.request).toHaveBeenCalledOnce();
    injectedFixture.overlay.dispose();
    expect(scheduler.cancel).toHaveBeenCalledOnce();
  });

  it("keeps non-interactive ghosts out of proxies, roving order, and pick activation", () => {
    const activations: HotspotOverlayActivation[] = [];
    const fixture = overlayFixture({ onActivate: (activation) => activations.push(activation) });
    fixture.overlay.setMarkers([
      marker("persisted-b", 0, "Beta"),
      { ...marker("ghost", 0, "A ghost"), interactive: false },
      marker("persisted-a", 0, "Alpha"),
    ]);

    expect(fixture.overlay.updateNow()).toEqual({ markerCount: 3, proxyCount: 2 });
    expect(fixture.overlay.instanceIds).toEqual(["ghost", "persisted-a", "persisted-b"]);
    expect(fixture.overlay.visibleProxyIds).toEqual(["persisted-a", "persisted-b"]);
    expect(fixture.container.querySelector('[data-hotspot-id="ghost"]')).toBeNull();

    const buttons = proxyButtons(fixture.container);
    buttons[0]!.focus();
    buttons[0]!.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "ArrowDown" }));
    expect(document.activeElement).toBe(buttons[1]);
    expect(fixture.overlay.activateAt(410, 320)).toBe("persisted-a");
    expect(activations).toEqual([{ id: "persisted-a", origin: "marker-pointer" }]);
    fixture.overlay.dispose();
  });

  it("applies controlled known-ID order, retains buttons, and deterministically sorts the tail", () => {
    const fixture = overlayFixture();
    fixture.overlay.setMarkers([
      marker("z-id", 0, "Zulu"),
      marker("c-id", 0, "Charlie"),
      marker("a-id", 0, "Alpha"),
    ]);
    fixture.overlay.updateNow();
    const retained = new Map(
      proxyButtons(fixture.container).map((button) => [button.dataset["hotspotId"]!, button]),
    );

    fixture.overlay.setOrder(["z-id", "unknown", "z-id", ""]);
    fixture.overlay.updateNow();

    const buttons = proxyButtons(fixture.container);
    expect(buttons.map((button) => button.dataset["hotspotId"])).toEqual(["z-id", "a-id", "c-id"]);
    expect(buttons.every((button) => retained.get(button.dataset["hotspotId"]!) === button)).toBe(
      true,
    );
    expect(fixture.overlay.visibleProxyIds).toEqual(["z-id", "a-id", "c-id"]);
    expect(fixture.overlay.instanceIds).toEqual(["a-id", "c-id", "z-id"]);
    buttons[0]!.focus();
    buttons[0]!.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "ArrowDown" }));
    expect(document.activeElement).toBe(buttons[1]);
    fixture.overlay.dispose();
  });

  it("omits off-frustum markers and applies only opaque visible depth-writing occlusion", () => {
    const fixture = overlayFixture();
    fixture.overlay.setMarkers([
      marker("center"),
      { ...marker("offscreen"), worldPosition: [100, 0, 0] },
    ]);
    const geometry = new BoxGeometry(0.6, 0.6, 0.2);
    const occluder: Mesh<BoxGeometry, MeshPhysicalMaterial | MeshBasicMaterial> = new Mesh(
      geometry,
      new MeshPhysicalMaterial(),
    );
    occluder.position.z = 1;
    fixture.occlusionRoot.add(occluder);

    expect(fixture.overlay.updateNow()).toEqual({ markerCount: 0, proxyCount: 0 });
    expect(fixture.overlay.pick(400, 300)).toBeNull();

    const policies: Array<(material: MeshPhysicalMaterial) => void> = [
      (material) => {
        material.transparent = true;
      },
      (material) => {
        material.transmission = 0.5;
      },
      (material) => {
        material.depthWrite = false;
      },
      (material) => {
        material.opacity = 0;
      },
      (material) => {
        material.visible = false;
      },
    ];
    for (const configure of policies) {
      const previous = occluder.material;
      const material = new MeshPhysicalMaterial();
      configure(material);
      occluder.material = material;
      previous.dispose();
      expect(fixture.overlay.updateNow()).toEqual({ markerCount: 1, proxyCount: 1 });
      expect(fixture.overlay.pick(410, 320)).toBe("center");
    }

    const previous = occluder.material;
    occluder.material = new MeshBasicMaterial();
    previous.dispose();
    occluder.visible = false;
    expect(fixture.overlay.updateNow()).toEqual({ markerCount: 1, proxyCount: 1 });
    occluder.visible = true;
    fixture.occlusionRoot.visible = false;
    expect(fixture.overlay.updateNow()).toEqual({ markerCount: 1, proxyCount: 1 });

    fixture.overlay.dispose();
    geometry.dispose();
    occluder.material.dispose();
  });

  it("reconciles proxy identity without recreating retained buttons", () => {
    const fixture = overlayFixture();
    fixture.overlay.setMarkers([marker("b", -0.5, "Beta"), marker("a", 0.5, "Alpha")]);
    fixture.overlay.updateNow();
    const retained = proxy(fixture.container, "a");
    retained.focus();

    fixture.overlay.setMarkers([marker("a", 0.25, "Zulu"), marker("c", -0.25, "Gamma")]);
    fixture.overlay.updateNow();

    expect(proxy(fixture.container, "a")).toBe(retained);
    expect(retained.getAttribute("aria-label")).toBe("Zulu");
    expect(fixture.container.querySelector('[data-hotspot-id="b"]')).toBeNull();
    expect(document.activeElement).toBe(retained);
    expect(proxyButtons(fixture.container).map((button) => button.dataset["hotspotId"])).toEqual([
      "c",
      "a",
    ]);
    expect(fixture.overlay.visibleProxyIds).toEqual(["c", "a"]);
    fixture.overlay.dispose();
  });

  it("updates stable marker frames without reconciling DOM structure", () => {
    const fixture = overlayFixture();
    const markers = Array.from({ length: 200 }, (_, index) =>
      marker(`marker-${String(index).padStart(3, "0")}`, index),
    );
    fixture.overlay.setMarkers(markers);
    fixture.overlay.updateNow();
    const layer = fixture.container.querySelector<HTMLElement>(".web3d-hotspot-overlay")!;
    const insertBefore = vi.spyOn(layer, "insertBefore");
    const retained = proxy(fixture.container, "marker-000");
    const before = retained.style.transform;

    fixture.overlay.updateMarkerFrames(
      markers.map((value, index) => ({
        ...value,
        worldPosition: [0.25 + index * 0.001, 0, 0] as const,
      })),
    );
    fixture.overlay.updateNow();

    expect(insertBefore).not.toHaveBeenCalled();
    expect(proxy(fixture.container, "marker-000")).toBe(retained);
    expect(retained.style.transform).not.toBe(before);
    fixture.overlay.dispose();
  });

  it("exposes client viewport anchors from the latest completed projection only", () => {
    const fixture = overlayFixture();
    fixture.overlay.setMarkers([marker("center")]);
    fixture.overlay.updateNow();

    expect(fixture.overlay.screenAnchor("center")).toEqual({ clientX: 410, clientY: 320 });
    expect(fixture.overlay.screenAnchor("missing")).toBeNull();

    fixture.overlay.updateMarkerFrames([{ ...marker("center"), worldPosition: [100, 0, 0] }]);
    fixture.overlay.updateNow();
    expect(fixture.overlay.screenAnchor("center")).toBeNull();

    fixture.overlay.updateMarkerFrames([marker("center")]);
    fixture.camera.position.x = 1;
    fixture.camera.updateMatrixWorld(true);
    fixture.overlay.updateNow();
    const moved = fixture.overlay.screenAnchor("center");
    expect(moved).not.toBeNull();
    expect(moved?.clientX).not.toBe(410);

    vi.mocked(fixture.container.getBoundingClientRect).mockReturnValue({
      bottom: 340,
      height: 300,
      left: 50,
      right: 450,
      top: 40,
      width: 400,
      x: 50,
      y: 40,
      toJSON: () => ({}),
    });
    fixture.overlay.updateNow();
    expect(fixture.overlay.screenAnchor("center")).not.toEqual(moved);

    fixture.overlay.dispose();
  });

  it("reacts to reduced-motion preference without positional transitions", () => {
    const query = new FakeMediaQueryList(true);
    const fixture = overlayFixture({ reducedMotionQuery: query });
    fixture.overlay.setMarkers([marker("a")]);
    fixture.overlay.updateNow();
    const layer = fixture.container.querySelector<HTMLElement>(".web3d-hotspot-overlay")!;
    const button = proxy(fixture.container, "a");

    expect(fixture.overlay.reducedMotion).toBe(true);
    expect(layer.dataset["reducedMotion"]).toBe("true");
    expect(button.style.transition).toBe("none");
    expect(button.style.transform).not.toContain("transition");

    query.setMatches(false);
    expect(layer.dataset["reducedMotion"]).toBe("false");
    expect(button.style.transition).toBe("outline-color 100ms ease-out");
    fixture.overlay.dispose();
    expect(query.removeEventListener).toHaveBeenCalledWith("change", expect.any(Function));
  });

  it("disposes pending RAF, listeners, DOM and Three resources exactly once", () => {
    const scheduler = new FakeFrameScheduler();
    const query = new FakeMediaQueryList(false);
    const activation = vi.fn();
    const fixture = overlayFixture({
      onActivate: activation,
      requestFrame: scheduler.request,
      cancelFrame: scheduler.cancel,
      reducedMotionQuery: query,
    });
    const mesh = fixture.scene.children.find((child) => child instanceof InstancedMesh)!;
    const geometryDispose = vi.spyOn(mesh.geometry, "dispose");
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const materialDispose = vi.spyOn(materials[0]!, "dispose");
    const meshDispose = vi.spyOn(mesh, "dispose");
    const layer = fixture.container.querySelector<HTMLElement>(".web3d-hotspot-overlay")!;
    const removeListener = vi.spyOn(layer, "removeEventListener");

    fixture.overlay.setMarkers([marker("a")]);
    fixture.overlay.invalidate();
    expect(scheduler.pendingCount).toBe(1);
    const button = proxy(fixture.container, "a");

    fixture.overlay.dispose();
    fixture.overlay.dispose();

    expect(scheduler.pendingCount).toBe(0);
    expect(scheduler.cancel).toHaveBeenCalledOnce();
    expect(removeListener.mock.calls.map(([type]) => type)).toEqual([
      "click",
      "pointerdown",
      "focusin",
      "keydown",
    ]);
    expect(query.removeEventListener).toHaveBeenCalledOnce();
    expect(fixture.container.querySelector(".web3d-hotspot-overlay")).toBeNull();
    expect(mesh.parent).toBeNull();
    expect(meshDispose).toHaveBeenCalledOnce();
    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
    button.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
    expect(activation).not.toHaveBeenCalled();
    expect(() => fixture.overlay.setMarkers([])).toThrow("Hotspot overlay is disposed.");
  });

  it("rejects duplicate or invalid marker inputs atomically", () => {
    const fixture = overlayFixture();
    fixture.overlay.setMarkers([marker("current")]);
    fixture.overlay.updateNow();

    expect(() => fixture.overlay.setMarkers([marker("same"), marker("same")])).toThrow(
      "Duplicate hotspot marker ID same.",
    );
    expect(() =>
      fixture.overlay.setMarkers([{ ...marker("bad"), worldPosition: [Number.NaN, 0, 0] }]),
    ).toThrow("Hotspot marker bad position must contain finite values.");
    expect(() =>
      fixture.overlay.setMarkers([{ ...marker("bad"), worldNormal: [0, 0, 0] }]),
    ).toThrow("Hotspot marker bad normal is zero.");
    expect(fixture.overlay.visibleProxyIds).toEqual(["current"]);
    fixture.overlay.dispose();
  });

  it("tracks camera layers for both marker picking and occlusion", () => {
    const fixture = overlayFixture();
    fixture.camera.layers.set(2);
    const geometry = new BoxGeometry(0.6, 0.6, 0.2);
    const occluder = new Mesh(geometry, new MeshBasicMaterial());
    occluder.position.z = 1;
    occluder.layers.set(2);
    fixture.occlusionRoot.add(occluder);
    fixture.overlay.setMarkers([marker("layered")]);

    expect(fixture.overlay.updateNow()).toEqual({ markerCount: 0, proxyCount: 0 });
    occluder.layers.set(0);
    expect(fixture.overlay.updateNow()).toEqual({ markerCount: 1, proxyCount: 1 });
    expect(fixture.overlay.pick(410, 320)).toBe("layered");

    fixture.overlay.dispose();
    geometry.dispose();
    occluder.material.dispose();
  });
});

interface OverlayFixtureOptions {
  readonly initialCapacity?: number;
  readonly onActivate?: (activation: HotspotOverlayActivation) => void;
  readonly onPointerStart?: ConstructorParameters<typeof HotspotOverlay>[0]["onPointerStart"];
  readonly requestFrame?: (callback: FrameRequestCallback) => number;
  readonly cancelFrame?: (handle: number) => void;
  readonly reducedMotionQuery?: MediaQueryList | null;
}

function overlayFixture(options: OverlayFixtureOptions = {}) {
  const scene = new Scene();
  const occlusionRoot = new Group();
  scene.add(occlusionRoot);
  const camera = new PerspectiveCamera(60, 4 / 3, 0.1, 100);
  camera.position.set(0, 0, 5);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  const container = document.createElement("div");
  container.style.position = "relative";
  vi.spyOn(container, "getBoundingClientRect").mockReturnValue({
    bottom: 620,
    height: 600,
    left: 10,
    right: 810,
    top: 20,
    width: 800,
    x: 10,
    y: 20,
    toJSON: () => ({}),
  });
  document.body.append(container);
  const overlay = new HotspotOverlay({
    scene,
    container,
    camera,
    occlusionRoot,
    ...(options.initialCapacity === undefined ? {} : { initialCapacity: options.initialCapacity }),
    ...(options.onActivate === undefined ? {} : { onActivate: options.onActivate }),
    ...(options.onPointerStart === undefined ? {} : { onPointerStart: options.onPointerStart }),
    ...(options.requestFrame === undefined ? {} : { requestFrame: options.requestFrame }),
    ...(options.cancelFrame === undefined ? {} : { cancelFrame: options.cancelFrame }),
    ...(options.reducedMotionQuery === undefined
      ? {}
      : { reducedMotionQuery: options.reducedMotionQuery }),
  });
  return { camera, container, occlusionRoot, overlay, scene };
}

function pointerEvent(
  type: "pointerdown" | "pointermove" | "pointerup",
  clientX: number,
  clientY: number,
  pointerId: number,
): PointerEvent {
  const event = new Event(type, { bubbles: true }) as PointerEvent;
  Object.assign(event, { button: 0, clientX, clientY, isPrimary: true, pointerId });
  return event;
}

function marker(id: string, index = 0, title = id): HotspotOverlayMarker {
  return {
    id,
    title,
    visible: true,
    worldPosition: [index * 0.001, 0, 0],
    worldNormal: [0, 0, 1],
  };
}

function proxyButtons(container: HTMLElement): HTMLButtonElement[] {
  return [...container.querySelectorAll<HTMLButtonElement>(".web3d-hotspot-proxy")];
}

function proxy(container: HTMLElement, id: string): HTMLButtonElement {
  const button = container.querySelector<HTMLButtonElement>(`[data-hotspot-id="${id}"]`);
  if (button === null) throw new Error(`Missing proxy ${id}.`);
  return button;
}

class FakeFrameScheduler {
  readonly #callbacks = new Map<number, FrameRequestCallback>();
  #next = 1;

  readonly request = vi.fn((callback: FrameRequestCallback): number => {
    const handle = this.#next++;
    this.#callbacks.set(handle, callback);
    return handle;
  });

  readonly cancel = vi.fn((handle: number): void => {
    this.#callbacks.delete(handle);
  });

  get pendingCount(): number {
    return this.#callbacks.size;
  }
}

class FakeMediaQueryList {
  readonly media = "(prefers-reduced-motion: reduce)";
  readonly onchange = null;
  readonly addEventListener = vi.fn(
    (type: string, listener: EventListenerOrEventListenerObject) => {
      if (type === "change") this.#listeners.add(listener);
    },
  );
  readonly removeEventListener = vi.fn(
    (type: string, listener: EventListenerOrEventListenerObject) => {
      if (type === "change") this.#listeners.delete(listener);
    },
  );
  readonly addListener = vi.fn();
  readonly removeListener = vi.fn();
  readonly dispatchEvent = vi.fn(() => true);
  readonly #listeners = new Set<EventListenerOrEventListenerObject>();
  matches: boolean;

  constructor(matches: boolean) {
    this.matches = matches;
  }

  setMatches(matches: boolean): void {
    this.matches = matches;
    const event = new Event("change");
    for (const listener of this.#listeners) {
      if (typeof listener === "function") listener(event);
      else listener.handleEvent(event);
    }
  }
}
