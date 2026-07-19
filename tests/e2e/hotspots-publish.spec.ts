import { readFile } from "node:fs/promises";

import { expect, test, type Page } from "@playwright/test";
import { unzipSync } from "fflate";

import {
  assertNoRuntimeErrors,
  createHotspotFromCenterReticle,
  documentSnapshot,
  expectDocumentSnapshot,
  expectRevision,
  factoryModelSha256,
  observeRuntimeErrors,
  openStudioWithFactoryModel,
  readyCanvas,
} from "./hotspot-test-helpers";

test.afterEach(async ({ page }) => assertNoRuntimeErrors(page));

test.describe("Studio publish", () => {
  test("downloads a deterministic bundle without changing save or export state", async ({
    page,
  }, testInfo) => {
    observeRuntimeErrors(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await openStudioWithFactoryModel(page);
    await createHotspotFromCenterReticle(page, "Published inspection");
    await page.getByRole("button", { name: "Hotspots", exact: true }).click();
    const before = await documentSnapshot(page);
    const exportStateBefore = await page.getByTestId("export-state").textContent();
    const saveStateBefore = await page.getByTestId("save-state").textContent();
    const viewportStateBefore = await page.getByTestId("viewport-mode").textContent();
    const hotspot = page.getByRole("option", { name: /Published inspection/ });
    const undo = page.getByRole("button", { name: "Undo" });
    await expect(hotspot).toHaveAttribute("aria-selected", "true");
    await expect(undo).toBeEnabled();

    const downloadPromise = page.waitForEvent("download");
    await page.getByTestId("publish-button").click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("Untitled-Scene.web3d.zip");
    const output = testInfo.outputPath(download.suggestedFilename());
    await download.saveAs(output);
    const dialog = page.getByRole("dialog", { name: "Publish scene" });
    await expect(dialog.getByText("Publish bundle downloaded")).toBeVisible();

    const files = unzipSync(new Uint8Array(await readFile(output)));
    const assetPath = `assets/${factoryModelSha256}.glb`;
    expect(Object.keys(files).sort()).toEqual([assetPath, "publish-manifest.json", "scene.json"]);
    const manifest = JSON.parse(new TextDecoder().decode(files["publish-manifest.json"])) as {
      publishVersion: string;
      documentId: string;
      revision: number;
      files: Array<{ path: string; sha256: string; byteLength: number }>;
      requirements: { trustedContentKeys: string[] };
    };
    expect(manifest).toMatchObject({
      publishVersion: "1.0.0",
      documentId: "untitled-project",
      revision: before.revision,
    });
    expect(manifest.files.map((file) => file.path)).toEqual([assetPath, "scene.json"]);
    expect(manifest.files.find((file) => file.path === assetPath)).toMatchObject({
      sha256: factoryModelSha256,
      byteLength: files[assetPath]!.byteLength,
    });
    expect(manifest.requirements.trustedContentKeys).toEqual([]);
    await expectDocumentSnapshot(page, before);
    await expect(page.getByTestId("export-state")).toHaveText(exportStateBefore ?? "");
    await expect(page.getByTestId("save-state")).toHaveText(saveStateBefore ?? "");
    await expect(page.getByTestId("viewport-mode")).toHaveText(viewportStateBefore ?? "");
    await expect(hotspot).toHaveAttribute("aria-selected", "true");
    await expect(undo).toBeEnabled();
  });

  test("blocks a legacy hotspot without downloading or mutating the project", async ({ page }) => {
    observeRuntimeErrors(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await openStudioWithFactoryModel(page);
    const revision = await seedLegacyHotspot(page);
    await page.reload();
    await readyCanvas(page);
    await expectRevision(page, revision);
    const before = await documentSnapshot(page);
    const exportStateBefore = await page.getByTestId("export-state").textContent();
    const saveStateBefore = await page.getByTestId("save-state").textContent();
    const viewportStateBefore = await page.getByTestId("viewport-mode").textContent();
    let downloadCount = 0;
    page.on("download", () => {
      downloadCount += 1;
    });

    await page.getByTestId("publish-button").click();
    const dialog = page.getByRole("dialog", { name: "Publish scene" });
    await expect(dialog.getByText("Publish blocked")).toBeVisible();
    await expect(dialog.getByText(/Reposition every legacy hotspot/)).toBeVisible();
    expect(await dialog.textContent()).not.toContain("annotation-legacy");
    await page.waitForTimeout(100);
    expect(downloadCount).toBe(0);
    await expectDocumentSnapshot(page, before);
    await expect(page.getByTestId("export-state")).toHaveText(exportStateBefore ?? "");
    await expect(page.getByTestId("save-state")).toHaveText(saveStateBefore ?? "");
    await expect(page.getByTestId("viewport-mode")).toHaveText(viewportStateBefore ?? "");
  });

  test("cancels an in-flight publish without download or state changes", async ({ page }) => {
    observeRuntimeErrors(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await openStudioWithFactoryModel(page);
    await createHotspotFromCenterReticle(page, "Cancelled inspection");
    await page.getByRole("button", { name: "Hotspots", exact: true }).click();
    const before = await documentSnapshot(page);
    const exportStateBefore = await page.getByTestId("export-state").textContent();
    const saveStateBefore = await page.getByTestId("save-state").textContent();
    const viewportStateBefore = await page.getByTestId("viewport-mode").textContent();
    const hotspot = page.getByRole("option", { name: /Cancelled inspection/ });
    const undo = page.getByRole("button", { name: "Undo" });
    await expect(hotspot).toHaveAttribute("aria-selected", "true");
    await expect(undo).toBeEnabled();
    await page.evaluate(() => {
      const read = Blob.prototype.arrayBuffer;
      Blob.prototype.arrayBuffer = async function delayedArrayBuffer() {
        await new Promise((resolve) => setTimeout(resolve, 300));
        return read.call(this);
      };
    });
    let downloadCount = 0;
    page.on("download", () => {
      downloadCount += 1;
    });

    await page.getByTestId("publish-button").click();
    const dialog = page.getByRole("dialog", { name: "Publish scene" });
    await expect(dialog.getByTestId("publish-checking")).toBeVisible();
    await page.keyboard.press("ControlOrMeta+Z");
    await expect(dialog).toBeVisible();
    await expectDocumentSnapshot(page, before);
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId("publish-button")).toBeFocused();
    await page.waitForTimeout(400);

    expect(downloadCount).toBe(0);
    await expectDocumentSnapshot(page, before);
    await expect(page.getByTestId("export-state")).toHaveText(exportStateBefore ?? "");
    await expect(page.getByTestId("save-state")).toHaveText(saveStateBefore ?? "");
    await expect(page.getByTestId("viewport-mode")).toHaveText(viewportStateBefore ?? "");
    await expect(hotspot).toHaveAttribute("aria-selected", "true");
    await expect(undo).toBeEnabled();
  });
});

async function seedLegacyHotspot(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("web3d-studio", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Failed to open IndexedDB."));
    });
    try {
      const project = await new Promise<Record<string, unknown>>((resolve, reject) => {
        const request = database
          .transaction("projects", "readonly")
          .objectStore("projects")
          .get("untitled-project");
        request.onsuccess = () => resolve(request.result as Record<string, unknown>);
        request.onerror = () => reject(request.error ?? new Error("Failed to read project."));
      });
      const document = JSON.parse(String(project["documentJson"])) as Record<string, unknown>;
      const targets = document["targets"] as Array<{ id: string }>;
      const revision = Number(document["revision"]) + 1;
      document["revision"] = revision;
      document["annotations"] = [
        {
          id: "annotation-legacy",
          title: "Legacy inspection",
          visible: true,
          locked: false,
          anchor: { kind: "legacy", targetId: targets[0]!.id, localOffset: [0, 0, 0] },
          content: { kind: "plain-text", text: "Inspection" },
          action: { type: "show-content" },
        },
      ];
      project["documentJson"] = JSON.stringify(document);
      project["lastSavedRevision"] = revision;
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction("projects", "readwrite");
        transaction.objectStore("projects").put(project);
        transaction.oncomplete = () => resolve();
        transaction.onabort = () =>
          reject(transaction.error ?? new Error("Project write aborted."));
        transaction.onerror = () => reject(transaction.error ?? new Error("Project write failed."));
      });
      return revision;
    } finally {
      database.close();
    }
  });
}
