import { readFile } from "node:fs/promises";
import path from "node:path";

import { expect, test, type Locator, type Page } from "@playwright/test";
import { importSceneArchive, type SceneDocument } from "../../packages/document/src/index.js";

const studioUrl = "http://127.0.0.1:4173";
const factoryModelPath = path.resolve("assets/factory/public/m0-factory-cell.glb");
const factoryModelSha256 = "e123f3d64ec60f136d8673478eb2fd2ce28f56bcb5fb94cef5a7377b9605efe8";
const artifact = (name: string) => `artifacts/e2e/${name}`;

test.describe("M1 Studio browser acceptance", () => {
  test("completes the authoring, history, autosave, and reload loop", async ({ page }) => {
    test.setTimeout(60_000);
    const runtimeErrors = observeRuntimeErrors(page);
    const canvas = await openEmptyStudio(page);
    const row = await importFactoryModel(page);
    const importedPixels = await canvasMetrics(page, canvas);
    expect(importedPixels.opaqueRatio).toBeGreaterThan(0.99);
    expect(importedPixels.distinct).toBeGreaterThan(12);
    expect(importedPixels.nonWhiteRatio).toBeGreaterThan(0.02);

    await expect(row).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("document-revision")).toHaveText("revision 1");
    await expect(page.getByRole("button", { name: "Undo" })).toBeEnabled();
    await expect(page.getByTestId("export-state")).toHaveText("Export outdated");

    await page.keyboard.press("Escape");
    await expect(row).toHaveAttribute("aria-selected", "false");
    await canvas.click({ position: { x: 430, y: 400 } });
    await expect(row).toHaveAttribute("aria-selected", "true");

    const nameInput = page.getByLabel("Name", { exact: true });
    await nameInput.fill("Factory Cell");
    await nameInput.press("Enter");
    await expectRevision(page, 2);

    const positionX = page.getByLabel("Position X");
    await positionX.fill("1.5");
    await positionX.press("Tab");
    await expectRevision(page, 3);

    const renamedRow = page.getByRole("treeitem").filter({ hasText: "Factory Cell" }).first();
    await renamedRow.getByRole("button", { name: "Hide Factory Cell" }).click();
    await expectRevision(page, 4);
    await renamedRow.getByRole("button", { name: "Lock Factory Cell" }).click();
    await expectRevision(page, 5);
    await expect(positionX).toBeDisabled();
    await expect(page.getByText("Locked", { exact: true })).toBeVisible();
    await page.screenshot({ path: artifact("m1-locked-hidden-1440x900.png"), fullPage: true });

    await page.getByRole("button", { name: "Undo" }).click();
    await expectRevision(page, 6);
    await expect(positionX).toBeEnabled();
    await page.getByRole("button", { name: "Undo" }).click();
    await expectRevision(page, 7);
    await expect(renamedRow.getByRole("button", { name: "Hide Factory Cell" })).toBeVisible();
    await page.getByRole("button", { name: "Undo" }).click();
    await expectRevision(page, 8);
    await expect(positionX).toHaveValue("0");

    await page.getByRole("button", { name: "Redo" }).click();
    await expectRevision(page, 9);
    await expect(positionX).toHaveValue("1.5");
    await page.getByRole("button", { name: "Redo" }).click();
    await expectRevision(page, 10);
    await expect(renamedRow.getByRole("button", { name: "Show Factory Cell" })).toBeVisible();
    await page.getByRole("button", { name: "Redo" }).click();
    await expectRevision(page, 11);
    await expect(positionX).toBeDisabled();

    await renamedRow.getByRole("button", { name: "Show Factory Cell" }).click();
    await expectRevision(page, 12);
    await renamedRow.getByRole("button", { name: "Unlock Factory Cell" }).click();
    await expectRevision(page, 13);

    const selectFrame = await canvas.screenshot();
    await page.getByRole("button", { name: "Move" }).click();
    await expect(page.getByTestId("viewport-mode")).toContainText("TRANSLATE");
    await page.waitForTimeout(150);
    const moveFrame = await canvas.screenshot();
    expect(moveFrame.equals(selectFrame)).toBe(false);
    expect((await canvasMetrics(page, canvas)).axisColorRatio).toBeGreaterThan(0.0005);
    await page.screenshot({ path: artifact("m1-move-gizmo-1440x900.png"), fullPage: true });

    const canvasBox = await canvas.boundingBox();
    expect(canvasBox).not.toBeNull();
    const dragStart = {
      x: (canvasBox?.x ?? 0) + (canvasBox?.width ?? 0) * 0.69,
      y: (canvasBox?.y ?? 0) + (canvasBox?.height ?? 0) * 0.57,
    };
    await page.mouse.move(dragStart.x, dragStart.y);
    await page.mouse.down();
    await page.mouse.move(dragStart.x + (canvasBox?.width ?? 0) * 0.08, dragStart.y, { steps: 8 });
    await expectRevision(page, 13);
    await page.screenshot({ path: artifact("m1-transform-preview-1440x900.png"), fullPage: true });
    await page.mouse.up();
    await expectRevision(page, 14);
    expect(Number(await positionX.inputValue())).toBeGreaterThan(1.5);

    await page.getByRole("button", { name: "Rotate" }).click();
    await expect(page.getByTestId("viewport-mode")).toContainText("ROTATE");
    await page.waitForTimeout(150);
    const rotateFrame = await canvas.screenshot();
    expect(rotateFrame.equals(moveFrame)).toBe(false);

    await page.getByRole("button", { name: "Scale" }).click();
    await expect(page.getByTestId("viewport-mode")).toContainText("SCALE");
    await page.waitForTimeout(150);
    const scaleFrame = await canvas.screenshot();
    expect(scaleFrame.equals(rotateFrame)).toBe(false);

    await page.getByRole("button", { name: "Run", exact: true }).click();
    await expect(page.getByRole("button", { name: "Scale" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Duplicate selection" })).toBeDisabled();
    await page.keyboard.press("w");
    await page.keyboard.press("Delete");
    await expectRevision(page, 14);
    await expect(page.getByRole("treeitem")).toHaveCount(1);
    await expect(page.getByTestId("viewport-mode")).toContainText("RUN / SELECT");
    await page.getByRole("button", { name: "Edit", exact: true }).click();

    await page.getByRole("button", { name: "Duplicate selection" }).click();
    await expectRevision(page, 15);
    await expect(page.getByRole("treeitem")).toHaveCount(2);
    await page.getByRole("button", { name: "Delete selection" }).click();
    await expectRevision(page, 16);
    await expect(page.getByRole("treeitem")).toHaveCount(1);
    await expect(page.getByText("No selection", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Undo" }).click();
    await expectRevision(page, 17);
    await expect(page.getByRole("treeitem")).toHaveCount(2);

    await expectStoredRevision(page, 17);
    await expect(page.getByTestId("save-state")).toHaveText("Saved locally");
    await page.reload();
    await readyCanvas(page);
    await expect(page.getByTestId("document-revision")).toHaveText("revision 17");
    await expect(page.getByRole("treeitem")).toHaveCount(2);
    await expect(page.getByRole("treeitem").filter({ hasText: "Factory Cell" })).toHaveCount(2);

    await page.getByRole("treeitem").filter({ hasText: "Factory Cell" }).first().click();
    const reloadNameInput = page.getByLabel("Name", { exact: true });
    await reloadNameInput.fill("Reload Flush Cell");
    await reloadNameInput.press("Enter");
    await expectRevision(page, 18);
    await reloadFromDocument(page);
    await readyCanvas(page);
    await expect(page.getByTestId("document-revision")).toHaveText("revision 18");
    await expect(page.getByRole("treeitem").filter({ hasText: "Reload Flush Cell" })).toHaveCount(
      1,
    );
    await expectNoPageOverflow(page);
    expect(runtimeErrors).toEqual([]);
  });

  test("round-trips the canonical document through JSON and ZIP", async ({ page }) => {
    test.setTimeout(60_000);
    const runtimeErrors = observeRuntimeErrors(page);
    await openEmptyStudio(page);
    await importFactoryModel(page);

    const nameInput = page.getByLabel("Name", { exact: true });
    await nameInput.fill("Archive Cell");
    await nameInput.press("Enter");
    await expectRevision(page, 2);

    await page.getByRole("button", { name: "Open project menu" }).click();
    const jsonDownloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export JSON" }).click();
    const jsonDownload = await jsonDownloadPromise;
    const jsonPath = test.info().outputPath("m1.scene.json");
    await jsonDownload.saveAs(jsonPath);
    const canonicalDocument = JSON.parse(await readFile(jsonPath, "utf8")) as SceneDocument;
    expect(canonicalDocument.entities[0]?.name).toBe("Archive Cell");
    expect(canonicalDocument.assets[0]?.uri).toBe(`asset://${factoryModelSha256}`);
    await expectStoredRevision(page, 2);
    await expect(page.getByTestId("save-state")).toHaveText("Saved locally");

    const archiveDownloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export", exact: true }).click();
    const archiveDownload = await archiveDownloadPromise;
    const archivePath = test.info().outputPath("m1.scene.zip");
    await archiveDownload.saveAs(archivePath);

    const importedArchive = await importSceneArchive(new Uint8Array(await readFile(archivePath)));
    expect(importedArchive.document).toEqual(canonicalDocument);
    expect(importedArchive.assets).toHaveLength(1);
    expect(importedArchive.assets[0]?.sha256).toBe(factoryModelSha256);
    expect(importedArchive.assets[0]?.bytes.byteLength).toBe(1_216);
    await expect(page.getByTestId("export-state")).toHaveCount(0);

    await page.getByTestId("json-file-input").setInputFiles(jsonPath);
    await expect(page.getByRole("treeitem").filter({ hasText: "Archive Cell" })).toHaveCount(1);
    await expect(page.getByTestId("document-revision")).toHaveText("revision 2");
    const jsonRoundTrip = await exportJsonFromStudio(page, "json-round-trip.scene.json");
    expect(JSON.parse(await readFile(jsonRoundTrip, "utf8"))).toEqual(canonicalDocument);

    await page.getByTestId("archive-file-input").setInputFiles(archivePath);
    await expect(page.getByRole("treeitem").filter({ hasText: "Archive Cell" })).toHaveCount(1);
    await expect(page.getByTestId("document-revision")).toHaveText("revision 2");
    const archiveRoundTrip = await exportJsonFromStudio(page, "archive-round-trip.scene.json");
    expect(JSON.parse(await readFile(archiveRoundTrip, "utf8"))).toEqual(canonicalDocument);
    await page.getByRole("button", { name: "Assets" }).click();
    await expect(page.getByText("m0-factory-cell", { exact: true })).toBeVisible();
    await page.screenshot({ path: artifact("m1-archive-round-trip-1440x900.png"), fullPage: true });
    expect(runtimeErrors).toEqual([]);
  });

  test("preserves the project on invalid input and retries a failed local save", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await installStorageEstimateControl(page);
    const runtimeErrors = observeRuntimeErrors(page);
    await openEmptyStudio(page);
    await importFactoryModel(page);
    await expectStoredRevision(page, 1);

    await page.getByTestId("model-file-input").setInputFiles({
      name: "damaged.glb",
      mimeType: "model/gltf-binary",
      buffer: Buffer.from("not-a-glb"),
    });
    const failure = page.getByRole("alert");
    await expect(failure).toContainText("Import failed");
    await expect(page.getByTestId("document-revision")).toHaveText("revision 1");
    await expect(page.getByRole("treeitem")).toHaveCount(1);
    await page.screenshot({ path: artifact("m1-invalid-import-1440x900.png"), fullPage: true });
    await page.getByRole("button", { name: "Close import" }).click();
    await expectStoredRevision(page, 1);

    await setStorageFailure(page, true);
    const nameInput = page.getByLabel("Name", { exact: true });
    await nameInput.fill("Unsaved Cell");
    await nameInput.press("Enter");
    await expectRevision(page, 2);
    await expect(page.getByTestId("save-state")).toHaveText("Save failed", { timeout: 5_000 });
    await expectStoredRevision(page, 1);
    await page.screenshot({ path: artifact("m1-save-failed-1440x900.png"), fullPage: true });

    await setStorageFailure(page, false);
    await page.getByRole("button", { name: "Save local project" }).click();
    await expectStoredRevision(page, 2);
    await expect(page.getByTestId("save-state")).toHaveText("Saved locally");
    await page.reload();
    await readyCanvas(page);
    await expect(page.getByRole("treeitem").filter({ hasText: "Unsaved Cell" })).toHaveCount(1);
    expect(runtimeErrors).toEqual([]);
  });
});

async function openEmptyStudio(page: Page): Promise<Locator> {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(studioUrl);
  const canvas = await readyCanvas(page);
  await expect(page.getByTestId("save-state")).toHaveText("Saved locally");
  await expect(page.getByTestId("document-revision")).toHaveText("revision 0");
  await expect(page.getByRole("treeitem")).toHaveCount(0);
  return canvas;
}

async function importFactoryModel(page: Page): Promise<Locator> {
  await page.getByTestId("model-file-input").setInputFiles(factoryModelPath);
  const dialog = page.getByRole("dialog", { name: "Import model" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId("import-summary")).toContainText("Nodes");
  await expect(dialog.getByText(factoryModelSha256, { exact: true })).toBeVisible();
  await page.screenshot({ path: artifact("m1-import-summary-1440x900.png"), fullPage: true });
  await dialog.getByRole("button", { name: "Add to scene" }).click();
  await expect(dialog).toBeHidden();
  const row = page.getByRole("treeitem").filter({ hasText: "m0-factory-cell" }).first();
  await expect(row).toBeVisible();
  await expect(page.getByTestId("save-state")).toHaveText("Saved locally");
  return row;
}

async function exportJsonFromStudio(page: Page, name: string): Promise<string> {
  await page.getByRole("button", { name: "Open project menu" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  const download = await downloadPromise;
  const outputPath = test.info().outputPath(name);
  await download.saveAs(outputPath);
  return outputPath;
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

async function reloadFromDocument(page: Page): Promise<void> {
  const loaded = page.waitForEvent("domcontentloaded");
  await page.evaluate(() => {
    location.reload();
  });
  await loaded;
}

async function expectRevision(page: Page, revision: number): Promise<void> {
  await expect(page.getByTestId("document-revision")).toHaveText(`revision ${revision}`);
}

async function expectStoredRevision(page: Page, revision: number): Promise<void> {
  await expect
    .poll(async () => {
      const projects = await storedProjects(page);
      return Math.max(...projects.map((project) => project.lastSavedRevision), -1);
    })
    .toBe(revision);
}

async function storedProjects(
  page: Page,
): Promise<readonly { lastSavedRevision: number; documentJson: string }[]> {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("web3d-studio", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Failed to inspect IndexedDB."));
    });
    try {
      return await new Promise<Array<{ lastSavedRevision: number; documentJson: string }>>(
        (resolve, reject) => {
          const request = database
            .transaction("projects", "readonly")
            .objectStore("projects")
            .getAll();
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error ?? new Error("Failed to inspect projects."));
        },
      );
    } finally {
      database.close();
    }
  });
}

async function installStorageEstimateControl(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const controlled = globalThis as typeof globalThis & { __forceStorageFailure?: boolean };
    controlled.__forceStorageFailure = false;
    Object.defineProperty(navigator.storage, "estimate", {
      configurable: true,
      value: async () =>
        controlled.__forceStorageFailure
          ? { quota: 0, usage: 0 }
          : { quota: 1_000_000_000, usage: 0 },
    });
  });
}

async function setStorageFailure(page: Page, failing: boolean): Promise<void> {
  await page.evaluate((value) => {
    (globalThis as typeof globalThis & { __forceStorageFailure?: boolean }).__forceStorageFailure =
      value;
  }, failing);
}

async function expectNoPageOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => ({
    horizontal: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    vertical: document.documentElement.scrollHeight - document.documentElement.clientHeight,
  }));
  expect(overflow.horizontal).toBeLessThanOrEqual(1);
  expect(overflow.vertical).toBeLessThanOrEqual(1);
}

async function canvasMetrics(page: Page, canvas: Locator) {
  const encoded = (await canvas.screenshot()).toString("base64");
  return page.evaluate(async (base64) => {
    const response = await fetch(`data:image/png;base64,${base64}`);
    const bitmap = await createImageBitmap(await response.blob());
    const sample = document.createElement("canvas");
    sample.width = 96;
    sample.height = 96;
    const context = sample.getContext("2d", { willReadFrequently: true });
    if (context === null) {
      return { axisColorRatio: 0, distinct: 0, nonWhiteRatio: 0, opaqueRatio: 0 };
    }
    context.drawImage(bitmap, 0, 0, sample.width, sample.height);
    bitmap.close();
    const pixels = context.getImageData(0, 0, sample.width, sample.height).data;
    const colors = new Set<string>();
    let axisColor = 0;
    let nonWhite = 0;
    let opaque = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      const red = pixels[index] ?? 0;
      const green = pixels[index + 1] ?? 0;
      const blue = pixels[index + 2] ?? 0;
      const alpha = pixels[index + 3] ?? 0;
      const maximum = Math.max(red, green, blue);
      const minimum = Math.min(red, green, blue);
      if (alpha > 250) opaque += 1;
      if (red < 245 || green < 245 || blue < 245) nonWhite += 1;
      if (maximum > 150 && maximum - minimum > 80) axisColor += 1;
      colors.add(`${red >> 4}:${green >> 4}:${blue >> 4}:${alpha >> 4}`);
    }
    const count = pixels.length / 4;
    return {
      axisColorRatio: axisColor / count,
      distinct: colors.size,
      nonWhiteRatio: nonWhite / count,
      opaqueRatio: opaque / count,
    };
  }, encoded);
}

function observeRuntimeErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror:${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console:${message.text()}`);
  });
  return errors;
}
