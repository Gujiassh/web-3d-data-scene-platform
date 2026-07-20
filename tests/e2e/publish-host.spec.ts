import { readFile } from "node:fs/promises";
import path from "node:path";

import { expect, test, type Locator, type Page } from "@playwright/test";
import { PNG } from "pngjs";
import type { SceneDocument } from "../../packages/document/src/index.js";
import type { ViewerSnapshot } from "../../packages/runtime/src/index.js";

import { assertNoRuntimeErrors, observeRuntimeErrors, readyCanvas } from "./hotspot-test-helpers";

const studioUrl = "http://127.0.0.1:4192/";
const hostUrl = "http://127.0.0.1:4193/";
const fixtureScenePath = path.resolve("examples/minimal-host/public/published/scene.json");
const fixtureAssetPath = path.resolve(
  "examples/minimal-host/public/published/assets/e123f3d64ec60f136d8673478eb2fd2ce28f56bcb5fb94cef5a7377b9605efe8.glb",
);
const fixtureAssetUrl =
  "/published/assets/e123f3d64ec60f136d8673478eb2fd2ce28f56bcb5fb94cef5a7377b9605efe8.glb";
const artifact = (name: string) => `artifacts/e2e/${name}`;
const expectedCsp =
  "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' blob: data:; connect-src 'self' wss:; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'self'";

const desktopViewports = [
  { name: "1280x720", width: 1280, height: 720, pressPoint: { x: 555, y: 331 } },
  { name: "1440x900", width: 1440, height: 900, pressPoint: { x: 614, y: 414 } },
] as const;

test("keeps Studio Run and the minimal host on one canonical ready snapshot", async ({
  browser,
}) => {
  const sceneJson = await readFile(fixtureScenePath, "utf8");
  const document = JSON.parse(sceneJson) as SceneDocument;
  const assetBytes = new Uint8Array(await readFile(fixtureAssetPath));
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const studio = await context.newPage();
  observeRuntimeErrors(studio);
  await studio.goto(studioUrl);
  await readyCanvas(studio);
  await seedStudioProject(studio, sceneJson, assetBytes);
  await studio.reload();
  await readyCanvas(studio);
  await expect(studio.getByTestId("document-revision")).toHaveAttribute("data-revision", "4");
  await expect(studio.getByTestId("viewport-mode")).toContainText("NO SELECTION");
  await studio.getByRole("button", { name: "Run", exact: true }).click();
  await expect(studio.getByTestId("viewport-mode")).toContainText("RUN / SELECT / NO SELECTION");
  const studioSnapshot = await studioReadySnapshot(studio, document);
  const studioMetrics = await canvasMetrics(
    studio,
    studio.locator('canvas[data-web3d-viewer="true"]'),
  );
  expect(studioMetrics.readyGreenRatio).toBeGreaterThan(0.01);
  const storedSceneJson = await storedDocumentJson(studio, document.id);
  expect(storedSceneJson).toBe(sceneJson);
  await studio.screenshot({
    path: artifact("publish-parity-studio-run-1440x900.png"),
    fullPage: true,
  });

  const host = await context.newPage();
  observeRuntimeErrors(host);
  const response = await host.goto(hostUrl);
  expect(response?.headers()["content-security-policy"]).toBe(expectedCsp);
  await expect(host.locator("#scene-status")).toHaveText("Ready / revision 4");
  await expect(host.locator("#selection-value")).toHaveText("None");
  const hostSceneResponse = await host.request.get(`${hostUrl}published/scene.json`);
  const hostSceneJson = await hostSceneResponse.text();
  expect(hostSceneJson).toBe(sceneJson);
  const hostDocument = JSON.parse(hostSceneJson) as SceneDocument;
  expect(hostDocument).toEqual(document);
  const hostSnapshot = await hostReadySnapshot(host);
  expect(hostSnapshot).toEqual(studioSnapshot);
  const hostMetrics = await canvasMetrics(host, host.locator('canvas[data-web3d-viewer="true"]'));
  expect(hostMetrics.readyGreenRatio).toBeGreaterThan(0.01);
  await host.screenshot({
    path: artifact("publish-parity-host-1440x900.png"),
    fullPage: true,
  });
  expect(await storedDocumentJson(studio, document.id)).toBe(sceneJson);
  assertNoRuntimeErrors(studio);
  assertNoRuntimeErrors(host);
  await context.close();
});

for (const viewport of desktopViewports) {
  test(`proves production host interactions and static boundaries at ${viewport.name}`, async ({
    page,
    request,
  }) => {
    observeRuntimeErrors(page);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const rootResponse = await page.goto("/");
    expect(rootResponse?.headers()["content-security-policy"]).toBe(expectedCsp);
    await expect(page.locator("#scene-status")).toHaveText("Ready / revision 4");
    await expect(page.locator("#connection-value")).toHaveText("Online");
    const canvas = page.locator('canvas[data-web3d-viewer="true"]');
    await expect(canvas).toBeVisible();
    const metrics = await canvasMetrics(page, canvas);
    expect(metrics.opaqueRatio).toBeGreaterThan(0.99);
    expect(metrics.distinct).toBeGreaterThan(12);

    const manifest = await request.get("/published/publish-manifest.json");
    expect(manifest.status()).toBe(200);
    expect(manifest.headers()["content-type"]).toContain("application/json");
    const asset = await request.get(fixtureAssetUrl);
    expect(asset.status()).toBe(200);
    expect(asset.headers()["content-type"]).toContain("model/gltf-binary");
    const missing = await request.get("/published/missing.json");
    expect(missing.status()).toBe(404);
    expect(missing.headers()["content-type"]).toContain("text/plain");

    await page.mouse.click(viewport.pressPoint.x, viewport.pressPoint.y);
    await expect(page.locator("#selection-value")).toHaveText("press-01");
    await expect(page.locator("#selection-origin")).toHaveText("Viewer");

    const hotspot = page.getByRole("button", { name: "Press inspection", exact: true });
    await expect(hotspot).toBeVisible();
    await hotspot.click();
    const content = page.locator("#host-content");
    await expect(content).toBeVisible();
    await expect(content).toContainText("WO-1842");
    await expect(content).toContainText("Line A");
    await expect(content).not.toContainText("inspection-card");
    await expectInsideViewport(content, viewport.width, viewport.height);
    await page.screenshot({
      path: artifact(`publish-host-content-${viewport.name}.png`),
      fullPage: true,
    });

    await page.getByRole("button", { name: "Close inspection record" }).click();
    await page.locator("#target-select").selectOption("conveyor-01");
    const beforeFocus = await canvas.screenshot();
    await page.getByRole("button", { name: "Focus", exact: true }).click();
    await expect(page.locator("#selection-value")).toHaveText("conveyor-01");
    await expect(page.locator("#selection-origin")).toHaveText("Api");
    expect((await canvas.screenshot()).equals(beforeFocus)).toBe(false);

    expect(await request.get("/published/scene.json").then((value) => value.text())).toBe(
      await readFile(fixtureScenePath, "utf8"),
    );
    await expectNoPageOverflow(page);
    assertNoRuntimeErrors(page);
  });
}

test("keeps the published host usable on a mobile viewport", async ({ page }) => {
  observeRuntimeErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator("#scene-status")).toHaveText("Ready / revision 4");
  const canvas = page.locator('canvas[data-web3d-viewer="true"]');
  const metrics = await canvasMetrics(page, canvas);
  expect(metrics.opaqueRatio).toBeGreaterThan(0.99);
  expect(metrics.distinct).toBeGreaterThan(12);
  await expectInsideViewport(page.locator(".host-toolbar"), 390, 844);
  await expectInsideViewport(page.locator(".runtime-strip"), 390, 844);
  const hotspot = page.getByRole("button", { name: "Press inspection", exact: true });
  await expect(hotspot).toBeVisible();
  await hotspot.click();
  await expectInsideViewport(page.locator("#host-content"), 390, 844);
  await page.screenshot({
    path: artifact("publish-host-content-390x844.png"),
    fullPage: true,
  });
  await expectNoPageOverflow(page);
  assertNoRuntimeErrors(page);
});

async function seedStudioProject(
  page: Page,
  documentJson: string,
  assetBytes: Uint8Array,
): Promise<void> {
  await page.evaluate(
    async ({ documentText, bytes }) => {
      const document = JSON.parse(documentText) as SceneDocument;
      const asset = document.assets[0];
      if (asset === undefined) throw new Error("Parity fixture asset is missing.");
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("web3d-studio", 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error("Studio database open failed."));
      });
      try {
        await new Promise<void>((resolve, reject) => {
          const transaction = database.transaction(["projects", "assets", "settings"], "readwrite");
          transaction.objectStore("assets").put({
            sha256: asset.sha256,
            mediaType: asset.mediaType,
            byteLength: asset.byteLength,
            blob: new Blob([new Uint8Array(bytes)], { type: asset.mediaType }),
          });
          transaction.objectStore("projects").put({
            id: document.id,
            name: document.name,
            createdAt: "2026-07-20T00:00:00.000Z",
            updatedAt: "2026-07-20T00:00:00.000Z",
            lastOpenedAt: "2026-07-20T00:00:00.000Z",
            lastSavedRevision: document.revision,
            lastExportedRevision: null,
            documentJson: documentText,
          });
          transaction
            .objectStore("settings")
            .put({ key: "recent-project-ids", value: [document.id] });
          transaction.objectStore("settings").put({ key: "last-project-id", value: document.id });
          transaction.oncomplete = () => resolve();
          transaction.onabort = () => reject(transaction.error ?? new Error("Seed aborted."));
          transaction.onerror = () => reject(transaction.error ?? new Error("Seed failed."));
        });
      } finally {
        database.close();
      }
    },
    { documentText: documentJson, bytes: [...assetBytes] },
  );
}

async function storedDocumentJson(page: Page, projectId: string): Promise<string> {
  return page.evaluate(async (id) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("web3d-studio", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Studio database open failed."));
    });
    try {
      return await new Promise<string>((resolve, reject) => {
        const request = database
          .transaction("projects", "readonly")
          .objectStore("projects")
          .get(id);
        request.onsuccess = () => resolve(String(request.result?.documentJson ?? ""));
        request.onerror = () => reject(request.error ?? new Error("Stored project read failed."));
      });
    } finally {
      database.close();
    }
  }, projectId);
}

interface NormalizedRuntimeSnapshot {
  readonly lifecycle: "ready";
  readonly documentId: string;
  readonly revision: number;
  readonly selectedTargetId: null;
  readonly connections: Readonly<Record<string, "online">>;
  readonly alarmKeys: readonly string[];
}

async function studioReadySnapshot(
  page: Page,
  document: SceneDocument,
): Promise<NormalizedRuntimeSnapshot> {
  const sourceRows = page
    .locator(".run-preview-panel .data-section")
    .first()
    .locator(".runtime-row");
  await expect(sourceRows).toHaveCount(document.dataSources.length);
  for (const source of document.dataSources) {
    const row = sourceRows.filter({ hasText: source.id });
    await expect(row).toHaveCount(1);
    await expect(row.locator(".runtime-status")).toHaveClass(/status-online/u);
  }
  const bindingValues = page.locator(".run-preview-panel .runtime-value");
  await expect(bindingValues).toHaveCount(document.bindings.length);
  await expect(bindingValues).toHaveText(document.bindings.map(() => "ready"));
  await expect(page.locator(".run-preview-panel .runtime-quality")).toHaveText(
    document.bindings.map(() => "Good"),
  );
  await expect(page.locator(".run-preview-panel .runtime-alarm")).toHaveCount(0);
  await expect(page.locator(".run-preview-panel .section-count")).toHaveText(["0", "0"]);
  await expect(page.locator(".run-preview-panel .runtime-diagnostics")).toHaveText("None");
  return {
    lifecycle: "ready",
    documentId: document.id,
    revision: document.revision,
    selectedTargetId: null,
    connections: Object.fromEntries(document.dataSources.map((source) => [source.id, "online"])),
    alarmKeys: [],
  };
}

async function hostReadySnapshot(page: Page): Promise<NormalizedRuntimeSnapshot> {
  const status = page.locator("#scene-status");
  await expect.poll(() => status.getAttribute("data-runtime-snapshot")).not.toBeNull();
  const serialized = await status.getAttribute("data-runtime-snapshot");
  if (serialized === null) throw new Error("Minimal host Runtime snapshot evidence is missing.");
  return normalizeReadySnapshot(JSON.parse(serialized) as ViewerSnapshot & { alarmKeys: string[] });
}

function normalizeReadySnapshot(
  snapshot: ViewerSnapshot & { readonly alarmKeys?: readonly string[] },
): NormalizedRuntimeSnapshot {
  expect(snapshot.lifecycle).toBe("ready");
  expect(snapshot.documentId).not.toBeNull();
  expect(snapshot.revision).not.toBeNull();
  expect(snapshot.selectedTargetId).toBeNull();
  expect(Object.values(snapshot.connections)).toEqual(
    Object.values(snapshot.connections).map(() => "online"),
  );
  expect(snapshot.alarmKeys ?? snapshot.alarms.map((alarm) => alarm.key)).toEqual([]);
  return {
    lifecycle: "ready",
    documentId: snapshot.documentId!,
    revision: snapshot.revision!,
    selectedTargetId: null,
    connections: snapshot.connections as Readonly<Record<string, "online">>,
    alarmKeys: [],
  };
}

async function canvasMetrics(_page: Page, canvas: Locator) {
  const image = PNG.sync.read(await canvas.screenshot());
  const colors = new Set<string>();
  let opaque = 0;
  let readyGreen = 0;
  const samples = 96;
  for (let row = 0; row < samples; row += 1) {
    const y = Math.floor((row / (samples - 1)) * (image.height - 1));
    for (let column = 0; column < samples; column += 1) {
      const x = Math.floor((column / (samples - 1)) * (image.width - 1));
      const index = (y * image.width + x) * 4;
      const red = image.data[index] ?? 0;
      const green = image.data[index + 1] ?? 0;
      const blue = image.data[index + 2] ?? 0;
      const alpha = image.data[index + 3] ?? 0;
      if (alpha > 250) opaque += 1;
      if (alpha > 250 && green > red * 1.1 && green > blue * 1.05 && green > 80) {
        readyGreen += 1;
      }
      colors.add(`${red >> 4}:${green >> 4}:${blue >> 4}:${alpha >> 4}`);
    }
  }
  return {
    distinct: colors.size,
    opaqueRatio: opaque / (samples * samples),
    readyGreenRatio: readyGreen / (samples * samples),
  };
}

async function expectInsideViewport(
  locator: Locator,
  viewportWidth: number,
  viewportHeight: number,
): Promise<void> {
  const bounds = await locator.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds?.x ?? -1).toBeGreaterThanOrEqual(0);
  expect(bounds?.y ?? -1).toBeGreaterThanOrEqual(0);
  expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(viewportWidth + 1);
  expect((bounds?.y ?? 0) + (bounds?.height ?? 0)).toBeLessThanOrEqual(viewportHeight + 1);
}

async function expectNoPageOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => ({
    horizontal: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    vertical: document.documentElement.scrollHeight - document.documentElement.clientHeight,
  }));
  expect(overflow.horizontal).toBeLessThanOrEqual(1);
  expect(overflow.vertical).toBeLessThanOrEqual(1);
}
