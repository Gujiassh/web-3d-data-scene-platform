import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { cpus, freemem, platform, release, totalmem } from "node:os";
import { resolve } from "node:path";

import { chromium, type Page } from "@playwright/test";
import { createServer } from "vite";

import { generatePerformanceFixture } from "./generate-fixture.mts";

interface BenchmarkConfig {
  readonly warmupMs: number;
  readonly measurementMs: number;
  readonly activationCount: number;
  readonly latencySampleCount: number;
  readonly memoryDurationMs: number;
  readonly memoryIntervalMs: number;
}

const CANONICAL_CONFIG: BenchmarkConfig = Object.freeze({
  warmupMs: 5_000,
  measurementMs: 60_000,
  activationCount: 20,
  latencySampleCount: 20,
  memoryDurationMs: 30 * 60_000,
  memoryIntervalMs: 60_000,
});
const SMOKE_CONFIG: BenchmarkConfig = Object.freeze({
  warmupMs: 500,
  measurementMs: 1_500,
  activationCount: 3,
  latencySampleCount: 3,
  memoryDurationMs: 1_500,
  memoryIntervalMs: 500,
});
const repoRoot = resolve(import.meta.dirname, "../..");
const outputDirectory = resolve(
  process.env["RELEASE_PERF_OUTPUT_DIR"] ?? "/home/cc/tmp/web3d-release-performance",
);
const chromiumPath = process.env["SYSTEM_CHROMIUM"] ?? "/snap/bin/chromium";
const chromiumCdpUrl = process.env["SYSTEM_CHROMIUM_CDP_URL"];
const smoke = process.env["RELEASE_PERF_SMOKE"] === "1";
const allowSoftware = process.env["RELEASE_PERF_ALLOW_SOFTWARE"] === "1";
const referenceRequested = process.env["RELEASE_PERF_REFERENCE_DEVICE"] === "1";
const config = readConfig(smoke ? SMOKE_CONFIG : CANONICAL_CONFIG);
const canonicalDurationProfile = sameConfig(config, CANONICAL_CONFIG);

if (referenceRequested && !canonicalDurationProfile) {
  throw new Error("Reference-device E2 evidence requires the exact canonical duration profile.");
}

const fixture = await generatePerformanceFixture();
const server = await createServer({
  root: repoRoot,
  logLevel: "error",
  resolve: {
    alias: [
      {
        find: /^react$/u,
        replacement: resolve(repoRoot, "apps/studio/node_modules/react/index.js"),
      },
      {
        find: /^react\/jsx-runtime$/u,
        replacement: resolve(repoRoot, "apps/studio/node_modules/react/jsx-runtime.js"),
      },
      {
        find: /^react-dom\/client$/u,
        replacement: resolve(repoRoot, "apps/studio/node_modules/react-dom/client.js"),
      },
      {
        find: /^three$/u,
        replacement: resolve(repoRoot, "benchmarks/009-release-performance/instrumented-three.ts"),
      },
      {
        find: /^three\/addons\/(.*)$/u,
        replacement: resolve(repoRoot, "apps/studio/node_modules/three/examples/jsm/$1"),
      },
    ],
    dedupe: ["react", "react-dom", "three"],
  },
  server: { host: "127.0.0.1", port: 0, strictPort: false },
});
await server.listen();
const address = server.httpServer?.address();
if (address === null || typeof address === "string" || address === undefined) {
  await server.close();
  throw new Error("Vite did not expose a release performance benchmark port.");
}

const browser =
  chromiumCdpUrl === undefined
    ? await chromium.launch({
        executablePath: chromiumPath,
        headless: true,
        args: ["--js-flags=--expose-gc"],
      })
    : await chromium.connectOverCDP(chromiumCdpUrl);

try {
  await mkdir(outputDirectory, { recursive: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(`http://127.0.0.1:${address.port}/benchmarks/009-release-performance/`, {
    waitUntil: "networkidle",
  });
  const profile = await browserProfile(page);
  const softwareRenderer = isSoftwareRenderer(profile.renderer);
  if (softwareRenderer && !allowSoftware) {
    throw new Error(
      `Hardware rendering is required unless E1 software evidence is explicit: ${profile.renderer}.`,
    );
  }
  if (referenceRequested && !/iris\s*xe/iu.test(profile.renderer)) {
    throw new Error(`Reference-device E2 requires Intel Iris Xe, received ${profile.renderer}.`);
  }
  if (referenceRequested && (process.env["POWER_MODE"] ?? "unknown") === "unknown") {
    throw new Error("Reference-device E2 requires an explicit POWER_MODE.");
  }

  let result: ReleasePerformanceResult;
  try {
    result = (await page.evaluate(async (runConfig) => {
      const run = (
        globalThis as typeof globalThis & {
          run009ReleasePerformance?: (value: typeof runConfig) => Promise<unknown>;
        }
      ).run009ReleasePerformance;
      if (run === undefined) throw new Error("009 release performance harness did not initialize.");
      return run(runConfig);
    }, config)) as ReleasePerformanceResult;
  } catch (error) {
    const selectionCanvases = await page.evaluate(() => {
      const source = globalThis as typeof globalThis & {
        last009SelectionBeforeCanvas?: string;
        last009SelectionAfterCanvas?: string;
      };
      return {
        before: source.last009SelectionBeforeCanvas,
        after: source.last009SelectionAfterCanvas,
      };
    });
    if (selectionCanvases.before !== undefined) {
      await writeFile(
        resolve(outputDirectory, "009-release-performance-failure-selection-before.png"),
        decodeDataUrl(selectionCanvases.before),
      );
    }
    if (selectionCanvases.after !== undefined) {
      await writeFile(
        resolve(outputDirectory, "009-release-performance-failure-selection-after.png"),
        decodeDataUrl(selectionCanvases.after),
      );
    }
    await page.screenshot({
      path: resolve(outputDirectory, "009-release-performance-failure-page.png"),
      fullPage: true,
    });
    throw error;
  }
  if (pageErrors.length > 0) throw new Error(`Benchmark page errors: ${pageErrors.join(" | ")}`);
  assertResultShape(result, config);

  const evidenceClass = softwareRenderer
    ? "E1-controller-software"
    : referenceRequested
      ? "E2-reference-device"
      : "E1-controller-hardware-supplemental";
  const gateEligible = referenceRequested && canonicalDurationProfile && !softwareRenderer;
  const gates = evaluateGates(result, gateEligible);
  const source = sourceIdentity();
  const identity = {
    source,
    fixture: {
      generatorSha256: sha256FileText(resolve(import.meta.dirname, "generate-fixture.mts")),
      sceneSha256: fixture.sceneSha256,
      assetSha256: fixture.assetSha256,
      assetByteLength: fixture.assetByteLength,
    },
    environment: {
      cpu: cpus()[0]?.model ?? "unknown",
      logicalCpuCount: cpus().length,
      totalRamBytes: totalmem(),
      freeRamBytesAtStart: freemem(),
      os: `${platform()} ${release()}`,
      browserVersion: browser.version(),
      userAgent: profile.userAgent,
      renderer: profile.renderer,
      vendor: profile.vendor,
      viewport: profile.viewport,
      powerMode: process.env["POWER_MODE"] ?? "unknown",
    },
    evidenceClass,
    durationProfile: canonicalDurationProfile ? "canonical" : "shortened-non-gating",
    gateEligible,
  };
  const rawPath = resolve(outputDirectory, "009-release-performance.raw.jsonl");
  const canvasPath = resolve(outputDirectory, "009-release-performance-canvas.png");
  const reportPath = resolve(outputDirectory, "009-release-performance.report.json");
  const raw = rawJsonLines(identity, result);
  const canvasBytes = decodeDataUrl(result.canvasDataUrl);
  const report = {
    schemaVersion: "1.0.0",
    generatedAt: new Date().toISOString(),
    command: process.argv.join(" "),
    identity,
    config,
    fixture: result.fixture,
    renderer: result.renderer,
    summaries: {
      frames: result.frames.summary,
      selection: result.selection.summary,
      patch: result.patch.summary,
      patchRate: result.patch.rate,
      activation: result.activation.summary,
      memory: result.memory.namedSeries,
    },
    formulas: {
      medianFps: "1000 / median(frameDeltaMs)",
      onePercentLowFps: "1000 / nearestRankP99(frameDeltaMs)",
      latencyP95: "nearestRankP95(latencyMs)",
      activationP95: "nearestRankP95(activationMs)",
      memorySlope: "Theil-Sen pairwise slope over post-warm-up samples",
      heapFinalLimit: "baseline + max(8 MiB, 5% of baseline)",
      resourceFinalLimit: "post-warm-up baseline",
    },
    sampleCounts: {
      warmupFrames: result.frames.warmupFrameDeltaMs.length,
      measuredFrames: result.frames.frameDeltaMs.length,
      selection: result.selection.samples.length,
      patch: result.patch.samples.length,
      activation: result.activation.durationsMs.length,
      memory: result.memory.samples.length,
      disposal: result.disposal.length,
    },
    canvas: result.canvas,
    disposal: result.disposal,
    gates,
    artifacts: {
      rawJsonl: { path: rawPath, sha256: sha256(raw), byteLength: Buffer.byteLength(raw) },
      canvas: { path: canvasPath, sha256: sha256(canvasBytes), byteLength: canvasBytes.byteLength },
    },
  };
  await Promise.all([
    writeFile(rawPath, raw),
    writeFile(canvasPath, canvasBytes),
    writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`),
  ]);
  const reportBytes = Buffer.from(`${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(
    `release-performance-009 status=${gates.overall} evidence=${evidenceClass} profile=${identity.durationProfile} report=${reportPath} reportSha256=${sha256(reportBytes)} raw=${rawPath} canvas=${canvasPath}\n`,
  );
  if (gateEligible && gates.overall !== "pass") {
    throw new Error("Reference-device performance gates failed; artifacts were retained.");
  }
  await context.close();
} finally {
  await browser.close();
  await server.close();
}

interface DistributionSummary {
  readonly count: number;
  readonly median: number;
  readonly p95: number;
  readonly p99: number;
  readonly max: number;
  readonly medianFps?: number;
  readonly onePercentLowFps?: number;
}

interface ReleasePerformanceResult {
  readonly schemaVersion: string;
  readonly clock: string;
  readonly config: BenchmarkConfig;
  readonly fixture: Record<string, unknown>;
  readonly renderer: {
    readonly drawCalls: number;
    readonly triangles: number;
    readonly geometries: number;
    readonly textures: number;
  };
  readonly frames: {
    readonly warmupFrameDeltaMs: readonly number[];
    readonly frameDeltaMs: readonly number[];
    readonly summary: DistributionSummary;
  };
  readonly selection: {
    readonly samples: readonly Record<string, unknown>[];
    readonly summary: DistributionSummary;
  };
  readonly patch: {
    readonly samples: readonly Record<string, unknown>[];
    readonly summary: DistributionSummary;
    readonly rate: {
      readonly configuredHz: number;
      readonly actualHz: number;
      readonly distinctPointers: number;
    };
  };
  readonly activation: {
    readonly durationsMs: readonly number[];
    readonly summary: DistributionSummary;
  };
  readonly memory: {
    readonly forcedGcAvailable: boolean;
    readonly samples: readonly Record<string, unknown>[];
    readonly namedSeries: Readonly<Record<string, SeriesSummary>>;
  };
  readonly disposal: readonly Record<string, number>[];
  readonly canvas: Record<string, number>;
  readonly canvasDataUrl: string;
}

interface SeriesSummary {
  readonly available?: boolean;
  readonly nonPositiveSlope?: boolean;
  readonly finalWithinLimit: boolean | null;
}

function evaluateGates(result: ReleasePerformanceResult, gateEligible: boolean) {
  const memorySeries = Object.values(result.memory.namedSeries);
  const checks = {
    medianFps: (result.frames.summary.medianFps ?? 0) >= 60,
    onePercentLowFps: (result.frames.summary.onePercentLowFps ?? 0) >= 30,
    selectionP95: result.selection.summary.p95 < 100,
    patchP95: result.patch.summary.p95 < 100,
    activationP95: result.activation.summary.p95 < 2_000,
    forcedGcAvailable: result.memory.forcedGcAvailable,
    memorySeries: memorySeries.every(
      (series) =>
        series.available !== false &&
        series.nonPositiveSlope === true &&
        series.finalWithinLimit === true,
    ),
    dispose: result.disposal.every((probe) => Object.values(probe).every((value) => value === 0)),
  };
  const passed = Object.values(checks).every(Boolean);
  return {
    overall: gateEligible ? (passed ? "pass" : "fail") : "blocked-non-gating",
    gateEligible,
    checks,
  };
}

function assertResultShape(result: ReleasePerformanceResult, expectedConfig: typeof config): void {
  if (result.schemaVersion !== "1.0.0" || result.clock !== "performance.now") {
    throw new Error("Benchmark result contract mismatch.");
  }
  if (!sameConfig(result.config, expectedConfig))
    throw new Error("Benchmark result config mismatch.");
  if (result.frames.frameDeltaMs.length === 0) throw new Error("Measured frame samples are empty.");
  if (result.selection.samples.length !== expectedConfig.latencySampleCount) {
    throw new Error("Selection sample count mismatch.");
  }
  if (result.patch.samples.length !== expectedConfig.latencySampleCount) {
    throw new Error("Patch sample count mismatch.");
  }
  if (result.activation.durationsMs.length !== expectedConfig.activationCount) {
    throw new Error("Activation sample count mismatch.");
  }
  if (!/^data:image\/png;base64,/u.test(result.canvasDataUrl)) {
    throw new Error("Canvas evidence is missing.");
  }
}

function rawJsonLines(identity: unknown, result: ReleasePerformanceResult): string {
  const records: unknown[] = [
    { type: "identity", value: identity },
    { type: "fixture", value: result.fixture },
    { type: "renderer", value: result.renderer },
    ...result.frames.warmupFrameDeltaMs.map((deltaMs, index) => ({
      type: "warmup-frame",
      index,
      deltaMs,
    })),
    ...result.frames.frameDeltaMs.map((deltaMs, index) => ({
      type: "measured-frame",
      index,
      deltaMs,
    })),
    ...result.selection.samples.map((value) => ({ type: "selection", ...value })),
    ...result.patch.samples.map((value) => ({ type: "patch", ...value })),
    ...result.activation.durationsMs.map((durationMs, index) => ({
      type: "activation",
      index,
      durationMs,
    })),
    ...result.memory.samples.map((value) => ({ type: "memory", ...value })),
    ...result.disposal.map((value, index) => ({ type: "dispose", index, ...value })),
  ];
  return `${records.map((record) => JSON.stringify(record)).join("\n")}\n`;
}

async function browserProfile(page: Page) {
  return page.evaluate(() => {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    const extension = gl?.getExtension("WEBGL_debug_renderer_info");
    return {
      userAgent: navigator.userAgent,
      renderer:
        gl !== null && gl !== undefined && extension !== null && extension !== undefined
          ? String(gl.getParameter(extension.UNMASKED_RENDERER_WEBGL))
          : "unavailable",
      vendor:
        gl !== null && gl !== undefined && extension !== null && extension !== undefined
          ? String(gl.getParameter(extension.UNMASKED_VENDOR_WEBGL))
          : "unavailable",
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        dpr: window.devicePixelRatio,
      },
    };
  });
}

function readConfig(defaults: BenchmarkConfig): BenchmarkConfig {
  return {
    warmupMs: readPositiveInteger("RELEASE_PERF_WARMUP_MS", defaults.warmupMs),
    measurementMs: readPositiveInteger("RELEASE_PERF_MEASUREMENT_MS", defaults.measurementMs),
    activationCount: readPositiveInteger("RELEASE_PERF_ACTIVATION_COUNT", defaults.activationCount),
    latencySampleCount: readPositiveInteger(
      "RELEASE_PERF_LATENCY_SAMPLE_COUNT",
      defaults.latencySampleCount,
    ),
    memoryDurationMs: readPositiveInteger(
      "RELEASE_PERF_MEMORY_DURATION_MS",
      defaults.memoryDurationMs,
    ),
    memoryIntervalMs: readPositiveInteger(
      "RELEASE_PERF_MEMORY_INTERVAL_MS",
      defaults.memoryIntervalMs,
    ),
  };
}

function readPositiveInteger(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0)
    throw new Error(`${name} must be a positive integer.`);
  return value;
}

function sameConfig(left: BenchmarkConfig, right: BenchmarkConfig): boolean {
  return Object.keys(CANONICAL_CONFIG).every(
    (key) => left[key as keyof typeof left] === right[key as keyof typeof right],
  );
}

function sourceIdentity() {
  const status = git(["status", "--porcelain"]);
  return {
    commit: git(["rev-parse", "HEAD"]),
    branch: git(["branch", "--show-current"]),
    dirty: status !== "",
    dirtyPaths: status === "" ? [] : status.split("\n"),
  };
}

function git(args: readonly string[]): string {
  return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" }).trim();
}

function isSoftwareRenderer(renderer: string): boolean {
  return /swiftshader|llvmpipe|software|unavailable/iu.test(renderer);
}

function decodeDataUrl(value: string): Buffer {
  const separator = value.indexOf(",");
  if (separator < 0) throw new Error("Canvas data URL is invalid.");
  return Buffer.from(value.slice(separator + 1), "base64");
}

function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function sha256FileText(path: string): string {
  return sha256(readFileSync(path));
}
