import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { chromium } from "@playwright/test";
import { createServer } from "vite";

const repoRoot = resolve(import.meta.dirname, "../..");
const outputDirectory = resolve(repoRoot, "artifacts/performance");
const chromiumPath = process.env["SYSTEM_CHROMIUM"] ?? "/snap/bin/chromium";
const chromiumCdpUrl = process.env["SYSTEM_CHROMIUM_CDP_URL"];
const server = await createServer({
  root: repoRoot,
  logLevel: "error",
  server: { host: "127.0.0.1", port: 0, strictPort: false },
});

await server.listen();
const address = server.httpServer?.address();
if (address === null || typeof address === "string" || address === undefined) {
  await server.close();
  throw new Error("Vite did not expose a local benchmark port.");
}

const browser =
  chromiumCdpUrl === undefined
    ? await chromium.launch({ executablePath: chromiumPath, headless: true })
    : await chromium.connectOverCDP(chromiumCdpUrl);
try {
  await mkdir(outputDirectory, { recursive: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${address.port}/benchmarks/006b-light-performance/`);
  const profile = await page.evaluate(() => {
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
  assertBrowserProfile(profile);
  const fixtures = await page.evaluate(async () => {
    const run = (
      globalThis as typeof globalThis & {
        run006bLightPerformance?: () => Promise<unknown>;
      }
    ).run006bLightPerformance;
    if (run === undefined) throw new Error("006B performance harness did not initialize.");
    return run();
  });
  assertAcceptance(fixtures);
  const canvasDataUrl = await page.evaluate(
    () =>
      (globalThis as typeof globalThis & { last006bLightPerformanceCanvas?: string })
        .last006bLightPerformanceCanvas,
  );
  if (canvasDataUrl === undefined) throw new Error("Performance Canvas evidence was not captured.");
  await writeFile(
    resolve(outputDirectory, "006b-light-performance-canvas.png"),
    Buffer.from(canvasDataUrl.slice(canvasDataUrl.indexOf(",") + 1), "base64"),
  );
  const report = {
    generatedAt: new Date().toISOString(),
    browser: {
      userAgent: profile.userAgent,
      renderer: profile.renderer,
      vendor: profile.vendor,
    },
    viewport: profile.viewport,
    protocol: { warmupEvents: 30, measuredEvents: 300, p95LimitMs: 33.3 },
    fixtures,
  };
  const output = resolve(outputDirectory, "006b-light-performance.json");
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(`006b-light-performance report=${output}\n`);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  await context.close();
} finally {
  await browser.close();
  await server.close();
}

interface StateResult {
  readonly state: string;
  readonly warmupCount: number;
  readonly measuredCount: number;
  readonly p95Ms: number;
}

interface FixtureResult {
  readonly fixture: string;
  readonly states: readonly StateResult[];
  readonly canvas: {
    readonly width: number;
    readonly height: number;
    readonly distinctColors: number;
  };
}

function assertAcceptance(value: unknown): asserts value is readonly FixtureResult[] {
  if (!Array.isArray(value) || value.length !== 2) {
    throw new Error("Performance acceptance requires exactly two fixtures.");
  }
  const expectedFixtures = ["006-overhead", "006b-pbr"];
  const expectedStates = ["zero", "point-25", "spot-10", "mixed-8"];
  for (const [fixtureIndex, candidate] of value.entries()) {
    if (!isFixtureResult(candidate) || candidate.fixture !== expectedFixtures[fixtureIndex]) {
      throw new Error(`Performance fixture ${fixtureIndex + 1} is missing or out of order.`);
    }
    if (
      candidate.canvas.width !== 1440 ||
      candidate.canvas.height !== 900 ||
      candidate.canvas.distinctColors <= 1
    ) {
      throw new Error(
        `Performance fixture ${candidate.fixture} did not produce nonblank 1440x900 Canvas evidence.`,
      );
    }
    if (
      candidate.states.length !== expectedStates.length ||
      candidate.states.some((state, index) => state.state !== expectedStates[index])
    ) {
      throw new Error(
        `Performance fixture ${candidate.fixture} does not contain the required states.`,
      );
    }
    for (const state of candidate.states) {
      if (state.warmupCount !== 30 || state.measuredCount !== 300) {
        throw new Error(
          `Performance state ${candidate.fixture}/${state.state} has an invalid sample count.`,
        );
      }
    }
    const mixed = candidate.states.at(-1);
    if (mixed === undefined || !Number.isFinite(mixed.p95Ms) || mixed.p95Ms > 33.3) {
      throw new Error(
        `Performance fixture ${candidate.fixture} exceeds the 33.3ms mixed-light p95 limit.`,
      );
    }
  }
}

function assertBrowserProfile(profile: {
  readonly renderer: unknown;
  readonly viewport: {
    readonly width: number;
    readonly height: number;
    readonly deviceScaleFactor: number;
  };
}): void {
  if (
    typeof profile.renderer !== "string" ||
    /swiftshader|llvmpipe|software|unavailable/iu.test(profile.renderer)
  ) {
    throw new Error(
      `Performance acceptance requires hardware rendering, received: ${String(profile.renderer)}`,
    );
  }
  const { width, height, deviceScaleFactor } = profile.viewport;
  if (width !== 1440 || height !== 900 || deviceScaleFactor !== 1) {
    throw new Error(
      `Performance acceptance requires 1440x900 DPR1, received ${width}x${height} DPR${deviceScaleFactor}.`,
    );
  }
}

function isFixtureResult(value: unknown): value is FixtureResult {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<FixtureResult>;
  return (
    typeof candidate.fixture === "string" &&
    Array.isArray(candidate.states) &&
    typeof candidate.canvas === "object" &&
    candidate.canvas !== null
  );
}
