import { createElement, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";

import { SceneViewer, type SceneViewerHandle } from "../../packages/react/src/index";
import type { AssetResolver, ViewerEvent, ViewerSnapshot } from "../../packages/runtime/src/index";

import {
  FIXTURE_ACTIVE_ALARMS,
  FIXTURE_ASSET_ID,
  FIXTURE_BINDING_COUNT,
  FIXTURE_ENTITY_COUNT,
  FIXTURE_MAX_ASSET_BYTES,
  FIXTURE_MAX_DRAW_CALLS,
  FIXTURE_MIN_ASSET_BYTES,
  FIXTURE_PATCH_RATE_HZ,
  FIXTURE_TARGET_COUNT,
  FIXTURE_UNIQUE_TRIANGLES,
  fixtureTargetId,
  fixtureViewId,
} from "./fixture-contract";
import {
  createPerformanceEventCapture,
  recordPerformanceEvent,
  stopPerformanceEventCapture,
  type PerformanceEventCapture,
} from "./event-capture";
import { loadReleasePerformanceFixture, type ReleasePerformanceFixture } from "./fixture";
import {
  installBenchmarkInstrumentation,
  type BenchmarkInstrumentation,
  type CapturedCanvasFrame,
  type OwnedResourceProbe,
  type RendererProbe,
} from "./instrumentation";
import {
  memoryFinalLimit,
  summarizeDistribution,
  summarizeFrames,
  theilSenSlope,
  type TimedValue,
} from "./metrics";
import { PatchRateAdapter, type PatchRateStats } from "./patch-rate-adapter";

export interface ReleasePerformanceConfig {
  readonly warmupMs: number;
  readonly measurementMs: number;
  readonly activationCount: number;
  readonly latencySampleCount: number;
  readonly memoryDurationMs: number;
  readonly memoryIntervalMs: number;
}

interface CanvasEvidence {
  readonly width: number;
  readonly height: number;
  readonly distinctColors: number;
  readonly nonTransparentPixels: number;
}

interface LatencySample {
  readonly index: number;
  readonly startedAt: number;
  readonly eventAt: number;
  readonly snapshotAt: number;
  readonly canvasAt: number;
  readonly snapshotLatencyMs: number;
  readonly canvasLatencyMs: number;
  readonly changedPixels: number;
  readonly sequence?: number;
  readonly value?: "probe-hidden" | "ready";
}

interface MemorySample {
  readonly index: number;
  readonly elapsedMs: number;
  readonly rawJsHeapBytes: number | null;
  readonly forcedGcJsHeapBytes: number | null;
  readonly domNodes: number;
  readonly rendererGeometries: number;
  readonly rendererTextures: number;
  readonly ownedRaf: number;
  readonly ownedResizeObservers: number;
  readonly ownedListeners: number;
  readonly ownedIntervals: number;
  readonly adapterConnections: number;
  readonly activeRenderers: number;
}

interface EventLog {
  readonly performance: PerformanceEventCapture;
  readonly selections: Array<{ readonly targetId: string | null; readonly at: number }>;
  readonly diagnostics: string[];
}

interface MountedViewer {
  readonly root: Root;
  readonly host: HTMLDivElement;
  readonly handle: SceneViewerHandle;
  readonly adapter: PatchRateAdapter;
  readonly events: EventLog;
}

interface AssetAudit {
  readonly referenced: Set<string>;
  readonly requested: Set<string>;
  readonly resolved: Set<string>;
  readonly loaded: Set<string>;
  readonly resolvedBytes: Map<string, number>;
}

const app = requiredElement("app");
const VISIBLE_PROBE_INDEX = 55;

async function runReleasePerformance(
  config: ReleasePerformanceConfig,
): Promise<Record<string, unknown>> {
  validateConfig(config);
  const instrumentation = installBenchmarkInstrumentation();
  const fixture = await loadReleasePerformanceFixture();
  const assetAudit: AssetAudit = {
    referenced: new Set(fixture.document.assets.map((asset) => asset.sha256)),
    requested: new Set(),
    resolved: new Set(),
    loaded: new Set(),
    resolvedBytes: new Map(),
  };
  const resolver = createAssetResolver(fixture, assetAudit);
  const disposal: OwnedResourceProbe[] = [];
  let mounted: MountedViewer | null = null;

  try {
    assertFixtureShape(fixture);
    mounted = await mountViewer(fixture, resolver, instrumentation, assetAudit);
    await mounted.handle.setView(fixtureViewId(0));
    const initialRender = await waitForRender(mounted, instrumentation);
    assertLoadedShape(fixture, assetAudit, initialRender, mounted.handle.getSnapshot());
    const initialCanvas = await captureProductionFrame(mounted, instrumentation);
    const initialCanvasEvidence = canvasEvidence(initialCanvas);
    if (
      initialCanvasEvidence.distinctColors <= 1 ||
      initialCanvasEvidence.nonTransparentPixels === 0
    ) {
      throw new Error("Release performance fixture produced blank Canvas evidence.");
    }

    const selection = await measureSelectionLatency(
      mounted,
      instrumentation,
      config.latencySampleCount,
    );
    const patch = await measurePatchLatency(mounted, instrumentation, config.latencySampleCount);
    const warmupFrameDeltaMs = await driveFixedViewPath(mounted, instrumentation, config.warmupMs);
    const frameDeltaMs = await driveFixedViewPath(mounted, instrumentation, config.measurementMs);
    const patchRate = mounted.adapter.stats();
    assertPatchRate(patchRate);
    disposal.push(await unmountViewer(mounted, instrumentation));
    mounted = null;

    const activationDurationsMs: number[] = [];
    for (let index = 0; index < config.activationCount; index += 1) {
      const startedAt = performance.now();
      const activationViewer = await mountViewer(fixture, resolver, instrumentation, assetAudit);
      activationDurationsMs.push(performance.now() - startedAt);
      disposal.push(await unmountViewer(activationViewer, instrumentation));
    }

    mounted = await mountViewer(fixture, resolver, instrumentation, assetAudit);
    await mounted.handle.setView(fixtureViewId(0));
    await waitForRender(mounted, instrumentation);
    stopPerformanceEventCapture(mounted.events.performance);
    const memory = await collectMemorySeries(mounted, instrumentation, config);
    const finalCanvas = await captureProductionFrame(mounted, instrumentation);
    const finalCanvasEvidence = canvasEvidence(finalCanvas);
    const canvasDataUrl = finalCanvas.dataUrl;
    disposal.push(await unmountViewer(mounted, instrumentation));
    mounted = null;
    assertDisposed(disposal);

    const selectionCanvasLatencies = selection.map((sample) => sample.canvasLatencyMs);
    const patchCanvasLatencies = patch.map((sample) => sample.canvasLatencyMs);
    return {
      schemaVersion: "1.0.0",
      clock: "performance.now",
      config,
      fixture: {
        documentId: fixture.document.id,
        documentRevision: fixture.document.revision,
        documentSha256: fixture.documentSha256,
        assetSha256: fixture.assetSha256,
        entityCount: fixture.document.entities.length,
        targetCount: fixture.document.targets.length,
        enabledBindingCount: fixture.document.bindings.filter((binding) => binding.enabled).length,
        uniqueTriangles: fixture.document.assets.reduce(
          (total, asset) => total + (asset.stats?.triangleCount ?? 0),
          0,
        ),
        compressedAssetBytes: [...assetAudit.resolvedBytes.values()].reduce(
          (total, value) => total + value,
          0,
        ),
        referencedHashes: [...assetAudit.referenced].sort(),
        requestedHashes: [...assetAudit.requested].sort(),
        resolvedHashes: [...assetAudit.resolved].sort(),
        loadedHashes: [...assetAudit.loaded].sort(),
        expectedPatchRateHz: FIXTURE_PATCH_RATE_HZ,
        expectedActiveAlarms: FIXTURE_ACTIVE_ALARMS,
      },
      renderer: initialRender,
      frames: {
        warmupFrameDeltaMs,
        frameDeltaMs,
        summary: summarizeFrames(frameDeltaMs),
      },
      selection: {
        samples: selection,
        summary: summarizeDistribution(selectionCanvasLatencies),
      },
      patch: {
        samples: patch,
        summary: summarizeDistribution(patchCanvasLatencies),
        rate: patchRate,
      },
      activation: {
        durationsMs: activationDurationsMs,
        summary: summarizeDistribution(activationDurationsMs),
      },
      memory,
      disposal,
      canvas: finalCanvasEvidence,
      initialCanvas: initialCanvasEvidence,
      canvasDataUrl,
    };
  } finally {
    if (mounted !== null) await unmountViewer(mounted, instrumentation).catch(() => undefined);
    instrumentation.restore();
    app.replaceChildren();
  }
}

async function mountViewer(
  fixture: ReleasePerformanceFixture,
  resolver: AssetResolver,
  instrumentation: BenchmarkInstrumentation,
  assetAudit: AssetAudit,
): Promise<MountedViewer> {
  const host = document.createElement("div");
  host.className = "benchmark-viewer";
  app.replaceChildren(host);
  const root = createRoot(host);
  const ref = createRef<SceneViewerHandle>();
  const events: EventLog = {
    performance: createPerformanceEventCapture(),
    selections: [],
    diagnostics: [],
  };
  const adapter = new PatchRateAdapter(fixture.initialValue, {
    connectionStarted: instrumentation.adapterStarted,
    connectionStopped: instrumentation.adapterStopped,
  });
  let resolveReady: (() => void) | null = null;
  let rejectReady: ((error: Error) => void) | null = null;
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  const onEvent = (event: ViewerEvent): void => {
    const at = performance.now();
    if (event.type === "performance") {
      recordPerformanceEvent(events.performance, at, event.sample);
    }
    if (event.type === "selection-change") {
      events.selections.push({ targetId: event.targetId, at });
    }
    if (event.type === "diagnostic") {
      events.diagnostics.push(`${event.diagnostic.code}:${event.diagnostic.message}`);
      if (event.diagnostic.severity === "error") rejectReady?.(new Error(event.diagnostic.message));
    }
  };
  root.render(
    createElement(SceneViewer, {
      ref,
      source: fixture.document,
      adapters: { [adapter.sourceId]: adapter },
      assetResolver: resolver,
      canvasLabel: "Release performance fixture",
      pixelRatio: 1,
      reducedMotion: true,
      style: { width: "100%", height: "100%" },
      onEvent,
      onReady: () => {
        assetAudit.loaded.add(fixture.assetSha256);
        resolveReady?.();
      },
    }),
  );
  await withTimeout(ready, 60_000, "Production SceneViewer ready");
  if (ref.current === null) throw new Error("Production SceneViewer handle is unavailable.");
  await waitUntil(
    () => ref.current?.getSnapshot().connections[adapter.sourceId] === "online",
    instrumentation,
    5_000,
    "adapter online",
  );
  return { root, host, handle: ref.current, adapter, events };
}

async function unmountViewer(
  mounted: MountedViewer,
  instrumentation: BenchmarkInstrumentation,
): Promise<OwnedResourceProbe> {
  mounted.root.unmount();
  await waitUntil(
    () => ownedResourceTotal(instrumentation.owned()) === 0,
    instrumentation,
    10_000,
    "viewer owned resources disposed",
  );
  mounted.host.remove();
  return instrumentation.owned();
}

function createAssetResolver(fixture: ReleasePerformanceFixture, audit: AssetAudit): AssetResolver {
  const blob = new Blob([fixture.assetBytes.buffer], { type: "model/gltf-binary" });
  return {
    resolve(asset) {
      audit.requested.add(asset.sha256);
      if (asset.id !== FIXTURE_ASSET_ID || asset.sha256 !== fixture.assetSha256) {
        throw new Error(`Unexpected release fixture asset ${asset.id}:${asset.sha256}.`);
      }
      audit.resolved.add(asset.sha256);
      audit.resolvedBytes.set(asset.sha256, blob.size);
      return Promise.resolve(blob);
    },
  };
}

async function waitForRender(
  mounted: MountedViewer,
  instrumentation: BenchmarkInstrumentation,
): Promise<RendererProbe> {
  const before = mounted.events.performance.samples.length;
  mounted.handle.setView(fixtureViewId(0));
  await waitUntil(
    () => mounted.events.performance.samples.length > before,
    instrumentation,
    5_000,
    "production render sample",
  );
  const sample = mounted.events.performance.samples.at(-1);
  if (sample === undefined) throw new Error("Production renderer sample is unavailable.");
  return {
    ...instrumentation.renderer(),
    drawCalls: sample.drawCalls,
    triangles: sample.triangles,
  };
}

async function driveFixedViewPath(
  mounted: MountedViewer,
  instrumentation: BenchmarkInstrumentation,
  durationMs: number,
): Promise<number[]> {
  const eventOffset = mounted.events.performance.times.length;
  const startedAt = performance.now();
  while (performance.now() - startedAt < durationMs) {
    const time = await instrumentation.nextFrame();
    const progress = Math.max(0, Math.min(1, (time - startedAt) / durationMs));
    const viewIndex = Math.min(119, Math.floor(progress * 120));
    await mounted.handle.setView(fixtureViewId(viewIndex));
  }
  await instrumentation.nextFrame();
  await instrumentation.nextFrame();
  const times = mounted.events.performance.times
    .slice(eventOffset)
    .filter((time) => time >= startedAt && time <= performance.now());
  const deltas = times.slice(1).map((time, index) => time - times[index]!);
  if (deltas.length === 0) throw new Error("Fixed view path produced no frame delta samples.");
  return deltas;
}

async function measureSelectionLatency(
  mounted: MountedViewer,
  instrumentation: BenchmarkInstrumentation,
  count: number,
): Promise<LatencySample[]> {
  const samples: LatencySample[] = [];
  instrumentation.startCanvasCapture();
  try {
    for (let index = 0; index < count; index += 1) {
      mounted.handle.selectTarget(null);
      const before = await waitForCapturedFrame(mounted, instrumentation);
      if (index === 0) {
        (
          globalThis as typeof globalThis & { last009SelectionBeforeCanvas?: string }
        ).last009SelectionBeforeCanvas = before.dataUrl;
      }
      const selectionOffset = mounted.events.selections.length;
      const startedAt = performance.now();
      mounted.handle.selectTarget(fixtureTargetId(VISIBLE_PROBE_INDEX));
      const proof = await waitForCanvasProof(
        instrumentation,
        before,
        () =>
          mounted.handle.getSnapshot().selectedTargetId === fixtureTargetId(VISIBLE_PROBE_INDEX),
      );
      const selectionEvent = mounted.events.selections
        .slice(selectionOffset)
        .find((event) => event.targetId === fixtureTargetId(VISIBLE_PROBE_INDEX));
      if (selectionEvent === undefined) throw new Error("Selection event evidence is missing.");
      samples.push({
        index,
        startedAt,
        eventAt: selectionEvent.at,
        snapshotAt: proof.snapshotAt,
        canvasAt: proof.canvasAt,
        snapshotLatencyMs: proof.snapshotAt - selectionEvent.at,
        canvasLatencyMs: proof.canvasAt - selectionEvent.at,
        changedPixels: proof.changedPixels,
      });
    }
    mounted.handle.selectTarget(null);
    await waitForCapturedFrame(mounted, instrumentation);
  } finally {
    instrumentation.stopCanvasCapture();
  }
  return samples;
}

async function measurePatchLatency(
  mounted: MountedViewer,
  instrumentation: BenchmarkInstrumentation,
  count: number,
): Promise<LatencySample[]> {
  mounted.adapter.pause();
  instrumentation.startCanvasCapture();
  const samples: LatencySample[] = [];
  let value: "probe-hidden" | "ready" = "probe-hidden";
  try {
    await waitForCapturedFrame(mounted, instrumentation);
    for (let index = 0; index < count; index += 1) {
      const before = instrumentation.canvasFrame();
      if (before === null) throw new Error("Patch baseline Canvas frame is unavailable.");
      const emission = mounted.adapter.emitProbe(VISIBLE_PROBE_INDEX, value);
      const proof = await waitForCanvasProof(
        instrumentation,
        before,
        () =>
          targetHasAlarm(mounted.handle.getSnapshot(), fixtureTargetId(VISIBLE_PROBE_INDEX)) ===
          (value === "probe-hidden"),
      );
      samples.push({
        index,
        startedAt: emission.emittedAt,
        eventAt: emission.emittedAt,
        snapshotAt: proof.snapshotAt,
        canvasAt: proof.canvasAt,
        snapshotLatencyMs: proof.snapshotAt - emission.emittedAt,
        canvasLatencyMs: proof.canvasAt - emission.emittedAt,
        changedPixels: proof.changedPixels,
        sequence: emission.sequence,
        value,
      });
      value = value === "ready" ? "probe-hidden" : "ready";
    }
  } finally {
    instrumentation.stopCanvasCapture();
    mounted.adapter.resume();
  }
  return samples;
}

async function waitForCanvasProof(
  instrumentation: BenchmarkInstrumentation,
  before: CapturedCanvasFrame,
  snapshotMatches: () => boolean,
) {
  const deadline = performance.now() + 2_000;
  let snapshotAt: number | null = null;
  let maximumChangedPixels = 0;
  while (performance.now() < deadline) {
    await instrumentation.nextFrame();
    if (snapshotAt === null && snapshotMatches()) snapshotAt = performance.now();
    const after = instrumentation.canvasFrame();
    if (after === null || after.sequence <= before.sequence) continue;
    (
      globalThis as typeof globalThis & { last009SelectionAfterCanvas?: string }
    ).last009SelectionAfterCanvas = after.dataUrl;
    const changedPixels = pixelDifference(before.pixels, after.pixels);
    maximumChangedPixels = Math.max(maximumChangedPixels, changedPixels);
    if (snapshotAt !== null && changedPixels > 0) {
      return { snapshotAt, canvasAt: performance.now(), changedPixels };
    }
  }
  throw new Error(
    `Snapshot and Canvas visible proof did not converge: snapshot=${snapshotAt !== null} maxChangedPixels=${maximumChangedPixels}.`,
  );
}

async function collectMemorySeries(
  mounted: MountedViewer,
  instrumentation: BenchmarkInstrumentation,
  config: ReleasePerformanceConfig,
) {
  const samples: MemorySample[] = [];
  const startedAt = performance.now();
  const count = Math.floor(config.memoryDurationMs / config.memoryIntervalMs);
  for (let index = 0; index <= count; index += 1) {
    if (index > 0) {
      const dueAt = startedAt + index * config.memoryIntervalMs;
      await delayUntil(dueAt);
    }
    mounted.adapter.pause();
    try {
      await waitUntil(
        () => instrumentation.owned().raf === 0,
        instrumentation,
        5_000,
        "memory sample RAF quiescence",
      );
      const rawJsHeapBytes = readHeapBytes();
      const forcedGcAvailable = await forceGarbageCollection(instrumentation);
      const forcedGcJsHeapBytes = forcedGcAvailable ? readHeapBytes() : null;
      const renderer = instrumentation.renderer();
      const owned = instrumentation.owned();
      samples.push({
        index,
        elapsedMs: performance.now() - startedAt,
        rawJsHeapBytes,
        forcedGcJsHeapBytes,
        domNodes: document.getElementsByTagName("*").length,
        rendererGeometries: renderer.geometries,
        rendererTextures: renderer.textures,
        ownedRaf: owned.raf,
        ownedResizeObservers: owned.resizeObservers,
        ownedListeners: owned.listeners,
        ownedIntervals: owned.intervals,
        adapterConnections: owned.adapterConnections,
        activeRenderers: owned.renderers,
      });
    } finally {
      mounted.adapter.resume();
    }
  }

  const namedSeries = {
    forcedGcJsHeapBytes: analyzeNullableSeries(samples, "forcedGcJsHeapBytes", true),
    domNodes: analyzeSeries(samples, "domNodes", false),
    rendererGeometries: analyzeSeries(samples, "rendererGeometries", false),
    rendererTextures: analyzeSeries(samples, "rendererTextures", false),
    ownedRaf: analyzeSeries(samples, "ownedRaf", false),
    ownedResizeObservers: analyzeSeries(samples, "ownedResizeObservers", false),
    ownedListeners: analyzeSeries(samples, "ownedListeners", false),
    ownedIntervals: analyzeSeries(samples, "ownedIntervals", false),
    adapterConnections: analyzeSeries(samples, "adapterConnections", false),
    activeRenderers: analyzeSeries(samples, "activeRenderers", false),
  };
  return {
    forcedGcAvailable: samples.every((sample) => sample.forcedGcJsHeapBytes !== null),
    samples,
    namedSeries,
  };
}

function analyzeSeries(
  samples: readonly MemorySample[],
  field: Exclude<keyof MemorySample, "forcedGcJsHeapBytes" | "rawJsHeapBytes">,
  bytes: boolean,
) {
  const values = samples.map((sample) => ({ elapsedMs: sample.elapsedMs, value: sample[field] }));
  return seriesSummary(values, bytes);
}

function analyzeNullableSeries(
  samples: readonly MemorySample[],
  field: "forcedGcJsHeapBytes" | "rawJsHeapBytes",
  bytes: boolean,
) {
  const values = samples.flatMap((sample) => {
    const value = sample[field];
    return value === null ? [] : [{ elapsedMs: sample.elapsedMs, value }];
  });
  return values.length < 2
    ? { available: false, slopePerMs: null, finalWithinLimit: null }
    : {
        available: true,
        ...seriesSummary(values, bytes),
      };
}

function seriesSummary(values: readonly TimedValue[], bytes: boolean) {
  const baseline = values[0]?.value ?? 0;
  const final = values.at(-1)?.value ?? 0;
  const slopePerMs = theilSenSlope(values);
  const limit = bytes ? memoryFinalLimit(baseline) : baseline;
  return {
    baseline,
    final,
    slopePerMs,
    nonPositiveSlope: slopePerMs !== null && slopePerMs <= 0,
    finalLimit: limit,
    finalWithinLimit: final <= limit,
  };
}

async function forceGarbageCollection(instrumentation: BenchmarkInstrumentation): Promise<boolean> {
  const collect = (globalThis as typeof globalThis & { gc?: () => void }).gc;
  if (collect === undefined) return false;
  collect();
  await instrumentation.nextFrame();
  return true;
}

function assertFixtureShape(fixture: ReleasePerformanceFixture): void {
  const enabledBindings = fixture.document.bindings.filter((binding) => binding.enabled);
  const uniqueTriangles = fixture.document.assets.reduce(
    (total, asset) => total + (asset.stats?.triangleCount ?? 0),
    0,
  );
  if (fixture.document.entities.length !== FIXTURE_ENTITY_COUNT)
    throw new Error("Fixture entity count mismatch.");
  if (fixture.document.targets.length !== FIXTURE_TARGET_COUNT)
    throw new Error("Fixture target count mismatch.");
  if (enabledBindings.length !== FIXTURE_BINDING_COUNT)
    throw new Error("Fixture binding count mismatch.");
  if (uniqueTriangles !== FIXTURE_UNIQUE_TRIANGLES)
    throw new Error("Fixture unique triangle count mismatch.");
  if (
    fixture.assetBytes.byteLength < FIXTURE_MIN_ASSET_BYTES ||
    fixture.assetBytes.byteLength > FIXTURE_MAX_ASSET_BYTES
  ) {
    throw new Error("Fixture compressed asset bytes are outside 12-15 MiB.");
  }
}

function assertLoadedShape(
  fixture: ReleasePerformanceFixture,
  audit: AssetAudit,
  renderer: RendererProbe,
  snapshot: ViewerSnapshot,
): void {
  const expectedHashes = [...audit.referenced].sort();
  for (const actual of [audit.requested, audit.resolved, audit.loaded]) {
    if (JSON.stringify([...actual].sort()) !== JSON.stringify(expectedHashes)) {
      throw new Error("Referenced, requested, resolved and loaded asset hashes differ.");
    }
  }
  const resolvedBytes = [...audit.resolvedBytes.values()].reduce(
    (total, value) => total + value,
    0,
  );
  if (resolvedBytes !== fixture.assetBytes.byteLength)
    throw new Error("Resolved unique asset bytes mismatch.");
  if (renderer.drawCalls > FIXTURE_MAX_DRAW_CALLS) {
    throw new Error(
      `Renderer draw-call gate failed: expected <=${FIXTURE_MAX_DRAW_CALLS}, received ${renderer.drawCalls}.`,
    );
  }
  if (renderer.triangles !== FIXTURE_UNIQUE_TRIANGLES) {
    throw new Error(
      `Renderer triangle gate failed: expected ${FIXTURE_UNIQUE_TRIANGLES}, received ${renderer.triangles}.`,
    );
  }
  if (snapshot.alarms.length !== FIXTURE_ACTIVE_ALARMS)
    throw new Error("Active alarm count gate failed.");
}

function assertPatchRate(stats: PatchRateStats): void {
  if (
    stats.configuredHz !== FIXTURE_PATCH_RATE_HZ ||
    stats.distinctPointers !== FIXTURE_BINDING_COUNT
  ) {
    throw new Error("Patch adapter shape gate failed.");
  }
  if (Math.abs(stats.actualHz - FIXTURE_PATCH_RATE_HZ) > 2) {
    throw new Error(`Patch adapter rate gate failed: ${stats.actualHz} Hz.`);
  }
}

function assertDisposed(probes: readonly OwnedResourceProbe[]): void {
  for (const [index, probe] of probes.entries()) {
    if (ownedResourceTotal(probe) !== 0) {
      throw new Error(`Owned resource dispose gate failed at activation ${index}.`);
    }
  }
}

function ownedResourceTotal(probe: OwnedResourceProbe): number {
  return (
    probe.raf +
    probe.resizeObservers +
    probe.listeners +
    probe.intervals +
    probe.adapterConnections +
    probe.renderers
  );
}

function targetHasAlarm(snapshot: ViewerSnapshot, targetId: string): boolean {
  return snapshot.alarms.some((alarm) => alarm.targetId === targetId);
}

function canvasElement(host: HTMLElement): HTMLCanvasElement {
  const canvas = host.querySelector<HTMLCanvasElement>('canvas[data-web3d-viewer="true"]');
  if (canvas === null) throw new Error("Production SceneViewer Canvas is missing.");
  return canvas;
}

function canvasEvidence(frame: CapturedCanvasFrame): CanvasEvidence {
  const pixels = frame.pixels;
  const colors = new Set<string>();
  let nonTransparentPixels = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    const alpha = pixels[index + 3] ?? 0;
    if (alpha > 0) nonTransparentPixels += 1;
    colors.add(
      `${(pixels[index] ?? 0) >> 4}:${(pixels[index + 1] ?? 0) >> 4}:${
        (pixels[index + 2] ?? 0) >> 4
      }:${alpha >> 4}`,
    );
  }
  return {
    width: frame.width,
    height: frame.height,
    distinctColors: colors.size,
    nonTransparentPixels,
  };
}

async function captureProductionFrame(
  mounted: MountedViewer,
  instrumentation: BenchmarkInstrumentation,
): Promise<CapturedCanvasFrame> {
  instrumentation.startCanvasCapture();
  try {
    return await waitForCapturedFrame(mounted, instrumentation);
  } finally {
    instrumentation.stopCanvasCapture();
  }
}

async function waitForCapturedFrame(
  mounted: MountedViewer,
  instrumentation: BenchmarkInstrumentation,
): Promise<CapturedCanvasFrame> {
  canvasElement(mounted.host);
  const before = instrumentation.canvasFrame()?.sequence ?? 0;
  mounted.handle.setView(fixtureViewId(0));
  await waitUntil(
    () => (instrumentation.canvasFrame()?.sequence ?? 0) > before,
    instrumentation,
    5_000,
    "renderer Canvas frame",
  );
  const frame = instrumentation.canvasFrame();
  if (frame === null) throw new Error("Renderer Canvas frame is unavailable.");
  return frame;
}

function pixelDifference(left: Uint8ClampedArray, right: Uint8ClampedArray): number {
  let changed = 0;
  for (let index = 0; index < Math.min(left.length, right.length); index += 4) {
    if (
      left[index] !== right[index] ||
      left[index + 1] !== right[index + 1] ||
      left[index + 2] !== right[index + 2] ||
      left[index + 3] !== right[index + 3]
    ) {
      changed += 1;
    }
  }
  return changed;
}

async function waitUntil(
  predicate: () => boolean,
  instrumentation: BenchmarkInstrumentation,
  timeoutMs: number,
  label: string,
): Promise<void> {
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    if (predicate()) return;
    await instrumentation.nextFrame();
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

async function delayUntil(dueAt: number): Promise<void> {
  const remaining = dueAt - performance.now();
  if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
}

function readHeapBytes(): number | null {
  const memory = (performance as Performance & { memory?: { readonly usedJSHeapSize?: number } })
    .memory;
  return typeof memory?.usedJSHeapSize === "number" ? memory.usedJSHeapSize : null;
}

function validateConfig(config: ReleasePerformanceConfig): void {
  for (const [name, value] of Object.entries(config)) {
    if (!Number.isFinite(value) || value <= 0)
      throw new Error(`Benchmark config ${name} must be positive.`);
  }
  if (config.memoryDurationMs < config.memoryIntervalMs) {
    throw new Error("Benchmark memory duration must include at least one interval after baseline.");
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Timed out waiting for ${label}.`)), timeoutMs),
    ),
  ]);
}

function requiredElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (element === null) throw new Error(`Benchmark element ${id} is missing.`);
  return element;
}

Object.assign(globalThis, { run009ReleasePerformance: runReleasePerformance });
