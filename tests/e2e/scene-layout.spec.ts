import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  exportSceneArchive,
  importSceneArchive,
  type SceneDocument,
} from "../../packages/document/src/index.js";
import { setInterfacePreferences } from "./settings-helpers";

const scenePath = path.resolve("tests/fixtures/006-layout/layout.scene.json");
const assetPath = path.resolve("tests/fixtures/m0-factory/public/m0-factory-cell.glb");
const assetSha256 = "e123f3d64ec60f136d8673478eb2fd2ce28f56bcb5fb94cef5a7377b9605efe8";
const assetBytes = 1_216;

test.describe("Feature 006 scene organization", () => {
  test("round-trips the fixed archive without leaking hidden editor state", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    const canonical = (await importSceneArchive(await layoutArchive())).document;
    const canvas = await importLayoutArchive(page);

    await expect(page.getByRole("treeitem")).toHaveCount(5);
    await expectCanvasContent(page, canvas);
    await expect(page.getByText("Arrange", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Transform snap", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Spatial status", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Transform", { exact: true })).toHaveCount(0);
    await expect(page.getByLabel("Position X")).toHaveCount(0);
    await expect(page.locator('[data-layout-control="true"]')).toHaveCount(1);

    const jsonPath = await exportJson(page, "006-visible-surface.scene.json");
    const json = JSON.parse(await readFile(jsonPath, "utf8")) as SceneDocument;
    expect(json).toEqual(canonical);

    const archivePath = await exportArchive(page, "006-visible-surface.scene.zip");
    const archive = await importSceneArchive(new Uint8Array(await readFile(archivePath)));
    expect(archive.document).toEqual(canonical);
    expect(archive.assets).toHaveLength(1);
    expect(archive.assets[0]?.bytes.byteLength).toBe(assetBytes);
    expect(createHash("sha256").update(archive.assets[0]!.bytes).digest("hex")).toBe(assetSha256);

    for (const serialized of [JSON.stringify(json), JSON.stringify(archive.document)]) {
      for (const transient of ["smartAlign", "layoutFeedback", "activeAxis", "transformDraft"]) {
        expect(serialized).not.toContain(transient);
      }
    }
    await expectNoPageOverflow(page);
  });

  test("groups and reparents from the compact hierarchy surface with one-step history", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await importLayoutArchive(page);

    await selectTreeEntities(page, ["layout-entity-a", "layout-entity-b"]);
    await expect(page.getByRole("button", { name: "Group selection" })).toBeEnabled();
    await page.getByRole("button", { name: "Group selection" }).click();
    await expectRevision(page, 2);
    await expect(page.getByRole("treeitem")).toHaveCount(6);

    const grouped = await exportCurrentDocument(page, "006-grouped.scene.json");
    const group = grouped.entities.find(
      (entity) => entity.type === "group" && entity.id !== "layout-root",
    );
    expect(group).toBeDefined();
    expect(requireEntity(grouped, "layout-entity-a").parentId).toBe(group?.id);
    expect(requireEntity(grouped, "layout-entity-b").parentId).toBe(group?.id);

    await page.getByRole("button", { name: "Undo" }).click();
    await expectRevision(page, 3);
    expect(
      requireEntity(
        await exportCurrentDocument(page, "006-group-undo.scene.json"),
        "layout-entity-a",
      ).parentId,
    ).toBe("layout-root");
    await page.getByRole("button", { name: "Redo" }).click();
    await expectRevision(page, 4);

    await selectTreeEntities(page, ["layout-entity-c"]);
    await page.getByLabel("Parent target").selectOption(group!.id);
    await page.getByRole("button", { name: "Reparent selection" }).click();
    await expectRevision(page, 5);
    expect(
      requireEntity(await exportCurrentDocument(page, "006-reparent.scene.json"), "layout-entity-c")
        .parentId,
    ).toBe(group?.id);

    await page.reload();
    await readyCanvas(page);
    await expectRevision(page, 5);
    await expect(page.getByRole("heading", { name: /Hierarchy/ })).toBeVisible();
    await expect(page.getByText("Arrange", { exact: true })).toHaveCount(0);
  });

  test("keeps hidden layout mutation unavailable in Run and survives locale/theme changes", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/");
    const canvas = await importLayoutArchive(page);
    const identity = await markCanvas(canvas);
    const before = await exportCurrentDocument(page, "006-before-run.scene.json");

    await page.getByRole("button", { name: "Run", exact: true }).click();
    await expect(page.getByRole("button", { name: "Group selection" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Reparent selection" })).toHaveCount(0);
    await expect(page.locator('[data-layout-control="true"]')).toHaveCount(0);
    await page.keyboard.press("Control+d");
    await page.keyboard.press("Delete");
    await expectRevision(page, 1);

    await setInterfacePreferences(page, { locale: "zh-CN", theme: "dark" });
    await expect(page.getByRole("heading", { name: /层级/ })).toHaveCount(0);
    await expect(page.getByText("排列", { exact: true })).toHaveCount(0);
    await expect(page.getByText("变换吸附", { exact: true })).toHaveCount(0);
    await expectCanvasIdentity(page, identity);

    await page.getByRole("button", { name: "编辑", exact: true }).click();
    await expect(page.getByRole("heading", { name: /层级/ })).toBeVisible();
    const after = await exportCurrentDocument(page, "006-after-run.scene.json");
    expect(after).toEqual(before);
    await expectNoPageOverflow(page);
  });
});

let archivePromise: Promise<Uint8Array> | undefined;

async function layoutArchive(): Promise<Uint8Array> {
  archivePromise ??= Promise.all([readFile(scenePath, "utf8"), readFile(assetPath)]).then(
    async ([sceneJson, buffer]) =>
      exportSceneArchive({
        document: currentLayoutDocument(sceneJson),
        createdAt: "2026-07-16T00:00:00.000Z",
        resolveAssetBytes: new Map([[assetSha256, new Uint8Array(buffer)]]),
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

async function importLayoutArchive(page: Page): Promise<Locator> {
  await page.getByTestId("archive-file-input").setInputFiles({
    name: "006-layout.scene.zip",
    mimeType: "application/zip",
    buffer: Buffer.from(await layoutArchive()),
  });
  await expect(page.locator(".project-copy strong")).toHaveText("Feature 006 Layout Fixture");
  const canvas = await readyCanvas(page);
  await expectRevision(page, 1);
  return canvas;
}

async function selectTreeEntities(page: Page, entityIds: readonly string[]): Promise<void> {
  await page.getByTestId(`tree-${entityIds[0]}`).locator(".tree-select").click();
  for (const entityId of entityIds.slice(1)) {
    await page
      .getByTestId(`tree-${entityId}`)
      .locator(".tree-select")
      .click({ modifiers: ["Control"] });
  }
}

async function exportCurrentDocument(page: Page, fileName: string): Promise<SceneDocument> {
  const filePath = await exportJson(page, fileName);
  return JSON.parse(await readFile(filePath, "utf8")) as SceneDocument;
}

async function exportJson(page: Page, fileName: string): Promise<string> {
  await page.getByRole("button", { name: /Open project menu|打开项目菜单/ }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("export-json-command").click();
  const filePath = test.info().outputPath(fileName);
  await (await downloadPromise).saveAs(filePath);
  return filePath;
}

async function exportArchive(page: Page, fileName: string): Promise<string> {
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /Export|导出/, exact: true }).click();
  const filePath = test.info().outputPath(fileName);
  await (await downloadPromise).saveAs(filePath);
  return filePath;
}

function requireEntity(document: SceneDocument, entityId: string) {
  const entity = document.entities.find((candidate) => candidate.id === entityId);
  if (entity === undefined) throw new Error(`Missing entity ${entityId}.`);
  return entity;
}

async function readyCanvas(page: Page): Promise<Locator> {
  const canvas = page.locator('canvas[data-web3d-viewer="true"]');
  await expect(canvas).toBeVisible({ timeout: 15_000 });
  await expect
    .poll(() =>
      canvas.evaluate((element) => element.clientWidth > 100 && element.clientHeight > 100),
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

async function expectCanvasContent(page: Page, canvas: Locator): Promise<void> {
  const distinct = await page.evaluate(
    async (encoded) => {
      const response = await fetch(`data:image/png;base64,${encoded}`);
      const bitmap = await createImageBitmap(await response.blob());
      const surface = document.createElement("canvas");
      surface.width = 64;
      surface.height = 64;
      const context = surface.getContext("2d", { willReadFrequently: true });
      if (context === null) return 0;
      context.drawImage(bitmap, 0, 0, 64, 64);
      bitmap.close();
      const pixels = context.getImageData(0, 0, 64, 64).data;
      const colors = new Set<string>();
      for (let index = 0; index < pixels.length; index += 4) {
        colors.add(
          `${(pixels[index] ?? 0) >> 4}:${(pixels[index + 1] ?? 0) >> 4}:${(pixels[index + 2] ?? 0) >> 4}`,
        );
      }
      return colors.size;
    },
    (await canvas.screenshot()).toString("base64"),
  );
  expect(distinct).toBeGreaterThan(8);
}

async function markCanvas(canvas: Locator): Promise<string> {
  const identity = `layout-${Date.now()}`;
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
}

async function expectNoPageOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => ({
    horizontal: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    vertical: document.documentElement.scrollHeight - document.documentElement.clientHeight,
  }));
  expect(overflow.horizontal).toBeLessThanOrEqual(1);
  expect(overflow.vertical).toBeLessThanOrEqual(1);
}
