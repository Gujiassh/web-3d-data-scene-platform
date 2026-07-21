import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

import { chromium } from "@playwright/test";
import { PNG } from "pngjs";

const LOCAL_ROOT = "/home/cc/tmp";
const DEFAULT_BASE_URL = "http://127.0.0.1:4173/";
const DEFAULT_OUTPUT = "/home/cc/tmp/web3d-smart-home-browser-evidence";
const DESCRIPTOR_PATH = "/starter/descriptor.json";
const phases = Object.freeze([
  Object.freeze({
    id: "normal-offline-alarm",
    bindings: Object.freeze({
      "/channels/channel-a/status": Object.freeze(["ready", "ready", "ready"]),
      "/channels/channel-b/status": Object.freeze(["offline"]),
      "/channels/channel-c/status": Object.freeze(["alarm"]),
    }),
    alarmLevels: Object.freeze(["critical", "warning"]),
  }),
]);

const args = parseArgs(process.argv.slice(2));
await runBrowserEvidence(args);

export async function runBrowserEvidence(options) {
  const archivePath = requireAbsolutePath(options.archive, "--archive");
  const descriptorPath = requireAbsolutePath(options.descriptor, "--descriptor");
  const outputDirectory = requireLocalOutput(options.output ?? DEFAULT_OUTPUT);
  const baseUrl = new URL(options.baseUrl ?? DEFAULT_BASE_URL).href;
  const timeoutMs = parseTimeout(options.timeout);
  const [archiveBytes, descriptorBytes] = await Promise.all([
    readFile(archivePath),
    readFile(descriptorPath),
  ]);
  const descriptor = validateDescriptor(JSON.parse(descriptorBytes.toString("utf8")), archiveBytes);
  const archiveUrl = new URL(descriptor.archiveUrl, baseUrl);
  await mkdir(outputDirectory, { recursive: true });

  const browser = await chromium.launch({ headless: options.headed !== true });
  const errors = [];
  try {
    const context = await browser.newContext({
      colorScheme: "light",
      locale: "en-US",
      viewport: { width: 1440, height: 900 },
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(`pageerror:${error.stack ?? error.message}`));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(`console:${message.text()}`);
    });
    await page.route(descriptorRoute(baseUrl), async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: descriptorBytes });
    });
    await page.route(archiveRoute(archiveUrl), async (route) => {
      await route.fulfill({ status: 200, contentType: "application/zip", body: archiveBytes });
    });

    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await page.getByTestId("project-loading").waitFor({ state: "hidden", timeout: timeoutMs });
    await page.locator(".project-copy strong").waitFor({ state: "visible", timeout: timeoutMs });
    assertEqual(
      await page.locator(".project-copy strong").innerText(),
      "90 m2 Smart Home",
      "starter project name",
    );
    const canvas = page.locator('canvas[data-web3d-viewer="true"]');
    await waitForCanvas(canvas, timeoutMs);
    await page.getByRole("button", { name: "Run", exact: true }).click();
    await page.locator(".run-preview-panel").waitFor({ state: "visible", timeout: timeoutMs });

    const capturedPhases = [];
    for (const phase of phases) {
      const runtime = await waitForPhase(page, phase, timeoutMs);
      const canvasBytes = await canvas.screenshot();
      const canvasEvidence = inspectCanvas(canvasBytes);
      if (canvasEvidence.distinctColors < 8) {
        throw new Error(
          `Canvas for ${phase.id} is visually blank: ${canvasEvidence.distinctColors} colors.`,
        );
      }
      const screenshotPath = resolve(outputDirectory, `${phase.id}-1440x900.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });
      capturedPhases.push({
        id: phase.id,
        runtime,
        canvas: canvasEvidence,
        screenshotPath,
      });
    }

    if (errors.length > 0) {
      throw new Error(`Studio emitted browser errors:\n${errors.join("\n")}`);
    }

    const identity = await page.evaluate(() => ({
      platform: globalThis.navigator.platform,
      userAgent: globalThis.navigator.userAgent,
    }));
    const evidence = {
      schemaVersion: "1.0.0",
      evidenceClass: "E1-controller",
      profile: "fresh Playwright browser context",
      browser: {
        engine: "chromium",
        version: browser.version(),
        platform: identity.platform,
        userAgent: identity.userAgent,
      },
      starter: {
        projectId: descriptor.projectId,
        archivePath,
        archiveSha256: descriptor.archiveSha256,
        archiveByteLength: descriptor.archiveByteLength,
        licenseScope: "local-validation only; artifacts remain below /home/cc/tmp",
      },
      phases: capturedPhases,
      errors,
    };
    const evidencePath = resolve(outputDirectory, "evidence.json");
    await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
    process.stdout.write(
      `smart-home-browser-evidence status=passed browser=chromium phases=${capturedPhases.length} archiveSha256=${descriptor.archiveSha256} output=${outputDirectory}\n`,
    );
    await context.close();
    return evidence;
  } finally {
    await browser.close();
  }
}

async function waitForPhase(page, expected, timeoutMs) {
  const deadline = Date.now() + Math.min(timeoutMs, 7_000);
  let latest;
  while (Date.now() < deadline) {
    latest = await readRuntimeState(page);
    if (matchesPhase(latest, expected)) return latest;
    await new Promise((resolvePromise) => globalThis.setTimeout(resolvePromise, 40));
  }
  throw new Error(
    `Runtime phase ${expected.id} was not observed; latest=${JSON.stringify(latest)}.`,
  );
}

async function readRuntimeState(page) {
  const sections = page.locator(".run-preview-panel .data-section");
  const source = await sections
    .nth(0)
    .locator(".runtime-row")
    .evaluateAll((rows) =>
      rows.map((row) => ({
        id: row.querySelector("small")?.textContent?.trim() ?? "",
        statusClass: row.querySelector(".runtime-status")?.className ?? "",
      })),
    );
  const bindingRows = await sections
    .nth(1)
    .locator(".runtime-row")
    .evaluateAll((rows) =>
      rows.map((row) => ({
        pointer: row.querySelector("small")?.textContent?.trim() ?? "",
        value: row.querySelector(".runtime-value")?.textContent?.trim() ?? "",
        qualityClass: row.querySelector(".runtime-quality")?.className ?? "",
      })),
    );
  const alarms = await sections
    .nth(2)
    .locator(".runtime-alarm")
    .evaluateAll((rows) =>
      rows.map((row) => ({
        targetId: row.querySelector("small")?.textContent?.trim() ?? "",
        level: [...row.classList]
          .find((name) => name.startsWith("alarm-") && name !== "runtime-alarm")
          ?.slice("alarm-".length),
      })),
    );
  const bindings = {};
  for (const row of bindingRows) {
    (bindings[row.pointer] ??= []).push(row.value);
  }
  for (const values of Object.values(bindings)) values.sort();
  return { source, bindings, bindingRows, alarms };
}

function matchesPhase(actual, expected) {
  if (
    actual.source.length !== 1 ||
    !actual.source[0].statusClass.split(/\s+/u).includes("status-online") ||
    actual.bindingRows.some((row) => !row.qualityClass.split(/\s+/u).includes("quality-good"))
  ) {
    return false;
  }
  if (canonicalBindings(actual.bindings) !== canonicalBindings(expected.bindings)) return false;
  const alarmLevels = actual.alarms.map((alarm) => alarm.level).sort();
  return JSON.stringify(alarmLevels) === JSON.stringify([...expected.alarmLevels].sort());
}

function canonicalBindings(bindings) {
  return JSON.stringify(
    Object.entries(bindings)
      .sort(([left], [right]) => left.localeCompare(right, "en"))
      .map(([pointer, values]) => [pointer, [...values].sort()]),
  );
}

function inspectCanvas(bytes) {
  const image = PNG.sync.read(bytes);
  const colors = new Set();
  const sampleCount = 64;
  for (let row = 0; row < sampleCount; row += 1) {
    const y = Math.floor((row / (sampleCount - 1)) * (image.height - 1));
    for (let column = 0; column < sampleCount; column += 1) {
      const x = Math.floor((column / (sampleCount - 1)) * (image.width - 1));
      const offset = (y * image.width + x) * 4;
      colors.add(
        `${(image.data[offset] ?? 0) >> 4}:${(image.data[offset + 1] ?? 0) >> 4}:${
          (image.data[offset + 2] ?? 0) >> 4
        }:${(image.data[offset + 3] ?? 0) >> 4}`,
      );
    }
  }
  return {
    width: image.width,
    height: image.height,
    distinctColors: colors.size,
    sha256: sha256(bytes),
  };
}

async function waitForCanvas(canvas, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (
      (await canvas.isVisible()) &&
      (await canvas.evaluate((element) => element.width > 100 && element.height > 100))
    ) {
      return;
    }
    await new Promise((resolvePromise) => globalThis.setTimeout(resolvePromise, 50));
  }
  throw new Error(`Studio Canvas did not become ready within ${timeoutMs}ms.`);
}

function validateDescriptor(value, archiveBytes) {
  if (
    value === null ||
    typeof value !== "object" ||
    value.schemaVersion !== "1.0.0" ||
    typeof value.projectId !== "string" ||
    typeof value.archiveUrl !== "string" ||
    typeof value.archiveSha256 !== "string" ||
    !Number.isSafeInteger(value.archiveByteLength)
  ) {
    throw new Error("Starter descriptor is invalid.");
  }
  assertEqual(archiveBytes.byteLength, value.archiveByteLength, "archive byteLength");
  assertEqual(sha256(archiveBytes), value.archiveSha256, "archive SHA-256");
  return value;
}

function descriptorRoute(baseUrl) {
  return new RegExp(`${escapeRegExp(new URL(DESCRIPTOR_PATH, baseUrl).href)}(?:\\?.*)?$`, "u");
}

function archiveRoute(url) {
  return new RegExp(`${escapeRegExp(url.href)}(?:\\?.*)?$`, "u");
}

function parseArgs(values) {
  const options = {};
  for (let index = 0; index < values.length; index += 1) {
    const flag = values[index];
    if (flag === "--headed") {
      options.headed = true;
      continue;
    }
    const value = values[index + 1];
    if (!flag?.startsWith("--") || value === undefined || value.startsWith("--")) {
      throw new Error(`Expected --name value, received ${flag ?? "end of input"}.`);
    }
    const key = flag.slice(2).replace(/-([a-z])/gu, (_, letter) => letter.toUpperCase());
    if (!["archive", "descriptor", "output", "baseUrl", "timeout"].includes(key)) {
      throw new Error(`Unknown argument ${flag}.`);
    }
    options[key] = value;
    index += 1;
  }
  return options;
}

function requireAbsolutePath(value, label) {
  if (typeof value !== "string" || !isAbsolute(value)) {
    throw new Error(`${label} must be an absolute path.`);
  }
  return resolve(value);
}

function requireLocalOutput(value) {
  const output = requireAbsolutePath(value, "--output");
  const relativePath = relative(LOCAL_ROOT, output);
  if (relativePath === "" || relativePath.startsWith("..") || isAbsolute(relativePath)) {
    throw new Error(`Browser evidence output must stay below ${LOCAL_ROOT}.`);
  }
  return output;
}

function parseTimeout(value) {
  if (value === undefined) return 45_000;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1_000) {
    throw new Error("--timeout must be an integer of at least 1000ms.");
  }
  return parsed;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label} mismatch: expected ${String(expected)}, received ${String(actual)}.`);
  }
}
