import {
  AmbientLight,
  BoxGeometry,
  Color,
  DirectionalLight,
  Group,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";

import {
  HotspotOverlay,
  type HotspotOverlayMarker,
} from "../../packages/runtime/src/hotspots/hotspot-overlay";
import {
  HotspotSurfaceIndex,
  type HotspotSurfaceAnchorReference,
} from "../../packages/runtime/src/hotspots/surface-index";

const VIEWPORT_WIDTH = 1440;
const VIEWPORT_HEIGHT = 900;
const MARKER_COUNT = 200;
const WARMUP_SAMPLES = 30;
const MEASURED_SAMPLES = 300;
const FIXTURE_ASSET_HASH = "007-calibration-rigid-surface-v1";
const FIXTURE_ENTITY_ID = "007-calibration-rigid-entity";
const FIXTURE_NODE_INDEX = 1;

interface CalibrationSurfaceAnchor extends HotspotSurfaceAnchorReference {
  readonly id: string;
}

interface ProductionUpdateMetrics {
  readonly resolvedAnchorCount: number;
  readonly surfaceResolutionMs: number;
  readonly markerSyncMs: number;
  readonly overlayUpdateMs: number;
  readonly totalMs: number;
}

interface MetricResult {
  readonly measuredCount: number;
  readonly medianMs: number;
  readonly p95Ms: number;
  readonly maxMs: number;
  readonly samplesMs: readonly number[];
}

interface FrameResult {
  readonly state: "zero" | "surface-200";
  readonly warmupCount: number;
  readonly measuredCount: number;
  readonly cpuWork: MetricResult;
  readonly frameInterval: MetricResult;
  readonly surfaceResolution: MetricResult;
  readonly markerSync: MetricResult;
  readonly overlayUpdate: MetricResult;
  readonly drawCalls: number;
  readonly triangles: number;
  readonly visibleMarkers: number;
  readonly visibleDomProxies: number;
  readonly resolvedAnchorCount: number;
  readonly missedFrameCount: number;
}

interface CalibrationResult {
  readonly fixture: ReturnType<typeof fixtureDescriptor>;
  readonly construction: {
    readonly overlayMs: number;
    readonly compileMs: number;
  };
  readonly states: readonly FrameResult[];
  readonly identityResolution: {
    readonly expectedResolvedCount: number;
    readonly actualResolvedCount: number;
    readonly visibleIds: readonly string[];
    readonly unresolvedIds: readonly string[];
    readonly unresolvedDomAbsent: boolean;
    readonly unresolvedPicksAbsent: boolean;
  };
  readonly markerCpuOverheadP95Ms: number;
  readonly markerFrameIntervalDeltaP95Ms: number;
  readonly projection: MetricResult & {
    readonly maxProxyErrorCssPixels: number;
    readonly movedCameraProxyErrorCssPixels: number;
    readonly focusRetainedAfterCameraMove: boolean;
    readonly accessibleNameCount: number;
    readonly uniqueAccessibleNameCount: number;
  };
  readonly picking: MetricResult & {
    readonly correctPickCount: number;
    readonly expectedId: string;
    readonly pickedId: string | null;
    readonly overlapExpectedId: string;
    readonly overlapPickedId: string | null;
    readonly missPickedId: string | null;
  };
  readonly occlusion: MetricResult & {
    readonly pairCount: number;
    readonly expectedVisibleIds: readonly string[];
    readonly actualVisibleIds: readonly string[];
    readonly movedExpectedVisibleIds: readonly string[];
    readonly movedActualVisibleIds: readonly string[];
    readonly staticFlickerCount: number;
    readonly occludedPickId: string | null;
    readonly transparentMaterialPolicy: "not-an-occluder";
    readonly transparentProbeVisible: boolean;
    readonly cameraMotionProbe: {
      readonly id: string;
      readonly visibleBeforeMove: boolean;
      readonly visibleAfterMove: boolean;
    };
  };
  readonly gpu: {
    readonly supported: boolean;
    readonly warmupCount: number;
    readonly metric: MetricResult | null;
  };
  readonly resources: {
    readonly markerDrawCalls: number;
    readonly markerTriangles: number;
    readonly domProxyCount: number;
    readonly geometries: number;
    readonly textures: number;
  };
  readonly longTasks: {
    readonly count: number;
    readonly totalMs: number;
    readonly maxMs: number;
  };
  readonly canvas: {
    readonly width: number;
    readonly height: number;
    readonly distinctColors: number;
    readonly expectedMarkerLocations: number;
    readonly detectedMarkerLocations: number;
  };
}

interface PointerPreviewResult {
  readonly warmupCount: number;
  readonly measuredCount: number;
  readonly process: MetricResult;
  readonly eventToNextRaf: MetricResult;
  readonly validHitCount: number;
  readonly invalidHitCount: number;
  readonly surfaceRaycastCount: number;
  readonly latestPointerErrorCssPixels: number;
}

interface PointerCaptureState {
  readonly expectedCount: number;
  readonly processMs: number[];
  readonly presentedMs: number[];
  readonly raycaster: Raycaster;
  readonly pointer: Vector2;
  surfaceRaycastCount: number;
  validHitCount: number;
  invalidHitCount: number;
  latestValidClientX: number;
  latestValidClientY: number;
}

interface ActivationCaptureState {
  readonly ids: string[];
  readonly callbackMs: number[];
}

interface CleanupSnapshot {
  readonly sceneChildren: number;
  readonly proxyCount: number;
  readonly geometries: number;
  readonly textures: number;
}

const longTaskDurations: number[] = [];
const longTaskObserver =
  typeof PerformanceObserver === "undefined"
    ? null
    : new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => longTaskDurations.push(entry.duration));
      });
try {
  longTaskObserver?.observe({ entryTypes: ["longtask"] });
} catch {
  longTaskObserver?.disconnect();
}

const container = requireElement("#app");

const renderer = new WebGLRenderer({ antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(VIEWPORT_WIDTH, VIEWPORT_HEIGHT, false);
renderer.outputColorSpace = "srgb";
container.prepend(renderer.domElement);

const scene = new Scene();
scene.background = new Color("#eef2f0");
const camera = new PerspectiveCamera(45, VIEWPORT_WIDTH / VIEWPORT_HEIGHT, 0.01, 100);
camera.position.set(0, 0, 12);
camera.lookAt(0, 0, 0);
camera.updateProjectionMatrix();

scene.add(new AmbientLight("#ffffff", 1.8));
const key = new DirectionalLight("#ffffff", 2.6);
key.position.set(4, 6, 8);
scene.add(key);

const surfaces = new Group();
surfaces.name = "007-calibration-rigid-surfaces";
const wall = new Mesh(
  new BoxGeometry(12.5, 7, 0.1),
  new MeshStandardMaterial({ color: "#315a56", metalness: 0.08, roughness: 0.72 }),
);
wall.name = "007-calibration-node-1";
wall.position.z = -0.06;
surfaces.add(wall);
scene.add(surfaces);

const overlayConstructionStartedAt = performance.now();
const surfaceIndex = new HotspotSurfaceIndex([
  {
    entityId: FIXTURE_ENTITY_ID,
    assetHash: FIXTURE_ASSET_HASH,
    nodesByIndex: new Map([[FIXTURE_NODE_INDEX, surfaces]]),
    nodeIndexByHitObject: new Map([[wall, FIXTURE_NODE_INDEX]]),
  },
]);
const overlay = new HotspotOverlay({
  scene,
  container,
  camera,
  occlusionRoot: surfaces,
  initialCapacity: MARKER_COUNT,
  onActivate: ({ id }) => activationCapture?.ids.push(id),
});
const overlayConstructionMs = performance.now() - overlayConstructionStartedAt;
const performanceAnchors = createPerformanceAnchors();
let activeAnchors: readonly CalibrationSurfaceAnchor[] = [];
let pointerCapture: PointerCaptureState | null = null;
let activationCapture: ActivationCaptureState | null = null;
let totalSurfaceRaycastCount = 0;
let interactionMode: "edit-idle" | "placement-disabled" | "run" | "placement" = "edit-idle";
let pointerListenerAttached = false;
let pendingPointerRafCount = 0;

function setCalibrationAnchors(anchors: readonly CalibrationSurfaceAnchor[]): void {
  activeAnchors = anchors;
  overlay.setOrder(anchors.map((value) => value.id));
  overlay.setMarkers(resolveMarkers(anchors).markers);
}

function updateProductionOverlay(): ProductionUpdateMetrics {
  const startedAt = performance.now();
  const resolutionStartedAt = performance.now();
  const resolved = resolveMarkers(activeAnchors);
  const surfaceResolutionMs = performance.now() - resolutionStartedAt;

  const markerSyncStartedAt = performance.now();
  overlay.setMarkers(resolved.markers);
  const markerSyncMs = performance.now() - markerSyncStartedAt;

  const overlayStartedAt = performance.now();
  overlay.updateNow();
  const overlayUpdateMs = performance.now() - overlayStartedAt;
  return {
    resolvedAnchorCount: resolved.markers.length,
    surfaceResolutionMs,
    markerSyncMs,
    overlayUpdateMs,
    totalMs: performance.now() - startedAt,
  };
}

function resolveMarkers(anchors: readonly CalibrationSurfaceAnchor[]): {
  readonly markers: readonly HotspotOverlayMarker[];
} {
  const markers: HotspotOverlayMarker[] = [];
  const worldPosition = new Vector3();
  const worldNormal = new Vector3();
  for (const value of anchors) {
    const result = surfaceIndex.resolveAnchor(value, worldPosition, worldNormal);
    if (!result.ok) continue;
    markers.push({
      id: value.id,
      title: value.id,
      visible: true,
      worldPosition: worldPosition.toArray(),
      worldNormal: worldNormal.toArray(),
    });
  }
  return { markers };
}

function visibleOverlayIds(): readonly string[] {
  return [...overlay.instanceIds].sort();
}

function accessibleProxyNames(): readonly string[] {
  return [
    ...productionOverlayLayer().querySelectorAll<HTMLButtonElement>(".web3d-hotspot-proxy"),
  ].map((button) => button.getAttribute("aria-label") ?? "");
}

function proxyCenter(id: string): { readonly x: number; readonly y: number } | null {
  const button = [
    ...productionOverlayLayer().querySelectorAll<HTMLButtonElement>(".web3d-hotspot-proxy"),
  ].find((candidate) => candidate.dataset["hotspotId"] === id);
  if (button === undefined || button.hidden) return null;
  const bounds = button.getBoundingClientRect();
  return { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 };
}

function isProxyFocused(id: string): boolean {
  return document.activeElement?.getAttribute("data-hotspot-id") === id;
}

function productionOverlayLayer(): HTMLElement {
  const layer = container.querySelector<HTMLElement>(":scope > .web3d-hotspot-overlay");
  if (layer === null) throw new Error("Production hotspot overlay is unavailable.");
  return layer;
}

async function runCalibration(): Promise<CalibrationResult> {
  setCalibrationAnchors([]);
  const compileStartedAt = performance.now();
  renderer.compile(scene, camera);
  renderer.render(scene, camera);
  const compileMs = performance.now() - compileStartedAt;
  await settleAnimationFrames();

  const zero = await measureFrameState("zero", []);
  (
    globalThis as typeof globalThis & { last007HotspotZeroCanvas?: string }
  ).last007HotspotZeroCanvas = renderer.domElement.toDataURL("image/png");
  const surface200 = await measureFrameState("surface-200", performanceAnchors);
  const identityResolution = measureIdentityResolution();
  const projection = await measureProjection();
  const picking = measurePicking();
  const occlusion = await measureOcclusion();
  const gpu = await measureGpuTime();

  setCalibrationAnchors(performanceAnchors);
  updateProductionOverlay();
  renderer.render(scene, camera);
  const canvas = canvasMetrics(renderer.domElement, performanceAnchors);
  (
    globalThis as typeof globalThis & { last007HotspotCalibrationCanvas?: string }
  ).last007HotspotCalibrationCanvas = renderer.domElement.toDataURL("image/png");
  const memory = renderer.info.memory;

  return {
    fixture: fixtureDescriptor(),
    construction: { overlayMs: overlayConstructionMs, compileMs },
    states: [zero, surface200],
    identityResolution,
    markerCpuOverheadP95Ms: surface200.cpuWork.p95Ms - zero.cpuWork.p95Ms,
    markerFrameIntervalDeltaP95Ms: surface200.frameInterval.p95Ms - zero.frameInterval.p95Ms,
    projection,
    picking,
    occlusion,
    gpu,
    resources: {
      markerDrawCalls: surface200.drawCalls - zero.drawCalls,
      markerTriangles: surface200.triangles - zero.triangles,
      domProxyCount: overlay.proxyCount,
      geometries: memory.geometries,
      textures: memory.textures,
    },
    longTasks: summarizeLongTasks(longTaskDurations),
    canvas,
  };
}

function measureIdentityResolution(): CalibrationResult["identityResolution"] {
  const valid = anchor("identity-valid", -4, 0, 0.06);
  const wrongEntity = {
    ...anchor("identity-wrong-entity", -1.5, 0, 0.06),
    entityId: "wrong-entity",
  };
  const wrongHash = {
    ...anchor("identity-wrong-hash", 1.5, 0, 0.06),
    assetHash: "wrong-hash",
  };
  const wrongNode = {
    ...anchor("identity-wrong-node", 4, 0, 0.06),
    nodeIndex: FIXTURE_NODE_INDEX + 1,
  };
  const unresolved = [wrongEntity, wrongHash, wrongNode];
  setCalibrationAnchors([valid, ...unresolved]);
  const update = updateProductionOverlay();
  renderer.render(scene, camera);
  const unresolvedDomAbsent = unresolved.every((value) => proxyCenter(value.id) === null);
  const unresolvedPicksAbsent = unresolved.every((value) => {
    const point = toScreen(value.nodeLocalPosition);
    return overlay.pick(point.x, point.y) === null;
  });
  return {
    expectedResolvedCount: 1,
    actualResolvedCount: update.resolvedAnchorCount,
    visibleIds: visibleOverlayIds(),
    unresolvedIds: unresolved.map((value) => value.id),
    unresolvedDomAbsent,
    unresolvedPicksAbsent,
  };
}

async function measureFrameState(
  state: FrameResult["state"],
  anchors: readonly CalibrationSurfaceAnchor[],
): Promise<FrameResult> {
  setCalibrationAnchors(anchors);
  performance.mark(`007-${state}-start`);
  const samples = await collectFrameSamples(WARMUP_SAMPLES + MEASURED_SAMPLES);
  performance.mark(`007-${state}-end`);
  const measured = samples.slice(WARMUP_SAMPLES);
  const last = measured.at(-1);
  if (last === undefined) throw new Error("Measured frame sample set is empty.");
  const info = renderer.info.render;
  return {
    state,
    warmupCount: WARMUP_SAMPLES,
    measuredCount: measured.length,
    cpuWork: summarize(measured.map((sample) => sample.cpuWorkMs)),
    frameInterval: summarize(measured.map((sample) => sample.frameIntervalMs)),
    surfaceResolution: summarize(measured.map((sample) => sample.update.surfaceResolutionMs)),
    markerSync: summarize(measured.map((sample) => sample.update.markerSyncMs)),
    overlayUpdate: summarize(measured.map((sample) => sample.update.overlayUpdateMs)),
    drawCalls: info.calls,
    triangles: info.triangles,
    visibleMarkers: overlay.visibleMarkerCount,
    visibleDomProxies: overlay.visibleProxyIds.length,
    resolvedAnchorCount: last.update.resolvedAnchorCount,
    missedFrameCount: measured.filter((sample) => sample.frameIntervalMs > 25).length,
  };
}

interface FrameSample {
  readonly cpuWorkMs: number;
  readonly frameIntervalMs: number;
  readonly update: ProductionUpdateMetrics;
}

function collectFrameSamples(count: number): Promise<readonly FrameSample[]> {
  return new Promise((resolve) => {
    const samples: FrameSample[] = [];
    let previousFrameTime: number | null = null;
    const sample = (frameTime: number): void => {
      const startedAt = performance.now();
      const update = updateProductionOverlay();
      renderer.render(scene, camera);
      samples.push({
        cpuWorkMs: performance.now() - startedAt,
        frameIntervalMs: previousFrameTime === null ? 0 : frameTime - previousFrameTime,
        update,
      });
      previousFrameTime = frameTime;
      if (samples.length < count) requestAnimationFrame(sample);
      else resolve(samples);
    };
    requestAnimationFrame(sample);
  });
}

async function measureProjection(): Promise<CalibrationResult["projection"]> {
  setCalibrationAnchors(performanceAnchors);
  const durations: number[] = [];
  for (let index = 0; index < MEASURED_SAMPLES; index += 1) {
    await new Promise<void>((resolveFrame) => {
      requestAnimationFrame(() => {
        durations.push(updateProductionOverlay().totalMs);
        renderer.render(scene, camera);
        resolveFrame();
      });
    });
  }
  const maxProxyErrorCssPixels = measureProxyErrors(performanceAnchors);
  const names = accessibleProxyNames();
  const focusedId = performanceAnchors[109]!.id;
  const focused = overlay.focusProxy(focusedId);
  camera.position.x = 0.25;
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  updateProductionOverlay();
  renderer.render(scene, camera);
  const movedCameraProxyErrorCssPixels = measureProxyErrors(performanceAnchors);
  const focusRetainedAfterCameraMove = focused && isProxyFocused(focusedId);
  camera.position.x = 0;
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  updateProductionOverlay();
  renderer.render(scene, camera);
  await settleAnimationFrames();
  return {
    ...summarize(durations),
    maxProxyErrorCssPixels,
    movedCameraProxyErrorCssPixels,
    focusRetainedAfterCameraMove,
    accessibleNameCount: names.length,
    uniqueAccessibleNameCount: new Set(names).size,
  };
}

function measurePicking(): CalibrationResult["picking"] {
  setCalibrationAnchors(performanceAnchors);
  updateProductionOverlay();
  const expected = performanceAnchors[109]!;
  const point = toScreen(anchorWorldPosition(expected));
  const durations: number[] = [];
  let pickedId: string | null = null;
  let correctPickCount = 0;
  for (let index = 0; index < WARMUP_SAMPLES; index += 1) {
    overlay.pick(point.x, point.y);
  }
  for (let index = 0; index < MEASURED_SAMPLES; index += 1) {
    const startedAt = performance.now();
    pickedId = overlay.pick(point.x, point.y);
    durations.push(performance.now() - startedAt);
    if (pickedId === expected.id) correctPickCount += 1;
  }

  const overlapAnchors = [anchor("overlap-far", 0, 0, 0.06), anchor("overlap-near", 0, 0, 0.55)];
  setCalibrationAnchors(overlapAnchors);
  updateProductionOverlay();
  const overlapPickedId = overlay.pick(VIEWPORT_WIDTH / 2, VIEWPORT_HEIGHT / 2);
  const missPickedId = overlay.pick(20, 20);
  return {
    ...summarize(durations),
    correctPickCount,
    expectedId: expected.id,
    pickedId,
    overlapExpectedId: "overlap-near",
    overlapPickedId,
    missPickedId,
  };
}

async function measureOcclusion(): Promise<CalibrationResult["occlusion"]> {
  const occluders = new Group();
  occluders.name = "007-calibration-opaque-occluders";
  const geometry = new BoxGeometry(0.28, 0.28, 0.7);
  const material = new MeshStandardMaterial({ color: "#c95f45", roughness: 0.7 });
  const anchors: CalibrationSurfaceAnchor[] = [];
  const initiallyOccluded: string[] = [];
  const initiallyVisible: string[] = [];
  const movedOccluderPositions: Vector3[] = [];
  const occluderZ = 0.75;
  const anchorZ = 0.06;
  const cameraZ = camera.position.z;
  const projectionRatio = (cameraZ - occluderZ) / (cameraZ - anchorZ);
  for (let row = 0; row < 5; row += 1) {
    for (let column = 0; column < 10; column += 1) {
      const pairIndex = row * 10 + column;
      const x = -5.25 + column * 1.15;
      const y = -2.2 + row * 1.1;
      const occludedId = `pair-${String(pairIndex).padStart(2, "0")}-occluded`;
      const visibleId = `pair-${String(pairIndex).padStart(2, "0")}-visible`;
      anchors.push(anchor(occludedId, x, y, 0.06), anchor(visibleId, x + 0.45, y, 0.06));
      initiallyOccluded.push(occludedId);
      initiallyVisible.push(visibleId);
      const occluder = new Mesh(geometry, material);
      occluder.position.set(x * projectionRatio, y * projectionRatio, occluderZ);
      movedOccluderPositions.push(
        new Vector3((x + 0.45) * projectionRatio, y * projectionRatio, occluderZ),
      );
      occluders.add(occluder);
    }
  }
  surfaces.add(occluders);
  setCalibrationAnchors(anchors);
  const durations: number[] = [];
  let staticFlickerCount = 0;
  let previousSignature: string | null = null;
  for (let index = 0; index < MEASURED_SAMPLES; index += 1) {
    await new Promise<void>((resolveFrame) => {
      requestAnimationFrame(() => {
        durations.push(updateProductionOverlay().totalMs);
        renderer.render(scene, camera);
        const signature = visibleOverlayIds().join("|");
        if (previousSignature !== null && signature !== previousSignature) {
          staticFlickerCount += 1;
        }
        previousSignature = signature;
        resolveFrame();
      });
    });
  }
  const actualVisibleIds = visibleOverlayIds();
  const occludedPoint = toScreen(anchorWorldPosition(anchors[0]!));
  const occludedPickId = overlay.pick(occludedPoint.x, occludedPoint.y);

  occluders.children.forEach((occluder, index) => {
    const moved = movedOccluderPositions[index];
    if (moved === undefined) throw new Error("Moved occluder position is missing.");
    occluder.position.copy(moved);
  });
  occluders.updateMatrixWorld(true);
  updateProductionOverlay();
  renderer.render(scene, camera);
  await settleAnimationFrames();
  const movedActualVisibleIds = visibleOverlayIds();

  surfaces.remove(occluders);
  const cameraMotionProbe = await measureCameraMotionOcclusionProbe();
  const transparentProbeVisible = measureTransparentOcclusionProbe();
  geometry.dispose();
  material.dispose();
  return {
    ...summarize(durations),
    pairCount: 50,
    expectedVisibleIds: initiallyVisible.sort(),
    actualVisibleIds,
    movedExpectedVisibleIds: initiallyOccluded.sort(),
    movedActualVisibleIds,
    staticFlickerCount,
    occludedPickId,
    transparentMaterialPolicy: "not-an-occluder",
    transparentProbeVisible,
    cameraMotionProbe,
  };
}

async function measureCameraMotionOcclusionProbe() {
  const id = "camera-motion-occluded";
  const probe = new Mesh(
    new BoxGeometry(0.28, 0.28, 0.7),
    new MeshStandardMaterial({ color: "#c95f45", roughness: 0.7 }),
  );
  probe.position.set(0, 0, 0.75);
  surfaces.add(probe);
  setCalibrationAnchors([anchor(id, 0, 0, 0.06)]);
  updateProductionOverlay();
  renderer.render(scene, camera);
  const visibleBeforeMove = visibleOverlayIds().includes(id);
  camera.position.x = 8;
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  updateProductionOverlay();
  renderer.render(scene, camera);
  await settleAnimationFrames();
  const visibleAfterMove = visibleOverlayIds().includes(id);
  camera.position.x = 0;
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  surfaces.remove(probe);
  probe.geometry.dispose();
  const probeMaterial = probe.material;
  if (Array.isArray(probeMaterial)) probeMaterial.forEach((value) => value.dispose());
  else probeMaterial.dispose();
  return { id, visibleBeforeMove, visibleAfterMove };
}

function measureTransparentOcclusionProbe(): boolean {
  const probe = new Mesh(
    new BoxGeometry(0.5, 0.5, 0.7),
    new MeshStandardMaterial({
      color: "#ffffff",
      opacity: 0.5,
      transparent: true,
      depthWrite: false,
    }),
  );
  probe.position.set(0, 0, 0.75);
  surfaces.add(probe);
  const id = "transparent-probe";
  setCalibrationAnchors([anchor(id, 0, 0, 0.06)]);
  updateProductionOverlay();
  renderer.render(scene, camera);
  const visible = visibleOverlayIds().includes(id);
  surfaces.remove(probe);
  probe.geometry.dispose();
  const probeMaterial = probe.material;
  if (Array.isArray(probeMaterial)) probeMaterial.forEach((value) => value.dispose());
  else probeMaterial.dispose();
  return visible;
}

async function measureGpuTime(): Promise<CalibrationResult["gpu"]> {
  const gl = renderer.getContext();
  const extension = gl.getExtension("EXT_disjoint_timer_query_webgl2") as {
    readonly TIME_ELAPSED_EXT: number;
    readonly GPU_DISJOINT_EXT: number;
  } | null;
  if (extension === null || !(gl instanceof WebGL2RenderingContext)) {
    return { supported: false, warmupCount: 0, metric: null };
  }
  setCalibrationAnchors(performanceAnchors);
  const samples: number[] = [];
  for (let index = 0; index < WARMUP_SAMPLES + MEASURED_SAMPLES; index += 1) {
    updateProductionOverlay();
    const query = gl.createQuery();
    if (query === null) return { supported: false, warmupCount: 0, metric: null };
    gl.beginQuery(extension.TIME_ELAPSED_EXT, query);
    renderer.render(scene, camera);
    gl.endQuery(extension.TIME_ELAPSED_EXT);
    const nanoseconds = await waitForGpuQuery(gl, extension, query);
    gl.deleteQuery(query);
    samples.push(nanoseconds / 1_000_000);
  }
  return {
    supported: true,
    warmupCount: WARMUP_SAMPLES,
    metric: summarize(samples.slice(WARMUP_SAMPLES)),
  };
}

function waitForGpuQuery(
  gl: WebGL2RenderingContext,
  extension: { readonly GPU_DISJOINT_EXT: number },
  query: WebGLQuery,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const poll = (): void => {
      const available = gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE) as boolean;
      const disjoint = gl.getParameter(extension.GPU_DISJOINT_EXT) as boolean;
      if (disjoint) {
        reject(new Error("GPU timer query became disjoint."));
        return;
      }
      if (available) {
        resolve(gl.getQueryParameter(query, gl.QUERY_RESULT) as number);
        return;
      }
      requestAnimationFrame(poll);
    };
    requestAnimationFrame(poll);
  });
}

function beginPointerPreviewCalibration(expectedCount: number): void {
  if (pointerCapture !== null) throw new Error("Pointer preview calibration is already active.");
  pointerCapture = {
    expectedCount,
    processMs: [],
    presentedMs: [],
    raycaster: new Raycaster(),
    pointer: new Vector2(),
    surfaceRaycastCount: 0,
    validHitCount: 0,
    invalidHitCount: 0,
    latestValidClientX: 0,
    latestValidClientY: 0,
  };
  interactionMode = "placement";
  setCalibrationAnchors([]);
  renderer.domElement.addEventListener("pointermove", handlePointerPreview);
  pointerListenerAttached = true;
}

function handlePointerPreview(event: PointerEvent): void {
  const capture = pointerCapture;
  if (capture === null || capture.processMs.length >= capture.expectedCount) return;
  const sampleIndex = capture.processMs.length;
  performance.mark(`007-pointer-preview-${String(sampleIndex).padStart(3, "0")}`);
  const startedAt = performance.now();
  capture.pointer.set(
    (event.clientX / VIEWPORT_WIDTH) * 2 - 1,
    -(event.clientY / VIEWPORT_HEIGHT) * 2 + 1,
  );
  capture.raycaster.setFromCamera(capture.pointer, camera);
  capture.surfaceRaycastCount += 1;
  totalSurfaceRaycastCount += 1;
  const hit = capture.raycaster.intersectObject(surfaces, true)[0];
  if (hit !== undefined && hit.face !== null && hit.face !== undefined) {
    capture.validHitCount += 1;
    capture.latestValidClientX = event.clientX;
    capture.latestValidClientY = event.clientY;
    const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
    setCalibrationAnchors([surfaceAnchorFromWorld("preview", hit.point, normal)]);
    updateProductionOverlay();
    renderer.render(scene, camera);
  } else {
    capture.invalidHitCount += 1;
    setCalibrationAnchors([]);
    updateProductionOverlay();
    renderer.render(scene, camera);
  }
  capture.processMs.push(performance.now() - startedAt);
  requestAnimationFrame(() => {
    capture.presentedMs.push(performance.now() - startedAt);
    pendingPointerRafCount -= 1;
  });
  pendingPointerRafCount += 1;
}

function finishPointerPreviewCalibration(): PointerPreviewResult {
  const capture = pointerCapture;
  if (capture === null) throw new Error("Pointer preview calibration is not active.");
  renderer.domElement.removeEventListener("pointermove", handlePointerPreview);
  pointerListenerAttached = false;
  interactionMode = "placement-disabled";
  pointerCapture = null;
  if (
    capture.processMs.length !== capture.expectedCount ||
    capture.presentedMs.length !== capture.expectedCount
  ) {
    throw new Error(
      `Pointer capture is incomplete: process=${capture.processMs.length} presented=${capture.presentedMs.length}.`,
    );
  }
  const measuredProcess = capture.processMs.slice(WARMUP_SAMPLES);
  const measuredPresented = capture.presentedMs.slice(WARMUP_SAMPLES);
  const center = proxyCenter("preview");
  const latestPointerErrorCssPixels =
    center === null
      ? Number.POSITIVE_INFINITY
      : Math.hypot(center.x - capture.latestValidClientX, center.y - capture.latestValidClientY);
  return {
    warmupCount: WARMUP_SAMPLES,
    measuredCount: measuredProcess.length,
    process: summarize(measuredProcess),
    eventToNextRaf: summarize(measuredPresented),
    validHitCount: capture.validHitCount,
    invalidHitCount: capture.invalidHitCount,
    surfaceRaycastCount: capture.surfaceRaycastCount,
    latestPointerErrorCssPixels,
  };
}

function currentSurfaceRaycastCount(): number {
  return totalSurfaceRaycastCount;
}

function setInteractionMode(mode: "edit-idle" | "placement-disabled" | "run"): void {
  if (pointerCapture !== null) throw new Error("Cannot change idle mode during placement capture.");
  interactionMode = mode;
}

function currentInteractionMode(): typeof interactionMode {
  return interactionMode;
}

function beginActivationCalibration(): void {
  if (activationCapture !== null) throw new Error("Activation calibration is already active.");
  activationCapture = { ids: [], callbackMs: [] };
  setCalibrationAnchors(performanceAnchors);
  updateProductionOverlay();
  renderer.render(scene, camera);
  productionOverlayLayer().addEventListener("click", handleActivationTiming);
}

function handleActivationTiming(event: MouseEvent): void {
  const capture = activationCapture;
  if (capture === null) return;
  const target = event.target;
  if (!(target instanceof HTMLButtonElement)) return;
  if (target.dataset["hotspotId"] === undefined) return;
  capture.callbackMs.push(performance.now() - event.timeStamp);
}

function finishActivationCalibration() {
  const capture = activationCapture;
  if (capture === null) throw new Error("Activation calibration is not active.");
  productionOverlayLayer().removeEventListener("click", handleActivationTiming);
  activationCapture = null;
  return {
    ids: [...capture.ids],
    callback: summarize(capture.callbackMs),
  };
}

async function runTraceFrames(
  state: FrameResult["state"],
  count: number,
): Promise<{ readonly state: FrameResult["state"]; readonly count: number }> {
  setCalibrationAnchors(state === "zero" ? [] : performanceAnchors);
  await collectFrameSamples(count);
  return { state, count };
}

function proxyCenterForCalibration(id: string) {
  return proxyCenter(id);
}

function runCleanupCalibration() {
  if (pointerCapture !== null || pointerListenerAttached || pendingPointerRafCount !== 0) {
    throw new Error("Pointer interaction state is still active before cleanup calibration.");
  }
  const baseline = cleanupSnapshot();
  const cycleLiveProxyCounts: number[] = [];
  const cycleDisposedProxyCounts: number[] = [];
  for (let cycle = 0; cycle < 5; cycle += 1) {
    const layer = document.createElement("div");
    layer.className = "cleanup-probe";
    Object.assign(layer.style, { inset: "0", position: "absolute" });
    container.append(layer);
    const probe = new HotspotOverlay({
      scene,
      container: layer,
      camera,
      occlusionRoot: surfaces,
      initialCapacity: MARKER_COUNT,
    });
    probe.setMarkers(resolveMarkers(performanceAnchors).markers);
    probe.updateNow();
    renderer.render(scene, camera);
    cycleLiveProxyCounts.push(probe.visibleProxyIds.length);
    probe.dispose();
    cycleDisposedProxyCounts.push(probe.proxyCount);
    layer.remove();
    renderer.render(scene, camera);
  }
  const after = cleanupSnapshot();
  return {
    cycleCount: 5,
    baseline,
    after,
    cycleLiveProxyCounts,
    cycleDisposedProxyCounts,
    pointerCaptureActive: pointerCapture !== null,
    pointerListenerAttached,
    pendingPointerRafCount,
  };
}

function cleanupSnapshot(): CleanupSnapshot {
  return {
    sceneChildren: scene.children.length,
    proxyCount: container.querySelectorAll(".web3d-hotspot-proxy").length,
    geometries: renderer.info.memory.geometries,
    textures: renderer.info.memory.textures,
  };
}

function createPerformanceAnchors(): readonly CalibrationSurfaceAnchor[] {
  const anchors: CalibrationSurfaceAnchor[] = [];
  for (let row = 0; row < 10; row += 1) {
    for (let column = 0; column < 20; column += 1) {
      anchors.push(
        anchor(
          `surface-${String(anchors.length + 1).padStart(3, "0")}`,
          -5.7 + column * 0.6,
          -2.7 + row * 0.6,
          0.06,
        ),
      );
    }
  }
  return anchors;
}

function anchor(id: string, x: number, y: number, z: number): CalibrationSurfaceAnchor {
  return {
    id,
    kind: "surface",
    entityId: FIXTURE_ENTITY_ID,
    assetHash: FIXTURE_ASSET_HASH,
    nodeIndex: FIXTURE_NODE_INDEX,
    nodeLocalPosition: [x, y, z],
    nodeLocalNormal: [0, 0, 1],
  };
}

function surfaceAnchorFromWorld(
  id: string,
  worldPosition: Vector3,
  worldNormal: Vector3,
): CalibrationSurfaceAnchor {
  return {
    id,
    kind: "surface",
    entityId: FIXTURE_ENTITY_ID,
    assetHash: FIXTURE_ASSET_HASH,
    nodeIndex: FIXTURE_NODE_INDEX,
    nodeLocalPosition: worldPosition.toArray(),
    nodeLocalNormal: worldNormal.toArray(),
  };
}

function anchorWorldPosition(value: CalibrationSurfaceAnchor): Vector3 {
  const worldPosition = new Vector3();
  if (!surfaceIndex.resolveAnchor(value, worldPosition, new Vector3()).ok) {
    throw new Error(`Calibration anchor ${value.id} cannot resolve.`);
  }
  return worldPosition;
}

function measureProxyErrors(anchors: readonly CalibrationSurfaceAnchor[]): number {
  let maxError = 0;
  for (const value of anchors) {
    const expected = toScreen(anchorWorldPosition(value));
    const actual = proxyCenter(value.id);
    if (actual === null) throw new Error(`Visible proxy ${value.id} is missing.`);
    maxError = Math.max(maxError, Math.hypot(actual.x - expected.x, actual.y - expected.y));
  }
  return maxError;
}

function toScreen(position: Vector3 | readonly [number, number, number]): {
  readonly x: number;
  readonly y: number;
} {
  const projected = (
    position instanceof Vector3 ? position.clone() : new Vector3().fromArray(position)
  ).project(camera);
  return {
    x: (projected.x * 0.5 + 0.5) * VIEWPORT_WIDTH,
    y: (-projected.y * 0.5 + 0.5) * VIEWPORT_HEIGHT,
  };
}

function canvasMetrics(
  canvas: HTMLCanvasElement,
  anchors: readonly CalibrationSurfaceAnchor[],
): CalibrationResult["canvas"] {
  const sample = document.createElement("canvas");
  sample.width = canvas.width;
  sample.height = canvas.height;
  const context = sample.getContext("2d", { willReadFrequently: true });
  if (context === null) throw new Error("Canvas pixel evidence is unavailable.");
  context.drawImage(canvas, 0, 0);
  const pixels = context.getImageData(0, 0, sample.width, sample.height).data;
  const colors = new Set<string>();
  for (let y = 0; y < sample.height; y += 9) {
    for (let x = 0; x < sample.width; x += 9) {
      const index = (y * sample.width + x) * 4;
      colors.add(
        `${(pixels[index] ?? 0) >> 4}:${(pixels[index + 1] ?? 0) >> 4}:${
          (pixels[index + 2] ?? 0) >> 4
        }:${(pixels[index + 3] ?? 0) >> 4}`,
      );
    }
  }
  let detectedMarkerLocations = 0;
  for (const value of anchors) {
    const point = toScreen(anchorWorldPosition(value));
    const x = Math.round(point.x);
    const y = Math.round(point.y);
    let detected = false;
    for (let offsetY = -2; offsetY <= 2 && !detected; offsetY += 1) {
      for (let offsetX = -2; offsetX <= 2; offsetX += 1) {
        const index = ((y + offsetY) * sample.width + x + offsetX) * 4;
        const green = pixels[index + 1] ?? 0;
        if (green >= 130) {
          detected = true;
          break;
        }
      }
    }
    if (detected) detectedMarkerLocations += 1;
  }
  return {
    width: canvas.width,
    height: canvas.height,
    distinctColors: colors.size,
    expectedMarkerLocations: anchors.length,
    detectedMarkerLocations,
  };
}

function fixtureDescriptor() {
  return {
    version: 1,
    viewport: { width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT, dpr: 1 },
    camera: { position: [0, 0, 12], target: [0, 0, 0], fov: 45 },
    rigidSurface: {
      entityId: FIXTURE_ENTITY_ID,
      assetHash: FIXTURE_ASSET_HASH,
      nodeIndex: FIXTURE_NODE_INDEX,
      size: [12.5, 7, 0.1],
    },
    markers: performanceAnchors.map((value) => ({
      id: value.id,
      nodeLocalPosition: value.nodeLocalPosition,
      nodeLocalNormal: value.nodeLocalNormal,
    })),
  } as const;
}

function summarize(values: readonly number[]): MetricResult {
  const sorted = [...values].sort((left, right) => left - right);
  return {
    measuredCount: values.length,
    medianMs: percentile(sorted, 0.5),
    p95Ms: percentile(sorted, 0.95),
    maxMs: sorted.at(-1) ?? 0,
    samplesMs: [...values],
  };
}

function summarizeLongTasks(values: readonly number[]) {
  return {
    count: values.length,
    totalMs: values.reduce((total, value) => total + value, 0),
    maxMs: Math.max(0, ...values),
  };
}

function percentile(sorted: readonly number[], value: number): number {
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * value) - 1)] ?? 0;
}

function settleAnimationFrames(): Promise<void> {
  return new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );
}

function requireElement(selector: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(selector);
  if (element === null) throw new Error(`Missing calibration element ${selector}.`);
  return element;
}

Object.assign(globalThis, {
  run007HotspotCalibration: runCalibration,
  begin007PointerPreviewCalibration: beginPointerPreviewCalibration,
  finish007PointerPreviewCalibration: finishPointerPreviewCalibration,
  current007SurfaceRaycastCount: currentSurfaceRaycastCount,
  set007InteractionMode: setInteractionMode,
  current007InteractionMode: currentInteractionMode,
  begin007ActivationCalibration: beginActivationCalibration,
  finish007ActivationCalibration: finishActivationCalibration,
  run007TraceFrames: runTraceFrames,
  proxyCenterFor007Calibration: proxyCenterForCalibration,
  run007CleanupCalibration: runCleanupCalibration,
});
