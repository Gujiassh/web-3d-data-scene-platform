import {
  CircleGeometry,
  Color,
  DoubleSide,
  DynamicDrawUsage,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Quaternion,
  Raycaster,
  Vector2,
  Vector3,
  type Intersection,
  type Material,
  type Object3D,
  type OrthographicCamera,
  type Scene,
} from "three";

import type { HotspotScreenAnchor } from "./hotspot-view-state";
import type { HotspotReticleState } from "./hotspot-interaction-controller";

const DEFAULT_INITIAL_CAPACITY = 16;
const DEFAULT_MARKER_DIAMETER_CSS_PIXELS = 18;
const MIN_MARKER_DIAMETER_CSS_PIXELS = 8;
const MAX_MARKER_DIAMETER_CSS_PIXELS = 48;
const OCCLUSION_EPSILON = 0.001;
const MARKER_COLOR = new Color("#00B884");
const SUBDUED_MARKER_COLOR = new Color("#687773");

export type HotspotOverlayCamera = PerspectiveCamera | OrthographicCamera;
export type HotspotActivationOrigin = "marker-pointer" | "proxy-keyboard" | "proxy-pointer";

export interface HotspotOverlayMarker {
  readonly id: string;
  readonly title: string;
  readonly visible: boolean;
  readonly worldPosition: readonly [number, number, number];
  readonly worldNormal: readonly [number, number, number];
  readonly interactive?: boolean;
}

export interface HotspotOverlayActivation {
  readonly id: string;
  readonly origin: HotspotActivationOrigin;
}

export interface HotspotOverlayPointerStart {
  readonly id: string;
  readonly event: PointerEvent;
  readonly captureTarget: Element;
}

export interface HotspotOverlayUpdateResult {
  readonly markerCount: number;
  readonly proxyCount: number;
}

export interface HotspotOverlayOptions {
  readonly scene: Scene;
  readonly container: HTMLElement;
  readonly camera: HotspotOverlayCamera;
  readonly occlusionRoot: Object3D;
  readonly onActivate?: (activation: HotspotOverlayActivation) => void;
  readonly onPointerStart?: (start: HotspotOverlayPointerStart) => void;
  readonly initialCapacity?: number;
  readonly markerDiameterCssPixels?: number;
  readonly requestFrame?: (callback: FrameRequestCallback) => number;
  readonly cancelFrame?: (handle: number) => void;
  readonly reducedMotionQuery?: MediaQueryList | null;
}

interface StoredMarker {
  readonly id: string;
  readonly title: string;
  readonly position: Vector3;
  readonly normal: Vector3;
  readonly interactive: boolean;
}

/** Framework-neutral WebGL marker batch and its accessible DOM activation layer. */
export class HotspotOverlay {
  readonly #scene: Scene;
  readonly #container: HTMLElement;
  readonly #layer: HTMLDivElement;
  readonly #reticle: HTMLDivElement;
  readonly #geometry = new CircleGeometry(0.5, 18);
  readonly #material = new MeshBasicMaterial({
    color: "#FFFFFF",
    depthTest: true,
    depthWrite: false,
    side: DoubleSide,
    toneMapped: false,
  });
  readonly #raycaster = new Raycaster();
  readonly #pointer = new Vector2();
  readonly #projected = new Vector3();
  readonly #viewPosition = new Vector3();
  readonly #cameraPosition = new Vector3();
  readonly #cameraQuaternion = new Quaternion();
  readonly #visualPosition = new Vector3();
  readonly #scale = new Vector3();
  readonly #matrix = new Matrix4();
  readonly #direction = new Vector3();
  readonly #buttons = new Map<string, HTMLButtonElement>();
  readonly #instanceIds: string[] = [];
  readonly #interactiveInstanceIds = new Set<string>();
  readonly #visibleProxyIds: string[] = [];
  readonly #screenAnchors = new Map<string, HotspotScreenAnchor>();
  readonly #onActivate: ((activation: HotspotOverlayActivation) => void) | undefined;
  readonly #onPointerStart: ((start: HotspotOverlayPointerStart) => void) | undefined;
  readonly #markerDiameterCssPixels: number;
  readonly #requestFrame: (callback: FrameRequestCallback) => number;
  readonly #cancelFrame: (handle: number) => void;
  readonly #reducedMotionQuery: MediaQueryList | null;
  #camera: HotspotOverlayCamera;
  #occlusionRoot: Object3D;
  #mesh: InstancedMesh;
  #capacity: number;
  #markers: readonly StoredMarker[] = [];
  #orderedIds: readonly string[] = [];
  #subduedId: string | null = null;
  #suppressedClickId: string | null = null;
  #frame: number | null = null;
  #disposed = false;

  constructor(options: HotspotOverlayOptions) {
    this.#scene = options.scene;
    this.#container = options.container;
    this.#camera = options.camera;
    this.#occlusionRoot = options.occlusionRoot;
    this.#onActivate = options.onActivate;
    this.#onPointerStart = options.onPointerStart;
    this.#capacity = validInitialCapacity(options.initialCapacity ?? DEFAULT_INITIAL_CAPACITY);
    this.#markerDiameterCssPixels = validMarkerDiameter(
      options.markerDiameterCssPixels ?? DEFAULT_MARKER_DIAMETER_CSS_PIXELS,
    );
    this.#requestFrame =
      options.requestFrame ?? ((callback) => globalThis.requestAnimationFrame(callback));
    this.#cancelFrame =
      options.cancelFrame ?? ((handle) => globalThis.cancelAnimationFrame(handle));
    this.#reducedMotionQuery =
      options.reducedMotionQuery === undefined
        ? typeof window === "undefined" || typeof window.matchMedia !== "function"
          ? null
          : window.matchMedia("(prefers-reduced-motion: reduce)")
        : options.reducedMotionQuery;

    this.#mesh = this.#createMesh(this.#capacity);
    this.#scene.add(this.#mesh);

    this.#layer = options.container.ownerDocument.createElement("div");
    this.#layer.className = "web3d-hotspot-overlay";
    this.#layer.dataset["hotspotOverlay"] = "true";
    Object.assign(this.#layer.style, {
      inset: "0",
      pointerEvents: "none",
      position: "absolute",
    });
    this.#layer.addEventListener("click", this.#handleClick);
    this.#layer.addEventListener("pointerdown", this.#handlePointerDown);
    this.#layer.addEventListener("focusin", this.#handleFocusIn);
    this.#layer.addEventListener("keydown", this.#handleKeyDown);
    this.#container.append(this.#layer);
    this.#reticle = options.container.ownerDocument.createElement("div");
    this.#reticle.className = "web3d-hotspot-reticle";
    this.#reticle.setAttribute("aria-hidden", "true");
    this.#reticle.hidden = true;
    Object.assign(this.#reticle.style, {
      alignItems: "center",
      background: "rgba(255, 255, 255, 0.9)",
      border: "2px solid #116B55",
      borderRadius: "50%",
      boxSizing: "border-box",
      color: "#116B55",
      display: "flex",
      fontFamily: "monospace",
      fontSize: "12px",
      fontWeight: "700",
      height: "24px",
      justifyContent: "center",
      left: "0",
      lineHeight: "1",
      pointerEvents: "none",
      position: "absolute",
      top: "0",
      transform: "translate3d(-50%, -50%, 0)",
      transition: "none",
      width: "24px",
      zIndex: "2",
    });
    this.#layer.append(this.#reticle);
    this.#reducedMotionQuery?.addEventListener("change", this.#handleReducedMotionChange);
    this.#applyReducedMotionPreference();
  }

  get capacity(): number {
    return this.#capacity;
  }

  get visibleMarkerCount(): number {
    return this.#mesh.count;
  }

  get proxyCount(): number {
    return this.#buttons.size;
  }

  get visibleProxyIds(): readonly string[] {
    return [...this.#visibleProxyIds];
  }

  get instanceIds(): readonly string[] {
    return [...this.#instanceIds];
  }

  get reducedMotion(): boolean {
    return this.#reducedMotionQuery?.matches === true;
  }

  screenAnchor(id: string): HotspotScreenAnchor | null {
    this.#ensureActive();
    const anchor = this.#screenAnchors.get(id);
    return anchor === undefined ? null : { ...anchor };
  }

  setReticle(state: HotspotReticleState | null): void {
    this.#ensureActive();
    if (state === null) {
      this.#reticle.hidden = true;
      this.#reticle.removeAttribute("data-status");
      this.#reticle.textContent = "";
      return;
    }
    const bounds = this.#container.getBoundingClientRect();
    const x = state.clientX - bounds.left;
    const y = state.clientY - bounds.top;
    this.#reticle.hidden = false;
    this.#reticle.dataset["status"] = state.status;
    this.#reticle.style.borderColor = state.status === "rejected" ? "#B42318" : "#116B55";
    this.#reticle.style.borderStyle = state.status === "rejected" ? "dashed" : "solid";
    this.#reticle.style.color = state.status === "rejected" ? "#B42318" : "#116B55";
    this.#reticle.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
    this.#reticle.textContent =
      state.status === "valid" ? "+" : state.status === "rejected" ? "x" : "·";
  }

  setDirectDrag(annotationId: string | null, suppressClick = false): void {
    this.#ensureActive();
    if (suppressClick && this.#subduedId !== null) this.#suppressedClickId = this.#subduedId;
    if (this.#subduedId === annotationId) return;
    this.#subduedId = annotationId;
    this.updateNow();
  }

  setMarkers(markers: readonly HotspotOverlayMarker[]): void {
    this.#ensureActive();
    const next = copyMarkers(markers);
    this.#ensureCapacity(next.length);
    const structureChanged = markerStructureChanged(this.#markers, next);
    this.#markers = next;
    if (structureChanged) this.#reconcileButtons();
    this.invalidate();
  }

  updateMarkerFrames(markers: readonly HotspotOverlayMarker[]): void {
    this.#ensureActive();
    if (markers.length !== this.#markers.length) {
      throw new Error("Hotspot marker frames must match the reconciled marker set.");
    }
    const byId = new Map(this.#markers.map((marker) => [marker.id, marker]));
    for (const marker of markers) {
      const stored = byId.get(marker.id);
      if (stored === undefined) {
        throw new Error("Hotspot marker frames must match the reconciled marker set.");
      }
      const position = finiteVector(marker.worldPosition, `Hotspot marker ${marker.id} position`);
      const normal = finiteVector(marker.worldNormal, `Hotspot marker ${marker.id} normal`);
      if (normal.lengthSq() === 0) throw new Error(`Hotspot marker ${marker.id} normal is zero.`);
      stored.position.copy(position);
      stored.normal.copy(normal.normalize());
      byId.delete(marker.id);
    }
    if (byId.size > 0) {
      throw new Error("Hotspot marker frames must match the reconciled marker set.");
    }
    this.invalidate();
  }

  setOrder(orderedIds: readonly string[]): void {
    this.#ensureActive();
    const nextOrder = copyOrder(orderedIds);
    if (sameStrings(this.#orderedIds, nextOrder)) return;
    this.#orderedIds = nextOrder;
    this.#reconcileButtons();
    this.invalidate();
  }

  setCamera(camera: HotspotOverlayCamera): void {
    this.#ensureActive();
    if (this.#camera === camera) return;
    this.#camera = camera;
    this.invalidate();
  }

  setOcclusionRoot(root: Object3D): void {
    this.#ensureActive();
    if (this.#occlusionRoot === root) return;
    this.#occlusionRoot = root;
    this.invalidate();
  }

  invalidate(): void {
    this.#ensureActive();
    if (this.#frame !== null) return;
    this.#frame = this.#requestFrame(() => {
      this.#frame = null;
      if (!this.#disposed) this.#update();
    });
  }

  updateNow(): HotspotOverlayUpdateResult {
    this.#ensureActive();
    if (this.#frame !== null) {
      this.#cancelFrame(this.#frame);
      this.#frame = null;
    }
    return this.#update();
  }

  pick(clientX: number, clientY: number): string | null {
    this.#ensureActive();
    if (this.#frame !== null) this.updateNow();
    const bounds = this.#container.getBoundingClientRect();
    if (
      bounds.width <= 0 ||
      bounds.height <= 0 ||
      clientX < bounds.left ||
      clientX > bounds.right ||
      clientY < bounds.top ||
      clientY > bounds.bottom
    ) {
      return null;
    }
    this.#pointer.set(
      ((clientX - bounds.left) / bounds.width) * 2 - 1,
      -((clientY - bounds.top) / bounds.height) * 2 + 1,
    );
    this.#raycaster.setFromCamera(this.#pointer, this.#camera);
    this.#mesh.updateMatrixWorld(true);
    for (const hit of this.#raycaster.intersectObject(this.#mesh, false)) {
      if (hit.instanceId === undefined) continue;
      const id = this.#instanceIds[hit.instanceId];
      if (id !== undefined && this.#interactiveInstanceIds.has(id)) return id;
    }
    return null;
  }

  activateAt(clientX: number, clientY: number): string | null {
    const id = this.pick(clientX, clientY);
    if (id !== null) this.#onActivate?.({ id, origin: "marker-pointer" });
    return id;
  }

  focusProxy(id: string): boolean {
    this.#ensureActive();
    const button = this.#buttons.get(id);
    if (button === undefined || button.hidden) return false;
    this.#setRovingTabStop(id);
    button.focus();
    return button.ownerDocument.activeElement === button;
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    if (this.#frame !== null) {
      this.#cancelFrame(this.#frame);
      this.#frame = null;
    }
    this.#reducedMotionQuery?.removeEventListener("change", this.#handleReducedMotionChange);
    this.#layer.removeEventListener("click", this.#handleClick);
    this.#layer.removeEventListener("pointerdown", this.#handlePointerDown);
    this.#layer.removeEventListener("focusin", this.#handleFocusIn);
    this.#layer.removeEventListener("keydown", this.#handleKeyDown);
    this.#buttons.clear();
    this.#reticle.remove();
    this.#layer.remove();
    this.#mesh.removeFromParent();
    this.#mesh.dispose();
    this.#mesh.count = 0;
    this.#geometry.dispose();
    this.#material.dispose();
    this.#markers = [];
    this.#instanceIds.length = 0;
    this.#interactiveInstanceIds.clear();
    this.#visibleProxyIds.length = 0;
    this.#screenAnchors.clear();
    this.#subduedId = null;
    this.#suppressedClickId = null;
  }

  #update(): HotspotOverlayUpdateResult {
    const bounds = this.#container.getBoundingClientRect();
    this.#camera.updateMatrixWorld(true);
    this.#camera.getWorldPosition(this.#cameraPosition);
    this.#camera.getWorldQuaternion(this.#cameraQuaternion);
    this.#mesh.layers.mask = this.#camera.layers.mask;
    this.#occlusionRoot.updateMatrixWorld(true);
    this.#instanceIds.length = 0;
    this.#interactiveInstanceIds.clear();
    this.#visibleProxyIds.length = 0;
    this.#screenAnchors.clear();
    const visibleInteractiveIds = new Set<string>();

    let instanceIndex = 0;
    for (const marker of this.#markers) {
      const button = this.#buttons.get(marker.id);
      this.#projected.copy(marker.position).project(this.#camera);
      const visible =
        bounds.width > 0 &&
        bounds.height > 0 &&
        insideClipSpace(this.#projected) &&
        !this.#isOccluded(marker.position);
      if (button !== undefined) button.hidden = !visible;
      if (!visible) continue;

      const x = (this.#projected.x * 0.5 + 0.5) * bounds.width;
      const y = (-this.#projected.y * 0.5 + 0.5) * bounds.height;
      this.#screenAnchors.set(marker.id, {
        clientX: bounds.left + x,
        clientY: bounds.top + y,
      });
      if (button !== undefined) {
        button.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
      }

      const diameter = this.#worldMarkerDiameter(marker.position, bounds.height);
      this.#visualPosition.copy(marker.position).addScaledVector(marker.normal, diameter * 0.08);
      this.#scale.setScalar(diameter);
      this.#matrix.compose(this.#visualPosition, this.#cameraQuaternion, this.#scale);
      this.#mesh.setMatrixAt(instanceIndex, this.#matrix);
      this.#mesh.setColorAt(
        instanceIndex,
        marker.id === this.#subduedId ? SUBDUED_MARKER_COLOR : MARKER_COLOR,
      );
      this.#instanceIds.push(marker.id);
      if (marker.interactive && marker.id !== this.#subduedId) {
        this.#interactiveInstanceIds.add(marker.id);
        visibleInteractiveIds.add(marker.id);
      }
      instanceIndex += 1;
    }

    this.#mesh.count = instanceIndex;
    this.#mesh.instanceMatrix.needsUpdate = true;
    if (this.#mesh.instanceColor !== null) this.#mesh.instanceColor.needsUpdate = true;
    if (instanceIndex > 0) this.#mesh.computeBoundingSphere();
    this.#mesh.updateMatrixWorld(true);
    this.#visibleProxyIds.push(
      ...orderedInteractiveMarkers(this.#markers, this.#orderedIds)
        .filter((marker) => visibleInteractiveIds.has(marker.id))
        .map((marker) => marker.id),
    );
    this.#syncRovingTabStop();
    for (const [id, button] of this.#buttons) {
      const subdued = id === this.#subduedId;
      button.style.opacity = subdued ? "0.45" : "1";
      button.style.pointerEvents = subdued ? "none" : "auto";
    }
    return { markerCount: instanceIndex, proxyCount: this.#visibleProxyIds.length };
  }

  #isOccluded(position: Vector3): boolean {
    this.#direction.copy(position).sub(this.#cameraPosition);
    const markerDistance = this.#direction.length();
    if (markerDistance <= OCCLUSION_EPSILON) return false;
    this.#direction.multiplyScalar(1 / markerDistance);
    this.#raycaster.set(this.#cameraPosition, this.#direction);
    this.#raycaster.layers.mask = this.#camera.layers.mask;
    this.#raycaster.near = Math.max(0, this.#camera.near);
    this.#raycaster.far = markerDistance;
    const epsilon = Math.max(OCCLUSION_EPSILON, markerDistance * 0.00001);
    return this.#raycaster.intersectObject(this.#occlusionRoot, true).some((hit) => {
      return (
        hit.distance < markerDistance - epsilon &&
        hit.object !== this.#mesh &&
        this.#camera.layers.test(hit.object.layers) &&
        isOpaqueDepthWritingHit(hit)
      );
    });
  }

  #worldMarkerDiameter(position: Vector3, viewportHeight: number): number {
    if (this.#camera instanceof PerspectiveCamera) {
      const viewDepth = Math.abs(
        this.#viewPosition.copy(position).applyMatrix4(this.#camera.matrixWorldInverse).z,
      );
      const effectiveFov = (this.#camera.getEffectiveFOV() * Math.PI) / 180;
      return (
        ((2 * viewDepth * Math.tan(effectiveFov / 2)) / viewportHeight) *
        this.#markerDiameterCssPixels
      );
    }
    return (
      ((this.#camera.top - this.#camera.bottom) / this.#camera.zoom / viewportHeight) *
      this.#markerDiameterCssPixels
    );
  }

  #ensureCapacity(required: number): void {
    if (required <= this.#capacity) return;
    let next = this.#capacity;
    while (next < required) next *= 2;
    const previous = this.#mesh;
    this.#mesh = this.#createMesh(next);
    this.#capacity = next;
    previous.removeFromParent();
    previous.dispose();
    this.#scene.add(this.#mesh);
  }

  #createMesh(capacity: number): InstancedMesh {
    const mesh = new InstancedMesh(this.#geometry, this.#material, capacity);
    mesh.name = "web3d-hotspot-overlay";
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.renderOrder = 4;
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    return mesh;
  }

  #reconcileButtons(): void {
    const activeId = this.#buttonForEventTarget(this.#layer.ownerDocument.activeElement)?.dataset[
      "hotspotId"
    ];
    const interactiveMarkers = orderedInteractiveMarkers(this.#markers, this.#orderedIds);
    const nextIds = new Set(interactiveMarkers.map((marker) => marker.id));
    for (const [id, button] of this.#buttons) {
      if (nextIds.has(id)) continue;
      button.remove();
      this.#buttons.delete(id);
    }
    let interactiveIndex = 0;
    for (const marker of interactiveMarkers) {
      let button = this.#buttons.get(marker.id);
      if (button === undefined) {
        button = this.#container.ownerDocument.createElement("button");
        button.type = "button";
        button.className = "web3d-hotspot-proxy";
        button.dataset["hotspotId"] = marker.id;
        button.tabIndex = -1;
        Object.assign(button.style, {
          background: "transparent",
          border: "0",
          height: `${this.#markerDiameterCssPixels}px`,
          left: "0",
          padding: "0",
          pointerEvents: "auto",
          position: "absolute",
          top: "0",
          width: `${this.#markerDiameterCssPixels}px`,
        });
        this.#buttons.set(marker.id, button);
        button.hidden = true;
      }
      button.setAttribute("aria-label", marker.title);
      const currentAtIndex = this.#layer.children.item(interactiveIndex);
      if (currentAtIndex !== button) this.#layer.insertBefore(button, currentAtIndex);
      interactiveIndex += 1;
    }
    if (activeId !== undefined) {
      this.#buttons.get(activeId)?.focus({ preventScroll: true });
    }
    this.#applyReducedMotionPreference();
  }

  #syncRovingTabStop(): void {
    const active = this.#buttonForEventTarget(this.#layer.ownerDocument.activeElement);
    const activeId = active?.dataset["hotspotId"];
    const current = this.#visibleProxyIds.find((id) => this.#buttons.get(id)?.tabIndex === 0);
    const tabStop =
      activeId !== undefined && this.#visibleProxyIds.includes(activeId)
        ? activeId
        : current !== undefined
          ? current
          : this.#visibleProxyIds[0];
    for (const [id, button] of this.#buttons) button.tabIndex = id === tabStop ? 0 : -1;
    if (active !== null && active.hidden) active.blur();
  }

  #setRovingTabStop(id: string): void {
    for (const [candidateId, button] of this.#buttons) {
      button.tabIndex = candidateId === id && !button.hidden ? 0 : -1;
    }
  }

  #buttonForEventTarget(target: EventTarget | null): HTMLButtonElement | null {
    for (const button of this.#buttons.values()) {
      if (button === target) return button;
    }
    return null;
  }

  readonly #handleClick = (event: MouseEvent): void => {
    const button = this.#buttonForEventTarget(event.target);
    const id = button?.dataset["hotspotId"];
    if (button === null || button.hidden || id === undefined) return;
    if (id === this.#subduedId) return;
    if (id === this.#suppressedClickId && event.detail !== 0) {
      this.#suppressedClickId = null;
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    this.#onActivate?.({
      id,
      origin: event.detail === 0 ? "proxy-keyboard" : "proxy-pointer",
    });
  };

  readonly #handlePointerDown = (event: PointerEvent): void => {
    this.#suppressedClickId = null;
    const button = this.#buttonForEventTarget(event.target);
    const id = button?.dataset["hotspotId"];
    if (button === null || button.hidden || id === undefined) return;
    this.#onPointerStart?.({ id, event, captureTarget: button });
  };

  readonly #handleFocusIn = (event: FocusEvent): void => {
    const id = this.#buttonForEventTarget(event.target)?.dataset["hotspotId"];
    if (id !== undefined) this.#setRovingTabStop(id);
  };

  readonly #handleKeyDown = (event: KeyboardEvent): void => {
    const button = this.#buttonForEventTarget(event.target);
    const id = button?.dataset["hotspotId"];
    if (button === null || button.hidden || id === undefined || this.#visibleProxyIds.length === 0)
      return;
    const currentIndex = this.#visibleProxyIds.indexOf(id);
    let nextIndex: number | null = null;
    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      nextIndex = (currentIndex + 1) % this.#visibleProxyIds.length;
    } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      nextIndex = (currentIndex - 1 + this.#visibleProxyIds.length) % this.#visibleProxyIds.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = this.#visibleProxyIds.length - 1;
    }
    if (nextIndex === null) return;
    event.preventDefault();
    this.focusProxy(this.#visibleProxyIds[nextIndex]!);
  };

  readonly #handleReducedMotionChange = (): void => {
    if (this.#disposed) return;
    this.#applyReducedMotionPreference();
    this.invalidate();
  };

  #applyReducedMotionPreference(): void {
    const reduced = this.reducedMotion;
    this.#layer.dataset["reducedMotion"] = String(reduced);
    for (const button of this.#buttons.values()) {
      button.style.transition = reduced ? "none" : "outline-color 100ms ease-out";
    }
  }

  #ensureActive(): void {
    if (this.#disposed) throw new Error("Hotspot overlay is disposed.");
  }
}

function copyMarkers(markers: readonly HotspotOverlayMarker[]): readonly StoredMarker[] {
  const ids = new Set<string>();
  const copied: StoredMarker[] = [];
  for (const marker of markers) {
    if (marker.id.length === 0) throw new Error("Hotspot marker ID must not be empty.");
    if (ids.has(marker.id)) throw new Error(`Duplicate hotspot marker ID ${marker.id}.`);
    ids.add(marker.id);
    if (marker.title.length === 0) throw new Error(`Hotspot marker ${marker.id} has no title.`);
    if (!marker.visible) continue;
    const position = finiteVector(marker.worldPosition, `Hotspot marker ${marker.id} position`);
    const normal = finiteVector(marker.worldNormal, `Hotspot marker ${marker.id} normal`);
    if (normal.lengthSq() === 0) throw new Error(`Hotspot marker ${marker.id} normal is zero.`);
    copied.push({
      id: marker.id,
      title: marker.title,
      position,
      normal: normal.normalize(),
      interactive: marker.interactive !== false,
    });
  }
  return copied.sort(compareMarkers);
}

function finiteVector(value: readonly [number, number, number], label: string): Vector3 {
  if (!value.every(Number.isFinite)) throw new Error(`${label} must contain finite values.`);
  return new Vector3(value[0], value[1], value[2]);
}

function compareMarkers(left: StoredMarker, right: StoredMarker): number {
  if (left.title < right.title) return -1;
  if (left.title > right.title) return 1;
  if (left.id < right.id) return -1;
  if (left.id > right.id) return 1;
  return 0;
}

function orderedInteractiveMarkers(
  markers: readonly StoredMarker[],
  orderedIds: readonly string[],
): readonly StoredMarker[] {
  const order = new Map(orderedIds.map((id, index) => [id, index]));
  return markers
    .filter((marker) => marker.interactive)
    .sort((left, right) => {
      const leftOrder = order.get(left.id);
      const rightOrder = order.get(right.id);
      if (leftOrder !== undefined || rightOrder !== undefined) {
        if (leftOrder === undefined) return 1;
        if (rightOrder === undefined) return -1;
        return leftOrder - rightOrder;
      }
      return compareMarkers(left, right);
    });
}

function copyOrder(orderedIds: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const id of orderedIds) {
    if (id.length === 0 || seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }
  return result;
}

function markerStructureChanged(
  previous: readonly StoredMarker[],
  next: readonly StoredMarker[],
): boolean {
  if (previous.length !== next.length) return true;
  for (let index = 0; index < previous.length; index += 1) {
    const left = previous[index]!;
    const right = next[index]!;
    if (
      left.id !== right.id ||
      left.title !== right.title ||
      left.interactive !== right.interactive
    )
      return true;
  }
  return false;
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function insideClipSpace(point: Vector3): boolean {
  return (
    point.x >= -1 && point.x <= 1 && point.y >= -1 && point.y <= 1 && point.z >= -1 && point.z <= 1
  );
}

function isOpaqueDepthWritingHit(hit: Intersection<Object3D>): boolean {
  if (!(hit.object instanceof Mesh) || !isEffectivelyVisible(hit.object)) return false;
  const material = hitMaterial(hit);
  if (material === null) return false;
  const transmission =
    (material as Material & { readonly transmission?: number }).transmission ?? 0;
  return (
    material.visible &&
    material.depthWrite &&
    !material.transparent &&
    material.opacity > 0 &&
    transmission <= 0
  );
}

function hitMaterial(hit: Intersection<Object3D>): Material | null {
  if (!(hit.object instanceof Mesh)) return null;
  const material = hit.object.material;
  if (!Array.isArray(material)) return material;
  const materialIndex = hit.face?.materialIndex;
  return materialIndex === undefined ? null : (material[materialIndex] ?? null);
}

function isEffectivelyVisible(object: Object3D): boolean {
  let current: Object3D | null = object;
  while (current !== null) {
    if (!current.visible) return false;
    current = current.parent;
  }
  return true;
}

function validInitialCapacity(value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error("Hotspot overlay initial capacity must be a positive safe integer.");
  }
  return value;
}

function validMarkerDiameter(value: number): number {
  if (
    !Number.isFinite(value) ||
    value < MIN_MARKER_DIAMETER_CSS_PIXELS ||
    value > MAX_MARKER_DIAMETER_CSS_PIXELS
  ) {
    throw new Error(
      `Hotspot marker diameter must be between ${MIN_MARKER_DIAMETER_CSS_PIXELS} and ${MAX_MARKER_DIAMETER_CSS_PIXELS} CSS pixels.`,
    );
  }
  return value;
}
