import { readFile } from "node:fs/promises";
import path from "node:path";

import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  exportSceneArchive,
  importSceneArchive,
  type SceneDocument,
} from "../../packages/document/src/index.js";

const studioUrl = "/";
const localeKey = "web3d.studio.locale";
const scenePath = path.resolve("tests/fixtures/006-layout/layout.scene.json");
const assetPath = path.resolve("tests/fixtures/m0-factory/public/m0-factory-cell.glb");
const assetSha256 = "e123f3d64ec60f136d8673478eb2fd2ce28f56bcb5fb94cef5a7377b9605efe8";
const artifact = (name: string) => `artifacts/e2e/${name}`;

test.describe("Scene appearance and lighting", () => {
  test("previews and persists one concrete 1.2 environment without recreating the Viewer", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const runtimeErrors = observeRuntimeErrors(page);
    await page.addInitScript((key) => localStorage.setItem(key, "en"), localeKey);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(studioUrl);
    await readyCanvas(page);

    const canvas = await importAppearanceArchive(page);
    const canvasIdentity = await markCanvasIdentity(canvas);
    const baselinePixels = await canvas.screenshot();
    expect(await canvasHasContent(page, canvas)).toBe(true);
    await expectRevision(page, 1);
    const storedBefore = await activeStoredDocument(page);
    expect(storedBefore).toMatchObject({
      schemaVersion: "1.2.0",
      revision: 1,
      environment: {
        backgroundMode: "custom",
        background: "#F4F6F5",
        grid: true,
        lighting: standardLighting(),
      },
    });

    await openSceneSettings(page);
    const dialog = page.getByRole("dialog", { name: "Scene settings" });
    await dialog.getByRole("tab", { name: "Lighting" }).click();
    await dialog.getByRole("button", { name: "Contrast", exact: true }).click();
    const contrastPixels = await canvas.screenshot();
    expect(await canvasPixelDifference(page, baselinePixels, contrastPixels)).toBeGreaterThan(
      0.002,
    );
    expect(await activeStoredDocument(page)).toEqual(storedBefore);
    await expectRevision(page, 1);
    await expectCanvasIdentity(page, canvasIdentity);

    await dialog.getByRole("tab", { name: "Appearance" }).click();
    await dialog.getByText("Custom color", { exact: true }).click();
    await setColorInput(dialog.getByLabel("Background color"), "#DDE4E1");
    await dialog.getByLabel("Show grid").uncheck();
    await expectCanvasBackground(page, canvas, [221, 228, 225]);
    await expectCanvasIdentity(page, canvasIdentity);
    expect(await activeStoredDocument(page)).toEqual(storedBefore);

    await dialog.getByRole("button", { name: "Apply", exact: true }).click();
    await expect(dialog).toBeHidden();
    await expectRevision(page, 2);
    await expectCanvasIdentity(page, canvasIdentity);
    await expect
      .poll(() => activeStoredDocument(page))
      .toMatchObject({
        schemaVersion: "1.2.0",
        revision: 2,
        environment: concreteEnvironment(),
      });

    await page.getByRole("button", { name: "Undo" }).click();
    await expectRevision(page, 3);
    await expectCanvasBackground(page, canvas, [244, 246, 245]);
    expect(
      await canvasPixelDifference(page, baselinePixels, await canvas.screenshot()),
    ).toBeLessThan(0.002);
    await page.getByRole("button", { name: "Redo" }).click();
    await expectRevision(page, 4);
    await expectCanvasBackground(page, canvas, [221, 228, 225]);
    await expectCanvasIdentity(page, canvasIdentity);

    await openProjectMenu(page);
    const jsonDownloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export JSON", exact: true }).click();
    const jsonDownload = await jsonDownloadPromise;
    const jsonPath = test.info().outputPath("scene-appearance.scene.json");
    await jsonDownload.saveAs(jsonPath);
    const jsonDocument = JSON.parse(await readFile(jsonPath, "utf8")) as SceneDocument;
    expect(jsonDocument).toMatchObject({
      schemaVersion: "1.2.0",
      revision: 4,
      environment: concreteEnvironment(),
    });
    expect(JSON.stringify(jsonDocument)).not.toContain('"preset"');

    const archiveDownloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export", exact: true }).click();
    const archiveDownload = await archiveDownloadPromise;
    const archivePath = test.info().outputPath("scene-appearance.scene.zip");
    await archiveDownload.saveAs(archivePath);
    const archive = await importSceneArchive(new Uint8Array(await readFile(archivePath)));
    expect(archive.manifest).toMatchObject({
      archiveVersion: "1.0.0",
      sceneSchemaVersion: "1.2.0",
    });
    expect(archive.document).toMatchObject({
      schemaVersion: "1.2.0",
      revision: 4,
      environment: concreteEnvironment(),
    });
    expect(JSON.stringify(archive.document)).not.toContain('"preset"');

    await expect
      .poll(() => activeStoredDocument(page))
      .toMatchObject({
        schemaVersion: "1.2.0",
        revision: 4,
        environment: concreteEnvironment(),
      });
    await page.screenshot({
      path: artifact("studio-scene-appearance-light-1440x900.png"),
      fullPage: true,
    });
    expect(runtimeErrors).toEqual([]);
  });
});

async function importAppearanceArchive(page: Page): Promise<Locator> {
  const [sceneJson, assetBuffer] = await Promise.all([
    readFile(scenePath, "utf8"),
    readFile(assetPath),
  ]);
  const assetBytes = new Uint8Array(
    assetBuffer.buffer.slice(
      assetBuffer.byteOffset,
      assetBuffer.byteOffset + assetBuffer.byteLength,
    ),
  );
  const archive = await exportSceneArchive({
    document: JSON.parse(sceneJson) as SceneDocument,
    createdAt: "2026-07-16T00:00:00.000Z",
    resolveAssetBytes: new Map([[assetSha256, assetBytes]]),
  });
  await page.getByTestId("archive-file-input").setInputFiles({
    name: "006a3-scene-appearance.scene.zip",
    mimeType: "application/zip",
    buffer: Buffer.from(archive),
  });
  await expect(page.locator(".project-copy strong")).toHaveText("Feature 006 Layout Fixture");
  const canvas = await readyCanvas(page);
  await expect(page.getByTestId("save-state")).toHaveText("Saved locally");
  return canvas;
}

async function openSceneSettings(page: Page): Promise<void> {
  await openProjectMenu(page);
  await page.getByRole("button", { name: "Scene settings", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Scene settings" })).toBeVisible();
}

async function openProjectMenu(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Open project menu" }).click();
  await expect(page.getByRole("region", { name: "Project menu" })).toBeVisible();
}

async function setColorInput(input: Locator, value: string): Promise<void> {
  await input.evaluate((element, next) => {
    const control = element as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (setter === undefined) throw new Error("Color input setter is unavailable.");
    setter.call(control, next);
    control.dispatchEvent(new Event("input", { bubbles: true }));
    control.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}

async function readyCanvas(page: Page): Promise<Locator> {
  const canvas = page.locator('canvas[data-web3d-viewer="true"]');
  await expect(canvas).toBeVisible({ timeout: 15_000 });
  await expect
    .poll(() =>
      canvas.evaluate((element) => {
        const value = element as HTMLCanvasElement;
        return value.width > 100 && value.height > 100;
      }),
    )
    .toBe(true);
  return canvas;
}

async function expectRevision(page: Page, revision: number): Promise<void> {
  await expect(page.getByTestId("document-revision")).toHaveAttribute(
    "data-revision",
    String(revision),
  );
}

async function markCanvasIdentity(canvas: Locator): Promise<string> {
  const identity = `006a3-${Date.now()}`;
  await canvas.evaluate((element, value) => {
    element.dataset["e2eIdentity"] = value;
  }, identity);
  return identity;
}

async function expectCanvasIdentity(page: Page, identity: string): Promise<void> {
  await expect(page.locator('canvas[data-web3d-viewer="true"]')).toHaveAttribute(
    "data-e2e-identity",
    identity,
  );
  await expect(page.locator('canvas[data-web3d-viewer="true"]')).toHaveCount(1);
}

async function canvasHasContent(page: Page, canvas: Locator): Promise<boolean> {
  const encoded = (await canvas.screenshot()).toString("base64");
  return page.evaluate(async (base64) => {
    const image = await decodeImage(base64, 64, 64);
    const colors = new Set<string>();
    for (let index = 0; index < image.data.length; index += 4) {
      colors.add(
        `${(image.data[index] ?? 0) >> 4}:${(image.data[index + 1] ?? 0) >> 4}:${(image.data[index + 2] ?? 0) >> 4}`,
      );
    }
    return colors.size > 8;

    async function decodeImage(value: string, width: number, height: number): Promise<ImageData> {
      const response = await fetch(`data:image/png;base64,${value}`);
      const bitmap = await createImageBitmap(await response.blob());
      const surface = document.createElement("canvas");
      surface.width = width;
      surface.height = height;
      const context = surface.getContext("2d", { willReadFrequently: true });
      if (context === null) throw new Error("Canvas sampling context is unavailable.");
      context.drawImage(bitmap, 0, 0, width, height);
      bitmap.close();
      return context.getImageData(0, 0, width, height);
    }
  }, encoded);
}

async function canvasPixelDifference(page: Page, before: Buffer, after: Buffer): Promise<number> {
  return page.evaluate(
    async ({ beforeBase64, afterBase64 }) => {
      const decode = async (value: string): Promise<ImageData> => {
        const response = await fetch(`data:image/png;base64,${value}`);
        const bitmap = await createImageBitmap(await response.blob());
        const surface = document.createElement("canvas");
        surface.width = 128;
        surface.height = 128;
        const context = surface.getContext("2d", { willReadFrequently: true });
        if (context === null) throw new Error("Canvas sampling context is unavailable.");
        context.drawImage(bitmap, 0, 0, surface.width, surface.height);
        bitmap.close();
        return context.getImageData(0, 0, surface.width, surface.height);
      };
      const left = await decode(beforeBase64);
      const right = await decode(afterBase64);
      let changed = 0;
      for (let index = 0; index < left.data.length; index += 4) {
        const delta =
          Math.abs((left.data[index] ?? 0) - (right.data[index] ?? 0)) +
          Math.abs((left.data[index + 1] ?? 0) - (right.data[index + 1] ?? 0)) +
          Math.abs((left.data[index + 2] ?? 0) - (right.data[index + 2] ?? 0));
        if (delta > 24) changed += 1;
      }
      return changed / (left.data.length / 4);
    },
    { beforeBase64: before.toString("base64"), afterBase64: after.toString("base64") },
  );
}

async function expectCanvasBackground(
  page: Page,
  canvas: Locator,
  expected: readonly [number, number, number],
): Promise<void> {
  await expect
    .poll(async () => {
      const encoded = (await canvas.screenshot()).toString("base64");
      const actual = await page.evaluate(async (base64) => {
        const response = await fetch(`data:image/png;base64,${base64}`);
        const bitmap = await createImageBitmap(await response.blob());
        const surface = document.createElement("canvas");
        surface.width = bitmap.width;
        surface.height = bitmap.height;
        const context = surface.getContext("2d", { willReadFrequently: true });
        if (context === null) throw new Error("Canvas sampling context is unavailable.");
        context.drawImage(bitmap, 0, 0);
        bitmap.close();
        const points = [
          [4, 4],
          [12, 4],
          [surface.width - 5, 4],
          [surface.width - 13, 4],
        ] as const;
        let red = 0;
        let green = 0;
        let blue = 0;
        for (const [x, y] of points) {
          const pixel = context.getImageData(x, y, 1, 1).data;
          red += pixel[0] ?? 0;
          green += pixel[1] ?? 0;
          blue += pixel[2] ?? 0;
        }
        const average = [red, green, blue].map((value) => value / points.length);
        const backdrop = document.querySelector<HTMLElement>(".dialog-backdrop");
        const backdropColor = backdrop === null ? null : getComputedStyle(backdrop).backgroundColor;
        const match = backdropColor?.match(
          /^rgba?\(\s*([\d.]+)[, ]+\s*([\d.]+)[, ]+\s*([\d.]+)(?:\s*[/,]\s*([\d.]+))?\s*\)$/u,
        );
        const alpha = Number(match?.[4] ?? 0);
        if (match === undefined || match === null || alpha <= 0 || alpha >= 1) {
          return average.map(Math.round) as [number, number, number];
        }
        const overlay = [Number(match[1]), Number(match[2]), Number(match[3])];
        return average.map((value, index) =>
          Math.round((value - (overlay[index] ?? 0) * alpha) / (1 - alpha)),
        ) as [number, number, number];
      }, encoded);
      return Math.max(...actual.map((value, index) => Math.abs(value - expected[index]!)));
    })
    .toBeLessThanOrEqual(3);
}

interface StoredProject {
  readonly lastOpenedAt: string;
  readonly documentJson: string;
}

async function activeStoredDocument(page: Page): Promise<unknown> {
  const projects = await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("web3d-studio", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Failed to inspect IndexedDB."));
    });
    try {
      return await new Promise<StoredProject[]>((resolve, reject) => {
        const request = database
          .transaction("projects", "readonly")
          .objectStore("projects")
          .getAll();
        request.onsuccess = () => resolve(request.result as StoredProject[]);
        request.onerror = () => reject(request.error ?? new Error("Failed to inspect projects."));
      });
    } finally {
      database.close();
    }
  });
  const active = projects.toSorted((left, right) =>
    right.lastOpenedAt.localeCompare(left.lastOpenedAt),
  )[0];
  return active === undefined ? null : JSON.parse(active.documentJson);
}

function standardLighting() {
  return {
    fill: { skyColor: "#FFFFFF", groundColor: "#65706A", intensity: 1.8 },
    key: {
      color: "#FFFFFF",
      intensity: 2.2,
      directionToLight: [0.37904902178945177, 0.7580980435789035, 0.5306686305052324],
    },
  } as const;
}

function concreteEnvironment() {
  return {
    backgroundMode: "custom",
    background: "#DDE4E1",
    grid: false,
    unit: "m",
    upAxis: "Y",
    lighting: {
      fill: { skyColor: "#DDE7E3", groundColor: "#3D4743", intensity: 0.9 },
      key: {
        color: "#FFF1D6",
        intensity: 3,
        directionToLight: [0.37904902178945177, 0.7580980435789035, 0.5306686305052324],
      },
    },
  } as const;
}

function observeRuntimeErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror:${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console:${message.text()}`);
  });
  return errors;
}
