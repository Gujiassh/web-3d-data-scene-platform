import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { chromium, type CDPSession, type Page } from "@playwright/test";
import { format } from "prettier";
import { createServer } from "vite";

const VIEWPORT_WIDTH = 1440;
const VIEWPORT_HEIGHT = 900;
const WARMUP_SAMPLES = 30;
const MEASURED_SAMPLES = 300;
const POINTER_SAMPLES = WARMUP_SAMPLES + MEASURED_SAMPLES;
const TRACE_FRAMES = 120;
const repoRoot = resolve(import.meta.dirname, "../..");
const outputDirectory = resolve(repoRoot, "artifacts/performance");
const chromiumPath = process.env["SYSTEM_CHROMIUM"] ?? "/snap/bin/chromium";
const chromiumCdpUrl = process.env["SYSTEM_CHROMIUM_CDP_URL"];
const allowSoftware = process.env["HOTSPOT_CALIBRATION_ALLOW_SOFTWARE"] === "1";
const server = await createServer({
  root: repoRoot,
  logLevel: "error",
  server: { host: "127.0.0.1", port: 0, strictPort: false },
});

await server.listen();
const address = server.httpServer?.address();
if (address === null || typeof address === "string" || address === undefined) {
  await server.close();
  throw new Error("Vite did not expose a local calibration port.");
}

const browser =
  chromiumCdpUrl === undefined
    ? await chromium.launch({ executablePath: chromiumPath, headless: true })
    : await chromium.connectOverCDP(chromiumCdpUrl);
try {
  await mkdir(outputDirectory, { recursive: true });
  const context = await browser.newContext({
    viewport: { width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(`http://127.0.0.1:${address.port}/benchmarks/007-hotspot-calibration/`);
  const profile = await browserProfile(page);
  assertBrowserProfile(profile, allowSoftware);
  const cdp = await context.newCDPSession(page);

  const result = await page.evaluate(async () => {
    const run = (
      globalThis as typeof globalThis & {
        run007HotspotCalibration?: () => Promise<unknown>;
      }
    ).run007HotspotCalibration;
    if (run === undefined) throw new Error("007 hotspot calibration harness did not initialize.");
    return run();
  });
  if (!isCalibrationResult(result)) throw new Error("Calibration result shape is invalid.");

  const zeroTrace = await captureTrace(cdp, page, "zero", TRACE_FRAMES);
  const markerTrace = await captureTrace(cdp, page, "surface-200", TRACE_FRAMES);
  const idle = {
    editIdle: await observeIdle(page, "edit-idle"),
    placementDisabled: await observeIdle(page, "placement-disabled"),
    run: await observeIdle(page, "run"),
  };
  const pointerTrace = await capturePointerTrace(cdp, page);
  const pointerPreview = {
    ...pointerTrace.pointerPreview,
    eventToPaint: pointerTrace.eventToPaint,
    paintCorrelationCount: pointerTrace.correlations.length,
  };
  const activation = await runActivation(page);
  const collectedBeforeCleanup = await collectGarbage(cdp);
  const memoryBeforeCleanup = await readBrowserMemory(page);
  const cleanup = await page.evaluate(() => {
    const run = (
      globalThis as typeof globalThis & {
        run007CleanupCalibration?: () => CleanupResult;
      }
    ).run007CleanupCalibration;
    if (run === undefined) throw new Error("Cleanup calibration is unavailable.");
    return run();
  });
  const collectedAfterCleanup = await collectGarbage(cdp);
  const memoryAfterCleanup = await readBrowserMemory(page);
  const browserMemory = {
    garbageCollectionAvailable: collectedBeforeCleanup && collectedAfterCleanup,
    beforeCleanup: memoryBeforeCleanup,
    afterCleanup: memoryAfterCleanup,
    usedHeapDelta:
      memoryBeforeCleanup === null || memoryAfterCleanup === null
        ? null
        : memoryAfterCleanup.usedJSHeapSize - memoryBeforeCleanup.usedJSHeapSize,
  };
  if (pageErrors.length > 0) throw new Error(`Calibration page errors: ${pageErrors.join(" | ")}`);

  const images = await page.evaluate(() => {
    const source = globalThis as typeof globalThis & {
      last007HotspotZeroCanvas?: string;
      last007HotspotCalibrationCanvas?: string;
    };
    return {
      zero: source.last007HotspotZeroCanvas,
      markers: source.last007HotspotCalibrationCanvas,
    };
  });
  if (images.zero === undefined || images.markers === undefined) {
    throw new Error("Zero/200 Canvas evidence was not captured.");
  }

  const fixtureJson = await format(JSON.stringify(result.fixture), {
    parser: "json",
    printWidth: 100,
  });
  const fixtureSha256 = createHash("sha256").update(fixtureJson).digest("hex");
  const sourceHashes = await hashHarnessSources();
  const report = {
    generatedAt: new Date().toISOString(),
    acceptanceEligible: !allowSoftware,
    browser: {
      userAgent: profile.userAgent,
      renderer: profile.renderer,
      vendor: profile.vendor,
      memory: browserMemory,
    },
    viewport: profile.viewport,
    fixture: {
      path: "artifacts/performance/007-hotspot-calibration-fixture.json",
      sha256: fixtureSha256,
    },
    harnessSource: sourceHashes,
    protocol: {
      markerCount: 200,
      warmupSamples: WARMUP_SAMPLES,
      measuredSamples: MEASURED_SAMPLES,
      traceFrames: TRACE_FRAMES,
      cpuFrameWorkP95LimitMs: 16.7,
      presentedFrameIntervalP95LimitMs: 17.5,
      markerCpuP95DeltaLimitMs: 2,
      markerPickP95LimitMs: 2,
      pointerPreviewP95LimitMs: 50,
      proxyErrorLimitCssPixels: 1,
      droppedFrameIntervalMs: 25,
      idleObservationMsPerMode: 2000,
    },
    result,
    browserEvidence: {
      trace: { zero: zeroTrace.summary, markers: markerTrace.summary },
      idle,
      pointerPreview,
      activation,
      cleanup,
    },
  };
  assertAcceptance(report);
  const samplesJsonl = sampleJsonLines({
    result,
    browserEvidence: { pointerPreview, activation },
  });
  const traceEventsJsonl = traceEventJsonLines(zeroTrace, markerTrace, pointerTrace.correlations);
  const samplesSha256 = createHash("sha256").update(samplesJsonl).digest("hex");
  const traceEventsSha256 = createHash("sha256").update(traceEventsJsonl).digest("hex");
  const reportForWrite = {
    ...report,
    rawEvidence: {
      samples: {
        path: "artifacts/performance/007-hotspot-calibration-samples.jsonl",
        sha256: samplesSha256,
      },
      traceEvents: {
        path: "artifacts/performance/007-hotspot-calibration-trace-events.jsonl",
        sha256: traceEventsSha256,
      },
    },
    result: withoutSamples(result),
    browserEvidence: {
      ...report.browserEvidence,
      pointerPreview: withoutSamples(pointerPreview),
      activation: withoutSamples(activation),
    },
  };
  const [reportJson, traceJson] = await Promise.all([
    format(JSON.stringify(reportForWrite), { parser: "json", printWidth: 100 }),
    format(
      JSON.stringify({
        zero: zeroTrace.summary,
        markers: markerTrace.summary,
        rawEvents: reportForWrite.rawEvidence.traceEvents,
      }),
      { parser: "json", printWidth: 100 },
    ),
  ]);

  const paths = {
    report: resolve(outputDirectory, "007-hotspot-calibration.json"),
    fixture: resolve(outputDirectory, "007-hotspot-calibration-fixture.json"),
    zeroCanvas: resolve(outputDirectory, "007-hotspot-calibration-zero.png"),
    markerCanvas: resolve(outputDirectory, "007-hotspot-calibration-canvas.png"),
    trace: resolve(outputDirectory, "007-hotspot-calibration-trace.json"),
    samples: resolve(outputDirectory, "007-hotspot-calibration-samples.jsonl"),
    traceEvents: resolve(outputDirectory, "007-hotspot-calibration-trace-events.jsonl"),
  };
  await Promise.all([
    writeFile(paths.report, reportJson, "utf8"),
    writeFile(paths.fixture, fixtureJson, "utf8"),
    writeFile(paths.zeroCanvas, decodeDataUrl(images.zero)),
    writeFile(paths.markerCanvas, decodeDataUrl(images.markers)),
    writeFile(paths.trace, traceJson, "utf8"),
    writeFile(paths.samples, samplesJsonl, "utf8"),
    writeFile(paths.traceEvents, traceEventsJsonl, "utf8"),
  ]);
  process.stdout.write(`007-hotspot-calibration report=${paths.report}\n`);
  process.stdout.write(`007-hotspot-calibration zero=${paths.zeroCanvas}\n`);
  process.stdout.write(`007-hotspot-calibration markers=${paths.markerCanvas}\n`);
  process.stdout.write(`007-hotspot-calibration trace=${paths.trace}\n`);
  process.stdout.write(`007-hotspot-calibration samples=${paths.samples}\n`);
  process.stdout.write(`007-hotspot-calibration trace-events=${paths.traceEvents}\n`);
  process.stdout.write(
    `${JSON.stringify({
      fixtureSha256,
      renderer: profile.renderer,
      zeroCpuP95Ms: result.states[0]?.cpuWork.p95Ms,
      markerCpuP95Ms: result.states[1]?.cpuWork.p95Ms,
      markerCpuDeltaP95Ms: result.markerCpuOverheadP95Ms,
      markerFrameIntervalP95Ms: result.states[1]?.frameInterval.p95Ms,
      pointerPreviewP95Ms: pointerPreview.eventToPaint.p95Ms,
      pointerPaintPairCount: pointerTrace.correlations.length,
    })}\n`,
  );
  await context.close();
} finally {
  await browser.close();
  await server.close();
}

interface MetricResult {
  readonly measuredCount: number;
  readonly medianMs: number;
  readonly p95Ms: number;
  readonly maxMs: number;
  readonly samplesMs: readonly number[];
}

interface StateResult {
  readonly state: string;
  readonly warmupCount: number;
  readonly measuredCount: number;
  readonly cpuWork: MetricResult;
  readonly frameInterval: MetricResult;
  readonly surfaceResolution: MetricResult;
  readonly markerSync: MetricResult;
  readonly overlayUpdate: MetricResult;
  readonly drawCalls: number;
  readonly visibleMarkers: number;
  readonly visibleDomProxies: number;
  readonly resolvedAnchorCount: number;
  readonly missedFrameCount: number;
}

interface CalibrationResult {
  readonly fixture: unknown;
  readonly states: readonly StateResult[];
  readonly markerCpuOverheadP95Ms: number;
  readonly markerFrameIntervalDeltaP95Ms: number;
  readonly identityResolution: {
    readonly expectedResolvedCount: number;
    readonly actualResolvedCount: number;
    readonly visibleIds: readonly string[];
    readonly unresolvedIds: readonly string[];
    readonly unresolvedDomAbsent: boolean;
    readonly unresolvedPicksAbsent: boolean;
  };
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
    readonly transparentMaterialPolicy: string;
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
  readonly eventToPaint: MetricResult;
  readonly paintCorrelationCount: number;
  readonly validHitCount: number;
  readonly invalidHitCount: number;
  readonly surfaceRaycastCount: number;
  readonly latestPointerErrorCssPixels: number;
}

interface TraceEvent {
  readonly name?: string | undefined;
  readonly cat?: string | undefined;
  readonly ph?: string | undefined;
  readonly ts?: number | undefined;
  readonly dur?: number | undefined;
}

interface TracePhase {
  readonly count: number;
  readonly totalMs: number;
  readonly maxMs: number;
  readonly perFrame: number;
}

interface TraceSummary {
  readonly state: "zero" | "surface-200";
  readonly frameCount: number;
  readonly style: TracePhase;
  readonly layout: TracePhase;
  readonly paint: TracePhase;
  readonly composite: TracePhase;
  readonly runTasksOver50Ms: number;
}

interface CalibrationReport {
  readonly acceptanceEligible: boolean;
  readonly result: CalibrationResult;
  readonly browserEvidence: {
    readonly trace: { readonly zero: TraceSummary; readonly markers: TraceSummary };
    readonly idle: Record<
      string,
      {
        readonly mode: string;
        readonly durationMs: number;
        readonly beforeRaycasts: number;
        readonly afterRaycasts: number;
      }
    >;
    readonly pointerPreview: PointerPreviewResult;
    readonly activation: {
      readonly ids: readonly string[];
      readonly callback: MetricResult;
    };
    readonly cleanup: CleanupResult;
  };
}

interface CleanupResult {
  readonly cycleCount: number;
  readonly baseline: CleanupSnapshot;
  readonly after: CleanupSnapshot;
  readonly cycleLiveProxyCounts: readonly number[];
  readonly cycleDisposedProxyCounts: readonly number[];
  readonly pointerCaptureActive: boolean;
  readonly pointerListenerAttached: boolean;
  readonly pendingPointerRafCount: number;
}

interface CleanupSnapshot {
  readonly sceneChildren: number;
  readonly proxyCount: number;
  readonly geometries: number;
  readonly textures: number;
}

async function browserProfile(page: Page) {
  return page.evaluate(() => {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    const extension = gl === null ? null : gl.getExtension("WEBGL_debug_renderer_info");
    return {
      userAgent: navigator.userAgent,
      renderer:
        gl !== null && extension !== null
          ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL)
          : "unavailable",
      vendor:
        gl !== null && extension !== null
          ? gl.getParameter(extension.UNMASKED_VENDOR_WEBGL)
          : "unavailable",
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        deviceScaleFactor: window.devicePixelRatio,
      },
    };
  });
}

async function captureTrace(
  cdp: CDPSession,
  page: Page,
  state: TraceSummary["state"],
  frameCount: number,
) {
  const events: TraceEvent[] = [];
  const accept = (event: { value: TraceEvent[] }): void => {
    events.push(...event.value);
  };
  cdp.on("Tracing.dataCollected", accept);
  try {
    await cdp.send("Tracing.start", {
      categories: "devtools.timeline,disabled-by-default-devtools.timeline.frame,blink.user_timing",
      transferMode: "ReportEvents",
    });
    await page.evaluate(
      async ({ state: requestedState, frameCount: requestedFrameCount }) => {
        const run = (
          globalThis as typeof globalThis & {
            run007TraceFrames?: (state: "zero" | "surface-200", count: number) => Promise<unknown>;
          }
        ).run007TraceFrames;
        if (run === undefined) throw new Error("Trace workload is unavailable.");
        await run(requestedState, requestedFrameCount);
      },
      { state, frameCount },
    );
    const completed = new Promise<void>((resolveComplete) => {
      cdp.once("Tracing.tracingComplete", () => resolveComplete());
    });
    await cdp.send("Tracing.end");
    await completed;
  } finally {
    cdp.off("Tracing.dataCollected", accept);
  }
  const names = new Set([
    "UpdateLayoutTree",
    "RecalculateStyles",
    "Layout",
    "PrePaint",
    "Paint",
    "PaintImage",
    "CompositeLayers",
    "Layerize",
    "Commit",
    "RunTask",
  ]);
  const relevantEvents = events
    .filter((event) => event.name !== undefined && names.has(event.name))
    .map((event) => ({
      name: event.name,
      cat: event.cat,
      ph: event.ph,
      ts: event.ts,
      dur: event.dur,
    }));
  return {
    summary: summarizeTrace(state, frameCount, relevantEvents),
    relevantEvents,
  };
}

function summarizeTrace(
  state: TraceSummary["state"],
  frameCount: number,
  events: readonly TraceEvent[],
): TraceSummary {
  const phase = (names: readonly string[]): TracePhase => {
    const durations = events
      .filter((event) => event.name !== undefined && names.includes(event.name))
      .map((event) => (event.dur ?? 0) / 1000);
    return {
      count: durations.length,
      totalMs: durations.reduce((total, value) => total + value, 0),
      maxMs: Math.max(0, ...durations),
      perFrame: durations.length / frameCount,
    };
  };
  return {
    state,
    frameCount,
    style: phase(["UpdateLayoutTree", "RecalculateStyles"]),
    layout: phase(["Layout"]),
    paint: phase(["PrePaint", "Paint", "PaintImage"]),
    composite: phase(["CompositeLayers", "Layerize", "Commit"]),
    runTasksOver50Ms: events.filter(
      (event) => event.name === "RunTask" && (event.dur ?? 0) > 50_000,
    ).length,
  };
}

async function observeIdle(page: Page, mode: "edit-idle" | "placement-disabled" | "run") {
  await page.evaluate((requestedMode) => {
    const setMode = (
      globalThis as typeof globalThis & {
        set007InteractionMode?: (value: typeof requestedMode) => void;
      }
    ).set007InteractionMode;
    if (setMode === undefined) throw new Error("Interaction mode gate is unavailable.");
    setMode(requestedMode);
  }, mode);
  const beforeRaycasts = await currentRaycasts(page);
  const startedAt = Date.now();
  let eventIndex = 0;
  while (Date.now() - startedAt < 2000) {
    await page.mouse.move(200 + (eventIndex % 12) * 80, 180 + (eventIndex % 6) * 90);
    await page.waitForTimeout(100);
    eventIndex += 1;
  }
  const durationMs = Date.now() - startedAt;
  const afterRaycasts = await currentRaycasts(page);
  return { mode, durationMs, beforeRaycasts, afterRaycasts };
}

async function capturePointerTrace(cdp: CDPSession, page: Page) {
  const events: TraceEvent[] = [];
  const accept = (event: { value: TraceEvent[] }): void => {
    events.push(...event.value);
  };
  cdp.on("Tracing.dataCollected", accept);
  try {
    await cdp.send("Tracing.start", {
      categories: "devtools.timeline,blink.user_timing",
      transferMode: "ReportEvents",
    });
    const pointerPreview = await runPointerPreview(page);
    const completed = new Promise<void>((resolveComplete) => {
      cdp.once("Tracing.tracingComplete", () => resolveComplete());
    });
    await cdp.send("Tracing.end");
    await completed;
    return {
      pointerPreview,
      ...pointerToPaintEvidence(events),
    };
  } finally {
    cdp.off("Tracing.dataCollected", accept);
  }
}

async function runPointerPreview(page: Page) {
  await page.evaluate((expectedCount) => {
    const begin = (
      globalThis as typeof globalThis & {
        begin007PointerPreviewCalibration?: (count: number) => void;
      }
    ).begin007PointerPreviewCalibration;
    if (begin === undefined) throw new Error("Pointer preview calibration is unavailable.");
    begin(expectedCount);
  }, POINTER_SAMPLES);
  for (let index = 0; index < POINTER_SAMPLES; index += 1) {
    if (index % 2 === 1) {
      const validIndex = Math.floor(index / 2);
      await page.mouse.move(
        280 + (validIndex % 12) * 72,
        180 + (Math.floor(validIndex / 12) % 7) * 76,
      );
    } else {
      await page.mouse.move(30 + (index % 4), 30 + (index % 3));
    }
    await page.evaluate(
      () => new Promise<void>((resolveFrame) => requestAnimationFrame(() => resolveFrame())),
    );
  }
  await page.evaluate(
    () =>
      new Promise<void>((resolveFrame) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolveFrame())),
      ),
  );
  return page.evaluate(() => {
    const finish = (
      globalThis as typeof globalThis & {
        finish007PointerPreviewCalibration?: () => PointerPreviewResult;
      }
    ).finish007PointerPreviewCalibration;
    if (finish === undefined) throw new Error("Pointer preview result is unavailable.");
    return finish();
  });
}

interface PointerPaintCorrelation {
  readonly markName: string;
  readonly markTimeMicroseconds: number;
  readonly paintStartMicroseconds: number;
  readonly paintDurationMicroseconds: number;
  readonly latencyMs: number;
}

function pointerToPaintEvidence(events: readonly TraceEvent[]) {
  const marks = events
    .filter((event) => event.name?.startsWith("007-pointer-preview-") === true)
    .sort((left, right) => (left.ts ?? 0) - (right.ts ?? 0));
  const paints = events
    .filter((event) => event.name === "Paint" && event.ph === "X")
    .sort((left, right) => (left.ts ?? 0) - (right.ts ?? 0));
  if (marks.length !== POINTER_SAMPLES) {
    throw new Error(`Pointer trace expected ${POINTER_SAMPLES} marks, received ${marks.length}.`);
  }
  const correlations: PointerPaintCorrelation[] = marks.map((mark) => {
    const markTime = mark.ts ?? 0;
    const paint = paints.find((event) => (event.ts ?? 0) >= markTime);
    if (paint === undefined) {
      throw new Error(`Pointer mark ${mark.name} has no following Paint event.`);
    }
    const paintStart = paint.ts ?? 0;
    const paintDuration = paint.dur ?? 0;
    return {
      markName: mark.name ?? "",
      markTimeMicroseconds: markTime,
      paintStartMicroseconds: paintStart,
      paintDurationMicroseconds: paintDuration,
      latencyMs: (paintStart + paintDuration - markTime) / 1000,
    };
  });
  if (new Set(correlations.map((value) => value.markName)).size !== POINTER_SAMPLES) {
    throw new Error("Pointer trace marks are not unique.");
  }
  const eventToPaint = summarizeMetric(
    correlations.slice(WARMUP_SAMPLES).map((value) => value.latencyMs),
  );
  const recomputedP95 = percentile(
    correlations
      .slice(WARMUP_SAMPLES)
      .map((value) => value.latencyMs)
      .sort((left, right) => left - right),
    0.95,
  );
  if (recomputedP95 !== eventToPaint.p95Ms) {
    throw new Error("Pointer trace correlation p95 cannot reproduce the summary.");
  }
  return { eventToPaint, correlations };
}

function summarizeMetric(values: readonly number[]): MetricResult {
  const sorted = [...values].sort((left, right) => left - right);
  return {
    measuredCount: values.length,
    medianMs: percentile(sorted, 0.5),
    p95Ms: percentile(sorted, 0.95),
    maxMs: sorted.at(-1) ?? 0,
    samplesMs: [...values],
  };
}

function percentile(sorted: readonly number[], value: number): number {
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * value) - 1)] ?? 0;
}

async function runActivation(page: Page) {
  await page.evaluate(() => {
    const begin = (globalThis as typeof globalThis & { begin007ActivationCalibration?: () => void })
      .begin007ActivationCalibration;
    if (begin === undefined) throw new Error("Activation calibration is unavailable.");
    begin();
  });
  const center = await page.evaluate(() => {
    const getCenter = (
      globalThis as typeof globalThis & {
        proxyCenterFor007Calibration?: (
          id: string,
        ) => { readonly x: number; readonly y: number } | null;
      }
    ).proxyCenterFor007Calibration;
    if (getCenter === undefined) throw new Error("Proxy center lookup is unavailable.");
    return getCenter("surface-110");
  });
  if (center === null) throw new Error("Activation marker surface-110 is not visible.");
  await page.mouse.click(center.x, center.y);
  await page.mouse.click(20, 20);
  return page.evaluate(() => {
    const finish = (
      globalThis as typeof globalThis & {
        finish007ActivationCalibration?: () => {
          readonly ids: readonly string[];
          readonly callback: MetricResult;
        };
      }
    ).finish007ActivationCalibration;
    if (finish === undefined) throw new Error("Activation result is unavailable.");
    return finish();
  });
}

function assertAcceptance(report: CalibrationReport): void {
  const { result } = report;
  const [zero, markers] = result.states;
  if (zero?.state !== "zero" || markers?.state !== "surface-200" || result.states.length !== 2) {
    throw new Error("Calibration requires ordered zero and surface-200 states.");
  }
  for (const state of result.states) {
    if (
      state.warmupCount !== WARMUP_SAMPLES ||
      state.measuredCount !== MEASURED_SAMPLES ||
      state.cpuWork.measuredCount !== MEASURED_SAMPLES ||
      state.frameInterval.measuredCount !== MEASURED_SAMPLES
    ) {
      throw new Error(`Calibration state ${state.state} has an invalid sample count.`);
    }
    if (
      report.acceptanceEligible &&
      (state.missedFrameCount !== 0 || state.frameInterval.p95Ms > 17.5)
    ) {
      throw new Error(
        `Calibration state ${state.state} missed the presentation budget: p95=${state.frameInterval.p95Ms} missed=${state.missedFrameCount}.`,
      );
    }
  }
  if (
    zero.visibleMarkers !== 0 ||
    zero.visibleDomProxies !== 0 ||
    markers.visibleMarkers !== 200 ||
    markers.visibleDomProxies !== 200 ||
    markers.resolvedAnchorCount !== 200
  ) {
    throw new Error("The zero/200 marker and exact-resolution oracle failed.");
  }
  if (
    result.identityResolution.expectedResolvedCount !== 1 ||
    result.identityResolution.actualResolvedCount !== 1 ||
    !sameStrings(result.identityResolution.visibleIds, ["identity-valid"]) ||
    result.identityResolution.unresolvedIds.length !== 3 ||
    !result.identityResolution.unresolvedDomAbsent ||
    !result.identityResolution.unresolvedPicksAbsent
  ) {
    throw new Error("Exact entity/hash/node negative resolution oracle failed.");
  }
  if (
    report.acceptanceEligible &&
    (markers.cpuWork.p95Ms > 16.7 || result.markerCpuOverheadP95Ms > 2)
  ) {
    throw new Error(
      `Marker CPU budget exceeded: total=${markers.cpuWork.p95Ms}ms delta=${result.markerCpuOverheadP95Ms}ms.`,
    );
  }
  if (
    result.resources.markerDrawCalls !== 1 ||
    result.resources.markerTriangles <= 0 ||
    result.resources.domProxyCount !== 200
  ) {
    throw new Error("Marker resources no longer use one instanced draw call and 200 DOM proxies.");
  }
  if (
    result.projection.maxProxyErrorCssPixels > 1 ||
    result.projection.movedCameraProxyErrorCssPixels > 1 ||
    !result.projection.focusRetainedAfterCameraMove ||
    result.projection.accessibleNameCount !== 200 ||
    result.projection.uniqueAccessibleNameCount !== 200
  ) {
    throw new Error("DOM proxy projection, focus, or accessible-name oracle failed.");
  }
  if (
    result.picking.measuredCount !== MEASURED_SAMPLES ||
    result.picking.correctPickCount !== MEASURED_SAMPLES ||
    (report.acceptanceEligible && result.picking.p95Ms > 2) ||
    result.picking.pickedId !== result.picking.expectedId ||
    result.picking.overlapPickedId !== result.picking.overlapExpectedId ||
    result.picking.missPickedId !== null
  ) {
    throw new Error("Marker picking identity, overlap, miss, or timing oracle failed.");
  }
  if (
    result.occlusion.pairCount !== 50 ||
    !sameStrings(result.occlusion.expectedVisibleIds, result.occlusion.actualVisibleIds) ||
    !sameStrings(
      result.occlusion.movedExpectedVisibleIds,
      result.occlusion.movedActualVisibleIds,
    ) ||
    result.occlusion.staticFlickerCount !== 0 ||
    result.occlusion.occludedPickId !== null ||
    result.occlusion.transparentMaterialPolicy !== "not-an-occluder" ||
    !result.occlusion.transparentProbeVisible ||
    result.occlusion.cameraMotionProbe.visibleBeforeMove ||
    !result.occlusion.cameraMotionProbe.visibleAfterMove
  ) {
    throw new Error(
      `Opaque occlusion, transform update, flicker, or occluded-pick oracle failed: initial=${result.occlusion.actualVisibleIds.length}/${result.occlusion.expectedVisibleIds.length} moved=${result.occlusion.movedActualVisibleIds.length}/${result.occlusion.movedExpectedVisibleIds.length} flicker=${result.occlusion.staticFlickerCount} pick=${String(result.occlusion.occludedPickId)} transparent=${result.occlusion.transparentProbeVisible} camera=${result.occlusion.cameraMotionProbe.visibleBeforeMove}->${result.occlusion.cameraMotionProbe.visibleAfterMove}.`,
    );
  }
  if (
    report.acceptanceEligible &&
    result.gpu.supported &&
    (result.gpu.warmupCount !== WARMUP_SAMPLES ||
      result.gpu.metric?.measuredCount !== MEASURED_SAMPLES ||
      result.gpu.metric.p95Ms > 16.7)
  ) {
    throw new Error("GPU timer query sample shape or budget failed.");
  }
  if (
    result.canvas.width !== VIEWPORT_WIDTH ||
    result.canvas.height !== VIEWPORT_HEIGHT ||
    result.canvas.distinctColors <= 2 ||
    result.canvas.expectedMarkerLocations !== 200 ||
    result.canvas.detectedMarkerLocations !== 200
  ) {
    throw new Error("The 200-marker Canvas pixel oracle failed.");
  }
  if (report.acceptanceEligible && result.longTasks.count !== 0) {
    throw new Error(
      `Calibration produced ${result.longTasks.count} long task(s), max=${result.longTasks.maxMs}ms.`,
    );
  }

  const pointer = report.browserEvidence.pointerPreview;
  if (
    pointer.warmupCount !== WARMUP_SAMPLES ||
    pointer.measuredCount !== MEASURED_SAMPLES ||
    pointer.process.measuredCount !== MEASURED_SAMPLES ||
    pointer.eventToNextRaf.measuredCount !== MEASURED_SAMPLES ||
    pointer.eventToPaint.measuredCount !== MEASURED_SAMPLES ||
    pointer.paintCorrelationCount !== POINTER_SAMPLES ||
    pointer.validHitCount !== POINTER_SAMPLES / 2 ||
    pointer.invalidHitCount !== POINTER_SAMPLES / 2 ||
    pointer.surfaceRaycastCount !== POINTER_SAMPLES ||
    (report.acceptanceEligible && pointer.eventToPaint.p95Ms > 50) ||
    pointer.latestPointerErrorCssPixels > 1
  ) {
    throw new Error("Real pointer-to-preview latency, validity, or latest-position oracle failed.");
  }
  for (const idle of Object.values(report.browserEvidence.idle)) {
    if (idle.durationMs < 2000 || idle.beforeRaycasts !== idle.afterRaycasts) {
      throw new Error(`Idle model-surface raycast gate failed in ${idle.mode}.`);
    }
  }
  if (
    report.browserEvidence.activation.ids.length !== 1 ||
    report.browserEvidence.activation.ids[0] !== "surface-110" ||
    report.browserEvidence.activation.callback.measuredCount !== 1
  ) {
    throw new Error("One trusted pointer activation did not emit exactly one hotspot ID.");
  }
  const cleanup = report.browserEvidence.cleanup;
  if (
    cleanup.cycleCount !== 5 ||
    cleanup.cycleLiveProxyCounts.some((count) => count !== 200) ||
    cleanup.cycleDisposedProxyCounts.some((count) => count !== 0) ||
    JSON.stringify(cleanup.baseline) !== JSON.stringify(cleanup.after) ||
    cleanup.pointerCaptureActive ||
    cleanup.pointerListenerAttached ||
    cleanup.pendingPointerRafCount !== 0
  ) {
    throw new Error("Repeated create/update/dispose cleanup oracle failed.");
  }
  for (const trace of [report.browserEvidence.trace.zero, report.browserEvidence.trace.markers]) {
    if (
      trace.frameCount !== TRACE_FRAMES ||
      trace.style.count > TRACE_FRAMES * 2 ||
      trace.layout.count > TRACE_FRAMES * 2 ||
      (report.acceptanceEligible && trace.runTasksOver50Ms !== 0)
    ) {
      throw new Error(`Chrome trace browser-pipeline gate failed in ${trace.state}.`);
    }
  }
}

function assertBrowserProfile(
  profile: {
    readonly renderer: unknown;
    readonly viewport: {
      readonly width: number;
      readonly height: number;
      readonly deviceScaleFactor: number;
    };
  },
  allowSoftwareRendering: boolean,
): void {
  if (
    !allowSoftwareRendering &&
    (typeof profile.renderer !== "string" ||
      /swiftshader|llvmpipe|software|unavailable/iu.test(profile.renderer))
  ) {
    throw new Error(
      `Performance acceptance requires hardware rendering, received: ${String(profile.renderer)}`,
    );
  }
  const { width, height, deviceScaleFactor } = profile.viewport;
  if (width !== VIEWPORT_WIDTH || height !== VIEWPORT_HEIGHT || deviceScaleFactor !== 1) {
    throw new Error(
      `Calibration requires ${VIEWPORT_WIDTH}x${VIEWPORT_HEIGHT} DPR1, received ${width}x${height} DPR${deviceScaleFactor}.`,
    );
  }
}

function isCalibrationResult(value: unknown): value is CalibrationResult {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<CalibrationResult>;
  return (
    candidate.fixture !== undefined &&
    Array.isArray(candidate.states) &&
    typeof candidate.markerCpuOverheadP95Ms === "number" &&
    typeof candidate.markerFrameIntervalDeltaP95Ms === "number" &&
    typeof candidate.identityResolution === "object" &&
    candidate.identityResolution !== null &&
    typeof candidate.projection === "object" &&
    candidate.projection !== null &&
    typeof candidate.picking === "object" &&
    candidate.picking !== null &&
    typeof candidate.occlusion === "object" &&
    candidate.occlusion !== null &&
    typeof candidate.gpu === "object" &&
    candidate.gpu !== null &&
    typeof candidate.resources === "object" &&
    candidate.resources !== null &&
    typeof candidate.canvas === "object" &&
    candidate.canvas !== null
  );
}

async function currentRaycasts(page: Page): Promise<number> {
  return page.evaluate(() => {
    const current = (
      globalThis as typeof globalThis & { current007SurfaceRaycastCount?: () => number }
    ).current007SurfaceRaycastCount;
    if (current === undefined) throw new Error("Surface raycast counter is unavailable.");
    return current();
  });
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function decodeDataUrl(value: string): Buffer {
  return Buffer.from(value.slice(value.indexOf(",") + 1), "base64");
}

async function readBrowserMemory(page: Page) {
  return page.evaluate(() => {
    const memory = (
      performance as Performance & {
        memory?: {
          readonly jsHeapSizeLimit: number;
          readonly totalJSHeapSize: number;
          readonly usedJSHeapSize: number;
        };
      }
    ).memory;
    return memory === undefined
      ? null
      : {
          jsHeapSizeLimit: memory.jsHeapSizeLimit,
          totalJSHeapSize: memory.totalJSHeapSize,
          usedJSHeapSize: memory.usedJSHeapSize,
        };
  });
}

async function collectGarbage(cdp: CDPSession): Promise<boolean> {
  try {
    await cdp.send("HeapProfiler.collectGarbage");
    return true;
  } catch {
    return false;
  }
}

async function hashHarnessSources() {
  const relativePaths = [
    "benchmarks/007-hotspot-calibration/index.html",
    "benchmarks/007-hotspot-calibration/main.ts",
    "benchmarks/007-hotspot-calibration/run.mts",
    "packages/runtime/src/hotspots/hotspot-overlay.ts",
    "packages/runtime/src/hotspots/surface-index.ts",
  ];
  return Promise.all(
    relativePaths.map(async (path) => {
      const bytes = await readFile(resolve(repoRoot, path));
      return { path, sha256: createHash("sha256").update(bytes).digest("hex") };
    }),
  );
}

function sampleJsonLines(value: unknown): string {
  const lines: string[] = [];
  const visit = (current: unknown, path: readonly string[]): void => {
    if (typeof current !== "object" || current === null) return;
    if (Array.isArray(current)) {
      current.forEach((entry, index) => visit(entry, [...path, String(index)]));
      return;
    }
    const record = current as Record<string, unknown>;
    if (
      Array.isArray(record["samplesMs"]) &&
      record["samplesMs"].every((sample) => typeof sample === "number")
    ) {
      lines.push(JSON.stringify({ metric: path.join("."), samplesMs: record["samplesMs"] }));
    }
    Object.entries(record).forEach(([key, entry]) => {
      if (key !== "samplesMs") visit(entry, [...path, key]);
    });
  };
  visit(value, []);
  return `${lines.join("\n")}\n`;
}

function traceEventJsonLines(
  zero: Awaited<ReturnType<typeof captureTrace>>,
  markers: Awaited<ReturnType<typeof captureTrace>>,
  pointerCorrelations: readonly PointerPaintCorrelation[],
): string {
  const lines = [
    ...zero.relevantEvents.map((event) => JSON.stringify({ state: "zero", ...event })),
    ...markers.relevantEvents.map((event) => JSON.stringify({ state: "surface-200", ...event })),
    ...pointerCorrelations.map((correlation) =>
      JSON.stringify({
        state: "pointer-preview",
        type: "mark-paint-correlation",
        ...correlation,
      }),
    ),
  ];
  return `${lines.join("\n")}\n`;
}

function withoutSamples<Value>(value: Value): Value {
  return JSON.parse(
    JSON.stringify(value, (key, current) => (key === "samplesMs" ? undefined : current)),
  ) as Value;
}
