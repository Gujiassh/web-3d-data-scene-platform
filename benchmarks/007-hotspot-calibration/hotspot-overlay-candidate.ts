import {
  CircleGeometry,
  Color,
  DoubleSide,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Raycaster,
  Vector2,
  Vector3,
  type Group,
  type Material,
  type PerspectiveCamera,
  type Scene,
} from "three";

import type {
  CalibrationSurfaceAnchor,
  HotspotSurfaceIndexCandidate,
} from "./hotspot-surface-index-candidate";

const MARKER_DIAMETER_CSS_PIXELS = 18;

export interface OverlayUpdateMetrics {
  readonly resolvedAnchorCount: number;
  readonly projectionOcclusionMs: number;
  readonly domMarkerUpdateMs: number;
  readonly totalMs: number;
}

export class HotspotOverlayCandidate {
  readonly #mesh: InstancedMesh;
  readonly #buttons: HTMLButtonElement[];
  readonly #raycaster = new Raycaster();
  readonly #pointer = new Vector2();
  readonly #projected = new Vector3();
  readonly #cameraPosition = new Vector3();
  readonly #visualPosition = new Vector3();
  readonly #scale = new Vector3();
  readonly #matrix = new Matrix4();
  readonly #instanceIds: string[] = [];
  readonly #visibleIds = new Set<string>();
  readonly #worldPositions: Vector3[];
  readonly #worldNormals: Vector3[];
  readonly #screenX: Float64Array;
  readonly #screenY: Float64Array;
  readonly #diameters: Float64Array;
  readonly #visible: Uint8Array;
  #anchors: readonly CalibrationSurfaceAnchor[] = [];
  #disposed = false;

  constructor(
    scene: Scene,
    proxyLayer: HTMLElement,
    readonly surfaceIndex: HotspotSurfaceIndexCandidate,
    readonly width: number,
    readonly height: number,
    capacity: number,
  ) {
    const geometry = new CircleGeometry(0.5, 18);
    const material = new MeshStandardMaterial({
      color: new Color("#00b884"),
      emissive: new Color("#004d3c"),
      emissiveIntensity: 0.28,
      metalness: 0.05,
      roughness: 0.46,
      depthTest: true,
      depthWrite: false,
      side: DoubleSide,
    });
    this.#mesh = new InstancedMesh(geometry, material, capacity);
    this.#mesh.name = "007-hotspot-overlay-candidate";
    this.#mesh.count = 0;
    this.#mesh.frustumCulled = false;
    this.#mesh.renderOrder = 4;
    scene.add(this.#mesh);

    this.#worldPositions = Array.from({ length: capacity }, () => new Vector3());
    this.#worldNormals = Array.from({ length: capacity }, () => new Vector3());
    this.#screenX = new Float64Array(capacity);
    this.#screenY = new Float64Array(capacity);
    this.#diameters = new Float64Array(capacity);
    this.#visible = new Uint8Array(capacity);
    this.#buttons = Array.from({ length: capacity }, (_, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "hotspot-proxy";
      button.dataset["proxyIndex"] = String(index);
      button.hidden = true;
      proxyLayer.append(button);
      return button;
    });
  }

  get visibleIds(): readonly string[] {
    return [...this.#visibleIds].sort();
  }

  get visibleMarkerCount(): number {
    return this.#mesh.count;
  }

  get visibleDomProxyCount(): number {
    return this.#buttons.filter((button) => !button.hidden).length;
  }

  get domProxyCount(): number {
    return this.#buttons.length;
  }

  get accessibleNames(): readonly string[] {
    return this.#buttons
      .filter((button) => button.dataset["hotspotId"] !== undefined)
      .map((button) => button.getAttribute("aria-label") ?? "");
  }

  setAnchors(anchors: readonly CalibrationSurfaceAnchor[]): void {
    if (anchors.length > this.#buttons.length) {
      throw new Error("Calibration overlay capacity exceeded.");
    }
    this.#anchors = anchors;
    this.#buttons.forEach((button, index) => {
      const anchor = anchors[index];
      button.hidden = true;
      button.tabIndex = index === 0 ? 0 : -1;
      if (anchor === undefined) {
        button.removeAttribute("aria-label");
        delete button.dataset["hotspotId"];
        return;
      }
      button.setAttribute("aria-label", anchor.id);
      button.dataset["hotspotId"] = anchor.id;
    });
  }

  update(camera: PerspectiveCamera, occluders: Group): OverlayUpdateMetrics {
    this.#ensureActive();
    const startedAt = performance.now();
    camera.updateMatrixWorld(true);
    occluders.updateMatrixWorld(true);
    camera.getWorldPosition(this.#cameraPosition);

    let resolvedAnchorCount = 0;
    for (const [index, anchor] of this.#anchors.entries()) {
      const worldPosition = this.#worldPositions[index]!;
      const worldNormal = this.#worldNormals[index]!;
      this.#visible[index] = 0;
      if (!this.surfaceIndex.resolve(anchor, worldPosition, worldNormal)) continue;
      resolvedAnchorCount += 1;

      this.#projected.copy(worldPosition).project(camera);
      const insideFrustum =
        this.#projected.z >= -1 &&
        this.#projected.z <= 1 &&
        Math.abs(this.#projected.x) <= 1 &&
        Math.abs(this.#projected.y) <= 1;
      const visible = insideFrustum && !this.#isOccluded(worldPosition, occluders);
      this.#visible[index] = visible ? 1 : 0;
      if (!visible) continue;

      this.#screenX[index] = (this.#projected.x * 0.5 + 0.5) * this.width;
      this.#screenY[index] = (-this.#projected.y * 0.5 + 0.5) * this.height;
      const distance = this.#cameraPosition.distanceTo(worldPosition);
      const worldPerCssPixel =
        (2 * distance * Math.tan((camera.fov * Math.PI) / 360)) / this.height;
      this.#diameters[index] = worldPerCssPixel * MARKER_DIAMETER_CSS_PIXELS;
    }
    const projectionOcclusionMs = performance.now() - startedAt;

    const updateStartedAt = performance.now();
    this.#visibleIds.clear();
    this.#instanceIds.length = 0;
    let visibleIndex = 0;
    for (const [anchorIndex, anchor] of this.#anchors.entries()) {
      const button = this.#buttons[anchorIndex]!;
      const visible = this.#visible[anchorIndex] === 1;
      if (button.hidden === visible) button.hidden = !visible;
      if (!visible) continue;

      button.style.setProperty("--hotspot-x", `${this.#screenX[anchorIndex]}px`);
      button.style.setProperty("--hotspot-y", `${this.#screenY[anchorIndex]}px`);
      const diameter = this.#diameters[anchorIndex]!;
      this.#visualPosition
        .copy(this.#worldPositions[anchorIndex]!)
        .addScaledVector(this.#worldNormals[anchorIndex]!, diameter * 0.08);
      this.#scale.setScalar(diameter);
      this.#matrix.compose(this.#visualPosition, camera.quaternion, this.#scale);
      this.#mesh.setMatrixAt(visibleIndex, this.#matrix);
      this.#instanceIds.push(anchor.id);
      this.#visibleIds.add(anchor.id);
      visibleIndex += 1;
    }

    this.#mesh.count = visibleIndex;
    this.#mesh.instanceMatrix.needsUpdate = true;
    this.#mesh.computeBoundingSphere();
    this.#mesh.updateMatrixWorld(true);
    const domMarkerUpdateMs = performance.now() - updateStartedAt;
    return {
      resolvedAnchorCount,
      projectionOcclusionMs,
      domMarkerUpdateMs,
      totalMs: performance.now() - startedAt,
    };
  }

  pick(camera: PerspectiveCamera, clientX: number, clientY: number): string | null {
    this.#ensureActive();
    this.#pointer.set((clientX / this.width) * 2 - 1, -(clientY / this.height) * 2 + 1);
    this.#raycaster.setFromCamera(this.#pointer, camera);
    for (const hit of this.#raycaster.intersectObject(this.#mesh, false)) {
      if (hit.instanceId === undefined) continue;
      const id = this.#instanceIds[hit.instanceId];
      if (id !== undefined) return id;
    }
    return null;
  }

  proxyCenter(id: string): { readonly x: number; readonly y: number } | null {
    const button = this.#buttons.find((candidate) => candidate.dataset["hotspotId"] === id);
    if (button === undefined || button.hidden) return null;
    const bounds = button.getBoundingClientRect();
    return { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 };
  }

  focusProxy(id: string): boolean {
    const button = this.#buttons.find((candidate) => candidate.dataset["hotspotId"] === id);
    if (button === undefined || button.hidden) return false;
    button.focus();
    return document.activeElement === button;
  }

  isProxyFocused(id: string): boolean {
    return document.activeElement?.getAttribute("data-hotspot-id") === id;
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#mesh.removeFromParent();
    this.#mesh.geometry.dispose();
    const material = this.#mesh.material;
    if (Array.isArray(material)) material.forEach((value) => value.dispose());
    else material.dispose();
    this.#buttons.forEach((button) => button.remove());
    this.#buttons.splice(0);
    this.#anchors = [];
    this.#instanceIds.length = 0;
    this.#visibleIds.clear();
    this.#mesh.count = 0;
  }

  #isOccluded(position: Vector3, occluders: Group): boolean {
    const direction = this.#visualPosition.copy(position).sub(this.#cameraPosition);
    const markerDistance = direction.length();
    if (markerDistance <= 0.0001) return false;
    direction.multiplyScalar(1 / markerDistance);
    this.#raycaster.set(this.#cameraPosition, direction);
    this.#raycaster.near = 0.01;
    this.#raycaster.far = markerDistance;
    return this.#raycaster
      .intersectObject(occluders, true)
      .some((hit) => hit.distance < markerDistance - 0.025 && isDepthOccluder(hit.object));
  }

  #ensureActive(): void {
    if (this.#disposed) throw new Error("Hotspot overlay candidate is disposed.");
  }
}

function isDepthOccluder(object: unknown): boolean {
  if (!(object instanceof Mesh)) return false;
  const materials = Array.isArray(object.material) ? object.material : [object.material];
  return materials.some((material: Material & { transmission?: number }) => {
    return (
      material.visible &&
      material.depthWrite &&
      !material.transparent &&
      material.opacity > 0 &&
      (material.transmission ?? 0) === 0
    );
  });
}
