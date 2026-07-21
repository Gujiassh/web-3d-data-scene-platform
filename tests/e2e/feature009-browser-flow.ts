import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { expect, type Page, type TestInfo } from "@playwright/test";
import { PNG } from "pngjs";
import { exportSceneArchive, type SceneDocument } from "../../packages/document/src/index.js";
import type { ViewerSnapshot } from "../../packages/runtime/src/index.js";

import {
  activeStoredDocumentJson,
  assertNoRuntimeErrors,
  expectRevision,
  expectStoredRevision,
  observeRuntimeErrors,
  readyCanvas,
} from "./hotspot-test-helpers";

export type BrowserEngine = "chromium" | "firefox" | "webkit";

export interface BrowserViewport {
  readonly name: "1280x720" | "1440x900" | "1920x1080";
  readonly width: number;
  readonly height: number;
}

export const feature009StudioViewports: readonly BrowserViewport[] = [
  { name: "1280x720", width: 1280, height: 720 },
  { name: "1440x900", width: 1440, height: 900 },
  { name: "1920x1080", width: 1920, height: 1080 },
];

const layoutScenePath = path.resolve("tests/fixtures/006-layout/layout.scene.json");
const factoryAssetPath = path.resolve("tests/fixtures/m0-factory/public/m0-factory-cell.glb");
const publishedScenePath = path.resolve("examples/minimal-host/public/published/scene.json");
const factoryAssetSha256 = "e123f3d64ec60f136d8673478eb2fd2ce28f56bcb5fb94cef5a7377b9605efe8";
const expectedCsp =
  "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' blob: data:; connect-src 'self' wss:; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'self'";
const webkitScreenshotCspNoise =
  "console:Refused to apply a stylesheet because its hash, its nonce, or 'unsafe-inline' does not appear in the style-src directive of the Content Security Policy.";

let archivePromise: Promise<Uint8Array> | undefined;

export async function recordBrowserIdentity(
  page: Page,
  engine: BrowserEngine,
  testInfo: TestInfo,
): Promise<void> {
  const browserVersion = page.context().browser()?.version() ?? "unavailable";
  const navigatorIdentity = await page.evaluate(() => ({
    platform: navigator.platform,
    userAgent: navigator.userAgent,
  }));
  const evidenceLabel =
    engine === "webkit" ? `playwright-webkit-${process.platform}` : `playwright-${engine}`;
  const identity = {
    evidenceClass: "E1-controller",
    engine,
    evidenceLabel,
    browserVersion,
    hostPlatform: process.platform,
    navigatorPlatform: navigatorIdentity.platform,
    userAgent: navigatorIdentity.userAgent,
    realSafari: false,
  } as const;

  if (engine === "chromium") expect(identity.userAgent).toMatch(/Chrom(?:e|ium)\//u);
  if (engine === "firefox") expect(identity.userAgent).toContain("Firefox/");
  if (engine === "webkit") {
    expect(identity.userAgent).toContain("AppleWebKit/");
    expect(identity.evidenceLabel.toLowerCase()).not.toContain("safari");
  }

  console.log(
    `feature009-browser engine=${identity.engine} label=${identity.evidenceLabel} version=${identity.browserVersion} host=${identity.hostPlatform} navigator_platform=${JSON.stringify(identity.navigatorPlatform)} ua=${JSON.stringify(identity.userAgent)}`,
  );
  const identityPath = testInfo.outputPath("browser-identity.json");
  await writeFile(identityPath, `${JSON.stringify(identity, null, 2)}\n`, "utf8");
  await testInfo.attach("feature009-browser-identity", {
    path: identityPath,
    contentType: "application/json",
  });
}

export async function probeIndexedDbBlobStorage(
  page: Page,
): Promise<{ readonly supported: boolean; readonly error: string | null }> {
  await page.goto("/");
  return page.evaluate(async () => {
    const databaseName = `web3d-feature009-blob-probe-${crypto.randomUUID()}`;
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open(databaseName, 1);
      open.onupgradeneeded = () => open.result.createObjectStore("assets");
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error ?? new Error("IndexedDB probe open failed."));
    });
    try {
      return await new Promise<{ readonly supported: boolean; readonly error: string | null }>(
        (resolve) => {
          const transaction = database.transaction("assets", "readwrite");
          let error: string | null = null;
          const request = transaction
            .objectStore("assets")
            .put(new Blob([new Uint8Array([1, 2, 3])]), "blob");
          request.onerror = () => {
            error = `${request.error?.name ?? "UnknownError"}: ${
              request.error?.message ?? "IndexedDB Blob write failed."
            }`;
          };
          transaction.onerror = () => {
            error ??= `${transaction.error?.name ?? "UnknownError"}: ${
              transaction.error?.message ?? "IndexedDB Blob transaction failed."
            }`;
          };
          transaction.onabort = () =>
            resolve({
              supported: false,
              error:
                error ??
                `${transaction.error?.name ?? "AbortError"}: ${
                  transaction.error?.message ?? "IndexedDB Blob transaction aborted."
                }`,
            });
          transaction.oncomplete = () => resolve({ supported: error === null, error });
        },
      );
    } catch (error) {
      return {
        supported: false,
        error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
      };
    } finally {
      database.close();
      indexedDB.deleteDatabase(databaseName);
    }
  });
}

export async function runStudioCriticalFlow(
  page: Page,
  viewport: BrowserViewport,
  engine: BrowserEngine,
  testInfo: TestInfo,
): Promise<void> {
  const runtimeErrors = observeRuntimeErrors(page);
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.goto("/");
  await expect(page.getByTestId("project-loading")).toBeHidden({ timeout: 45_000 });
  await readyCanvas(page);
  await importLayoutArchive(page);

  const selectedRow = page.getByTestId("tree-layout-entity-a");
  await selectedRow.focus();
  await page.keyboard.press(" ");
  await expect(selectedRow).toHaveAttribute("aria-selected", "true");

  await page.keyboard.press("Alt+g");
  await expectRevision(page, 2);
  await expectStoredRevision(page, 2);
  expect(entityPosition(await storedDocument(page), "layout-entity-a")).toEqual([0, 0, 0]);

  await page.keyboard.press("Control+z");
  await expectRevision(page, 3);
  await expectStoredRevision(page, 3);
  expect(entityPosition(await storedDocument(page), "layout-entity-a")).toEqual([-4, 0, -1.5]);

  await page.keyboard.press("Control+Shift+z");
  await expectRevision(page, 4);
  await expectStoredRevision(page, 4);
  expect(entityPosition(await storedDocument(page), "layout-entity-a")).toEqual([0, 0, 0]);

  await page.getByRole("tab", { name: "Data" }).click();
  await expect(page.getByLabel("Business ID")).toHaveValue("LAYOUT-A");
  await expect(page.getByText("Writes color, alarm", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Edit binding" }).click();
  await expect(page.getByLabel("Field")).toHaveValue("/telemetry/status");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();

  const beforeRunDocumentJson = await activeStoredDocumentJson(page);
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(page.getByTestId("viewport-mode")).toContainText("RUN / SELECT");
  const sourceRow = page
    .locator(".run-preview-panel .data-section")
    .first()
    .locator(".runtime-row")
    .filter({ hasText: "layout-status-source" });
  await expect(sourceRow).toHaveCount(1);
  await expect(sourceRow.locator(".runtime-status")).toHaveClass(/status-online/u);
  await expect(page.locator(".run-preview-panel .runtime-value")).toHaveCount(1);
  await expect(page.locator(".run-preview-panel .runtime-quality")).toHaveText("Good");

  const canvas = await readyCanvas(page);
  assertNoRuntimeErrors(page);
  const screenshot = await captureCanvasPng(canvas, runtimeErrors, engine);
  expect(canvasMetrics(screenshot).distinctColors).toBeGreaterThanOrEqual(8);
  await expectNoPageOverflow(page);

  const runtimeEvidence = {
    documentId: (JSON.parse(beforeRunDocumentJson) as SceneDocument).id,
    revision: 4,
    connection: await sourceRow.locator(".runtime-status").innerText(),
    bindingValue: await page.locator(".run-preview-panel .runtime-value").innerText(),
    bindingQuality: await page.locator(".run-preview-panel .runtime-quality").innerText(),
  };
  const runtimePath = testInfo.outputPath(`studio-runtime-${viewport.name}.json`);
  await writeFile(runtimePath, `${JSON.stringify(runtimeEvidence, null, 2)}\n`, "utf8");
  await testInfo.attach(`feature009-studio-runtime-${viewport.name}`, {
    path: runtimePath,
    contentType: "application/json",
  });
  const screenshotPath = testInfo.outputPath(`studio-${viewport.name}.png`);
  await writeFile(screenshotPath, screenshot);
  await testInfo.attach(`feature009-studio-${viewport.name}`, {
    path: screenshotPath,
    contentType: "image/png",
  });

  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const exportedDocumentJson = await exportJson(
    page,
    testInfo,
    `studio-${viewport.name}.scene.json`,
  );
  expect(exportedDocumentJson).toBe(beforeRunDocumentJson);
  assertNoRuntimeErrors(page);
}

export async function runPublishedHostCriticalFlow(
  page: Page,
  publishedHostUrl: string,
  engine: BrowserEngine,
  testInfo: TestInfo,
): Promise<void> {
  const runtimeErrors = observeRuntimeErrors(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  const rootResponse = await page.goto(publishedHostUrl);
  expect(rootResponse?.headers()["content-security-policy"]).toBe(expectedCsp);
  await expect(page.locator("#scene-status")).toHaveText("Ready / revision 4");
  await expect(page.locator("#connection-value")).toHaveText("Online");

  const canvas = page.locator('canvas[data-web3d-viewer="true"]');
  await expect(canvas).toBeVisible();
  assertNoRuntimeErrors(page);
  const screenshot = await captureCanvasPng(canvas, runtimeErrors, engine);
  expect(canvasMetrics(screenshot).distinctColors).toBeGreaterThan(12);

  const expectedSceneJson = await readFile(publishedScenePath, "utf8");
  const sceneResponse = await page.request.get(`${publishedHostUrl}published/scene.json`);
  expect(await sceneResponse.text()).toBe(expectedSceneJson);

  const snapshot = await publishedRuntimeSnapshot(page);
  expect(snapshot.lifecycle).toBe("ready");
  expect(snapshot.documentId).toBe("published-factory-scene");
  expect(snapshot.revision).toBe(4);
  expect(snapshot.selectedTargetId).toBeNull();
  expect(Object.values(snapshot.connections)).toEqual(["online"]);
  expect(snapshot.alarmKeys ?? snapshot.alarms.map((alarm) => alarm.key)).toEqual([]);

  await page.mouse.click(614, 414);
  await expect(page.locator("#selection-value")).toHaveText("press-01");
  await expect(page.locator("#selection-origin")).toHaveText("Viewer");

  await page.getByRole("button", { name: "Press inspection", exact: true }).click();
  const content = page.locator("#host-content");
  await expect(content).toContainText("WO-1842");
  await expect(content).toContainText("Line A");
  await expect(content).not.toContainText("inspection-card");
  await page.getByRole("button", { name: "Close inspection record" }).click();

  await page.locator("#target-select").selectOption("conveyor-01");
  await page.getByRole("button", { name: "Focus", exact: true }).click();
  await expect(page.locator("#selection-value")).toHaveText("conveyor-01");
  await expect(page.locator("#selection-origin")).toHaveText("Api");
  await expectNoPageOverflow(page);

  const runtimePath = testInfo.outputPath("published-runtime.json");
  await writeFile(runtimePath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  await testInfo.attach("feature009-published-runtime", {
    path: runtimePath,
    contentType: "application/json",
  });
  const screenshotPath = testInfo.outputPath("published-host-1440x900.png");
  await writeFile(screenshotPath, screenshot);
  await testInfo.attach("feature009-published-host-1440x900", {
    path: screenshotPath,
    contentType: "image/png",
  });
  assertNoRuntimeErrors(page);
}

async function layoutArchive(): Promise<Uint8Array> {
  archivePromise ??= Promise.all([
    readFile(layoutScenePath, "utf8"),
    readFile(factoryAssetPath),
  ]).then(async ([sceneJson, assetBytes]) =>
    exportSceneArchive({
      document: currentLayoutDocument(sceneJson),
      createdAt: "2026-07-20T00:00:00.000Z",
      resolveAssetBytes: new Map([[factoryAssetSha256, new Uint8Array(assetBytes)]]),
    }),
  );
  return archivePromise;
}

function currentLayoutDocument(sceneJson: string): SceneDocument {
  const fixture = JSON.parse(sceneJson) as Omit<SceneDocument, "schemaVersion"> & {
    readonly schemaVersion: "1.2.0";
  };
  return { ...fixture, schemaVersion: "1.4.0", annotations: [] };
}

async function importLayoutArchive(page: Page): Promise<void> {
  await page.getByTestId("archive-file-input").setInputFiles({
    name: "feature009-browser-layout.scene.zip",
    mimeType: "application/zip",
    buffer: Buffer.from(await layoutArchive()),
  });
  await expect(page.locator(".project-copy strong")).toHaveText("Feature 006 Layout Fixture");
  await readyCanvas(page);
  await expectRevision(page, 1);
  await expectStoredRevision(page, 1);
}

async function storedDocument(page: Page): Promise<SceneDocument> {
  return JSON.parse(await activeStoredDocumentJson(page)) as SceneDocument;
}

function entityPosition(document: SceneDocument, entityId: string): readonly number[] {
  const entity = document.entities.find((candidate) => candidate.id === entityId);
  if (entity === undefined) throw new Error(`Missing entity ${entityId}.`);
  return entity.transform.position;
}

async function exportJson(page: Page, testInfo: TestInfo, fileName: string): Promise<string> {
  await page.getByRole("button", { name: "Open project menu" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("export-json-command").click();
  const download = await downloadPromise;
  const outputPath = testInfo.outputPath(fileName);
  await download.saveAs(outputPath);
  return readFile(outputPath, "utf8");
}

async function publishedRuntimeSnapshot(
  page: Page,
): Promise<ViewerSnapshot & { readonly alarmKeys?: readonly string[] }> {
  const status = page.locator("#scene-status");
  await expect.poll(() => status.getAttribute("data-runtime-snapshot")).not.toBeNull();
  const serialized = await status.getAttribute("data-runtime-snapshot");
  if (serialized === null) throw new Error("Published Runtime snapshot evidence is missing.");
  return JSON.parse(serialized) as ViewerSnapshot & { readonly alarmKeys?: readonly string[] };
}

function canvasMetrics(screenshot: Buffer): {
  readonly distinctColors: number;
} {
  const image = PNG.sync.read(screenshot);
  const colors = new Set<string>();
  const samples = 64;
  for (let row = 0; row < samples; row += 1) {
    const y = Math.floor((row / (samples - 1)) * (image.height - 1));
    for (let column = 0; column < samples; column += 1) {
      const x = Math.floor((column / (samples - 1)) * (image.width - 1));
      const index = (y * image.width + x) * 4;
      colors.add(
        `${(image.data[index] ?? 0) >> 4}:${(image.data[index + 1] ?? 0) >> 4}:${
          (image.data[index + 2] ?? 0) >> 4
        }:${(image.data[index + 3] ?? 0) >> 4}`,
      );
    }
  }
  return { distinctColors: colors.size };
}

async function captureCanvasPng(
  canvas: ReturnType<Page["locator"]>,
  runtimeErrors: string[],
  engine: BrowserEngine,
): Promise<Buffer> {
  const errorOffset = runtimeErrors.length;
  const screenshot = await canvas.screenshot();
  const instrumentationErrors = runtimeErrors.splice(errorOffset);
  if (engine === "webkit") {
    expect(instrumentationErrors).toEqual([webkitScreenshotCspNoise, webkitScreenshotCspNoise]);
    console.log(
      "feature009-browser instrumentation=playwright-webkit-screenshot-csp-noise isolated=2 application_errors=0",
    );
  } else {
    expect(instrumentationErrors).toEqual([]);
  }
  return screenshot;
}

async function expectNoPageOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => ({
    horizontal: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    vertical: document.documentElement.scrollHeight - document.documentElement.clientHeight,
  }));
  expect(overflow.horizontal).toBeLessThanOrEqual(1);
  expect(overflow.vertical).toBeLessThanOrEqual(1);
}
