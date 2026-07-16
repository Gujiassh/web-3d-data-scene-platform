import { readFile } from "node:fs/promises";
import path from "node:path";

import { expect, test, type Locator, type Page } from "@playwright/test";
import { exportSceneArchive, type SceneDocument } from "../../packages/document/src/index.js";

const scenePath = path.resolve("tests/fixtures/006-layout/layout.scene.json");
const assetPath = path.resolve("tests/fixtures/m0-factory/public/m0-factory-cell.glb");
const assetSha256 = "e123f3d64ec60f136d8673478eb2fd2ce28f56bcb5fb94cef5a7377b9605efe8";
const artifact = (name: string) => `artifacts/e2e/${name}`;

test.describe("Feature 006A.1 Studio command usability", () => {
  test("discovers canonical shortcuts through tooltips and searchable bilingual Help", async ({
    page,
  }) => {
    const runtimeErrors = observeRuntimeErrors(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await readyCanvas(page);

    const rotate = page.getByRole("button", { name: "Rotate (E)", exact: true });
    await expect(rotate).toHaveAttribute("title", "Rotate (E)");
    await page.keyboard.press("e");
    await expect(rotate).toHaveAttribute("aria-pressed", "true");

    await page.keyboard.press("Shift+/");
    const help = page.getByRole("dialog", { name: "Keyboard shortcuts" });
    await expect(help).toBeVisible();
    const search = help.getByRole("textbox", { name: "Search shortcuts" });
    await expect(search).toBeFocused();
    await search.fill("reset rotation");
    await expect(help.locator(".shortcut-help-row")).toHaveCount(1);
    await expect(help).toContainText("Reset rotation");
    await expect(help).toContainText("Alt+R");
    await search.press("Tab");
    await expect(help.getByRole("button", { name: "Close keyboard shortcuts" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(help).toBeHidden();
    await expect(page.getByRole("button", { name: "Keyboard shortcuts (?)" })).toBeFocused();

    await page.getByRole("button", { name: "Switch to dark theme" }).click();
    await page.getByRole("button", { name: "Chinese" }).click();
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.getByRole("button", { name: "键盘快捷键 (?)" }).click();
    const chineseHelp = page.getByRole("dialog", { name: "键盘快捷键" });
    await expect(chineseHelp).toContainText("重置旋转");
    await expectDialogInsideViewport(page, chineseHelp);
    await expectNoPageOverflow(page);
    await page.screenshot({ path: artifact("006a1-help-zh-dark-1280x720.png"), fullPage: true });
    expect(runtimeErrors).toEqual([]);
  });

  test("edits degrees and applies atomic single or multi-selection resets", async ({ page }) => {
    test.setTimeout(60_000);
    const runtimeErrors = observeRuntimeErrors(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    const canvas = await importUsabilityArchive(page);
    const canvasIdentity = await markCanvasIdentity(canvas);
    await expectRevision(page, 1);

    await selectTreeEntities(page, ["layout-entity-b"]);
    await page.getByLabel("Rotation (degrees) X").fill("15");
    await page.getByLabel("Rotation (degrees) Y").fill("30");
    await page.getByLabel("Rotation (degrees) Z").fill("45");
    await page.getByText("Transform", { exact: true }).click();
    await expectRevision(page, 2);
    const rotated = await exportCurrentDocument(page, "006a1-rotated.scene.json");
    expect(requireEntity(rotated, "layout-entity-b").transform.rotation).not.toEqual([0, 0, 0, 1]);

    await page.getByRole("button", { name: "Reset local rotation" }).click();
    await expectRevision(page, 3);
    expect(
      requireEntity(
        await exportCurrentDocument(page, "006a1-rotation-reset.scene.json"),
        "layout-entity-b",
      ).transform.rotation,
    ).toEqual([0, 0, 0, 1]);
    await page.getByRole("button", { name: "Reset local rotation" }).click();
    await expectRevision(page, 3);

    await page.getByRole("button", { name: "Undo" }).click();
    await expectRevision(page, 4);
    expect(
      requireEntity(
        await exportCurrentDocument(page, "006a1-rotation-undo.scene.json"),
        "layout-entity-b",
      ).transform.rotation,
    ).toEqual(requireEntity(rotated, "layout-entity-b").transform.rotation);

    const scaleX = page.getByLabel("Scale X");
    await scaleX.fill("0");
    await page.getByText("Transform", { exact: true }).click();
    await expect(scaleX).toHaveAttribute("aria-invalid", "true");
    await expect(scaleX).toHaveValue("0");
    await expectRevision(page, 4);

    await selectTreeEntities(page, ["layout-entity-a", "layout-entity-b"]);
    await page.keyboard.press("Alt+g");
    await expectRevision(page, 5);
    const reset = await exportCurrentDocument(page, "006a1-multi-position-reset.scene.json");
    expect(requireEntity(reset, "layout-entity-a").transform.position).toEqual([0, 0, 0]);
    expect(requireEntity(reset, "layout-entity-b").transform.position).toEqual([0, 0, 0]);
    expect(requireEntity(reset, "layout-entity-b").transform.rotation).toEqual(
      requireEntity(rotated, "layout-entity-b").transform.rotation,
    );

    await page.getByRole("button", { name: "Undo" }).click();
    await expectRevision(page, 6);
    const restored = await exportCurrentDocument(page, "006a1-multi-position-undo.scene.json");
    expect(requireEntity(restored, "layout-entity-a").transform.position).toEqual([-4, 0, -1.5]);
    expect(requireEntity(restored, "layout-entity-b").transform.position).toEqual([-0.75, 0, 2.25]);

    await page.getByRole("button", { name: "Run" }).click();
    await page.keyboard.press("Alt+s");
    await expectRevision(page, 6);
    await expectCanvasIdentity(page, canvasIdentity);

    const payload = JSON.stringify(restored);
    for (const transient of ["shortcut", "helpOpen", "transformDraft", "rotationDegrees"]) {
      expect(payload).not.toContain(transient);
    }
    await expectNoPageOverflow(page);
    await page.screenshot({ path: artifact("006a1-reset-en-light-1440x900.png"), fullPage: true });
    expect(runtimeErrors).toEqual([]);
  });
});

let archivePromise: Promise<Uint8Array> | undefined;

async function usabilityArchive(): Promise<Uint8Array> {
  archivePromise ??= Promise.all([readFile(scenePath, "utf8"), readFile(assetPath)]).then(
    async ([sceneJson, assetBuffer]) => {
      const bytes = new Uint8Array(
        assetBuffer.buffer.slice(
          assetBuffer.byteOffset,
          assetBuffer.byteOffset + assetBuffer.byteLength,
        ),
      );
      return exportSceneArchive({
        document: JSON.parse(sceneJson) as SceneDocument,
        createdAt: "2026-07-16T00:00:00.000Z",
        resolveAssetBytes: new Map([[assetSha256, bytes]]),
      });
    },
  );
  return archivePromise;
}

async function importUsabilityArchive(page: Page): Promise<Locator> {
  await page.getByTestId("archive-file-input").setInputFiles({
    name: "006a1-usability.scene.zip",
    mimeType: "application/zip",
    buffer: Buffer.from(await usabilityArchive()),
  });
  await expect(page.locator(".project-copy strong")).toHaveText("Feature 006 Layout Fixture");
  const canvas = await readyCanvas(page);
  await expect(page.getByTestId("save-state")).toHaveText("Saved locally");
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
  await page.getByRole("button", { name: "Open project menu" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("export-json-command").click();
  const download = await downloadPromise;
  const outputPath = test.info().outputPath(fileName);
  await download.saveAs(outputPath);
  return JSON.parse(await readFile(outputPath, "utf8")) as SceneDocument;
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
  const identity = `006a1-${Date.now()}`;
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

async function expectDialogInsideViewport(page: Page, dialog: Locator): Promise<void> {
  const bounds = await dialog.boundingBox();
  expect(bounds).not.toBeNull();
  if (bounds === null) return;
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  if (viewport === null) return;
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height);
}

async function expectNoPageOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => ({
    horizontal: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    vertical: document.documentElement.scrollHeight - document.documentElement.clientHeight,
  }));
  expect(overflow.horizontal).toBeLessThanOrEqual(1);
  expect(overflow.vertical).toBeLessThanOrEqual(1);
}

function observeRuntimeErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror:${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console:${message.text()}`);
  });
  return errors;
}
