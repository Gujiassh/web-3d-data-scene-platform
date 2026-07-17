import { readFile } from "node:fs/promises";
import path from "node:path";

import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  exportSceneArchive,
  type LightEntity,
  type SceneDocument,
} from "../../packages/document/src/index.js";

import { setInterfacePreferences } from "./settings-helpers";

const layoutScenePath = path.resolve("tests/fixtures/006-layout/layout.scene.json");
const assetPath = path.resolve("tests/fixtures/m0-factory/public/m0-factory-cell.glb");
const assetSha256 = "e123f3d64ec60f136d8673478eb2fd2ce28f56bcb5fb94cef5a7377b9605efe8";
const assetByteLength = 1_216;
const artifact = (name: string) => `artifacts/e2e/${name}`;

test.describe("Feature 006B light authoring", () => {
  test("gates Add on the exact Runtime creation frame and preserves accessible focus", async ({
    page,
  }) => {
    test.setTimeout(45_000);
    const runtimeErrors = observeRuntimeErrors(page);
    await delayFixtureAssetReads(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await readyCanvas(page);

    await page.getByTestId("archive-file-input").setInputFiles({
      name: "006b-loading.scene.zip",
      mimeType: "application/zip",
      buffer: Buffer.from(await layoutArchive()),
    });
    await expect(page.locator(".project-copy strong")).toHaveText("Feature 006 Layout Fixture");

    await page.getByTestId("lighting-menu-trigger").click();
    const menu = page.getByRole("menu", { name: "Lighting actions" });
    const addPoint = menu.getByRole("menuitem", { name: /Add point/ });
    await expect(addPoint).toHaveAttribute("aria-disabled", "true");
    await expect(addPoint).toContainText("The viewport is not ready to place a light.");
    await expectRevision(page, 1);

    await releaseFixtureAssetReads(page);
    await expect(addPoint).toHaveAttribute("aria-disabled", "false", { timeout: 15_000 });
    await expect(menu).toContainText("0/8");
    await expect(menu.getByRole("menuitem")).toHaveCount(2);
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("lighting-menu-trigger")).toBeFocused();

    await page.getByTestId("app-settings-button").click();

    const settings = page.getByRole("dialog", { name: "Settings" });
    await expect(settings).toBeVisible();
    await settings.getByRole("tab", { name: "Lighting" }).click();
    await expect
      .poll(() => settings.evaluate((dialog) => dialog.contains(document.activeElement)))
      .toBe(true);
    await settings.getByRole("button", { name: "Close settings", exact: true }).click();
    await expect(page.getByTestId("app-settings-button")).toBeFocused();

    await setInterfacePreferences(page, { locale: "zh-CN" });
    await page.getByTestId("lighting-menu-trigger").click();
    const chineseMenu = page.getByRole("menu", { name: "灯光操作" });
    await expect(chineseMenu).toContainText("添加点光源");
    await expect(chineseMenu).toContainText("添加聚光灯");
    await expect(chineseMenu.getByRole("menuitem")).toHaveCount(2);
    await expect(chineseMenu).not.toContainText("场景灯光设置");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("lighting-menu-trigger")).toBeFocused();
    expect(runtimeErrors).toEqual([]);
  });

  test("authors Point and Spot lights through light-only commands and reverts a Run drag", async ({
    page,
  }) => {
    test.setTimeout(75_000);
    const runtimeErrors = observeRuntimeErrors(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    const canvas = await readyCanvas(page);
    const canvasIdentity = await markCanvasIdentity(canvas);
    await expectRevision(page, 0);

    await openLightingMenuReady(page);
    await page.getByRole("menuitem", { name: "Add point", exact: true }).click();
    const pointRow = page.getByRole("treeitem").filter({ hasText: "Point light 1" });
    await expect(pointRow).toHaveAttribute("aria-selected", "true");
    await expect(page.getByLabel("Name", { exact: true })).toBeFocused();
    await expectRevision(page, 1);
    await expect(page.getByRole("button", { name: "Move (W)", exact: true })).toBeEnabled();
    await expect(page.getByRole("button", { name: /^Rotate \(E\)\./ })).toBeDisabled();
    await expect(page.getByRole("button", { name: /^Scale \(R\)\./ })).toBeDisabled();

    const pointBefore = await inspectorPosition(page);
    await page.getByRole("button", { name: "Move (W)", exact: true }).click();
    await beginDefaultCameraTranslateDrag(page, canvas, pointBefore, "x", 24);
    await page.mouse.up();
    await expectRevision(page, 2);
    const pointAfter = await inspectorPosition(page);
    expect(pointAfter[0]).not.toBeCloseTo(pointBefore[0], 6);
    expect(pointAfter[1]).toBeCloseTo(pointBefore[1], 6);
    expect(pointAfter[2]).toBeCloseTo(pointBefore[2], 6);

    await openLightingMenuReady(page);
    await page.getByRole("menuitem", { name: "Add spot", exact: true }).click();
    const spotRow = page.getByRole("treeitem").filter({ hasText: "Spot light 1" });
    await expect(spotRow).toHaveAttribute("aria-selected", "true");
    await expectRevision(page, 3);
    const spotPositionBefore = await inspectorPosition(page);
    await page.getByRole("button", { name: "Move (W)", exact: true }).click();
    await expect(page.getByTestId("viewport-mode")).toContainText("EDIT / TRANSLATE");
    await beginDefaultCameraTranslateDrag(page, canvas, spotPositionBefore, "x", 24);
    await page.mouse.up();
    await expectRevision(page, 4);
    const spotPositionAfter = await inspectorPosition(page);
    expect(spotPositionAfter[0]).not.toBeCloseTo(spotPositionBefore[0], 6);

    const spotRotationBefore = await inspectorRotation(page);
    await page.getByRole("button", { name: "Rotate (E)", exact: true }).click();
    await expect(page.getByTestId("viewport-mode")).toContainText("EDIT / ROTATE");
    await beginDefaultCameraRotateDrag(page, canvas, spotPositionAfter, "x", 28);
    await page.mouse.up();
    await expectRevision(page, 5);
    expect(await inspectorRotation(page)).not.toEqual(spotRotationBefore);
    await expect(page.getByRole("button", { name: "Rotate (E)", exact: true })).toBeEnabled();
    await expect(page.getByRole("button", { name: /^Scale \(R\)\./ })).toBeDisabled();
    await expect(page.getByLabel("Rotation (degrees) X")).toBeVisible();
    await expect(page.getByText("Scale", { exact: true })).toHaveCount(0);

    await page.getByLabel("Brightness", { exact: true }).fill("1001");
    await page.getByRole("button", { name: "Apply", exact: true }).click();
    await expect(page.getByLabel("Brightness", { exact: true })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    await expect(page.getByLabel("Brightness", { exact: true })).toBeFocused();
    await expectRevision(page, 5);

    await page.getByLabel("Brightness", { exact: true }).fill("42.5");
    await page.getByLabel("Position X", { exact: true }).fill("2.5");
    await page.getByLabel("Rotation (degrees) X").fill("15");
    await page.getByRole("button", { name: "Apply", exact: true }).click();
    await expectRevision(page, 6);

    await spotRow.getByRole("button", { name: "Lock Spot light 1" }).click();
    await expectRevision(page, 7);
    await page.getByRole("button", { name: "Duplicate selection", exact: true }).click();
    await expectRevision(page, 8);
    await expect(page.getByRole("treeitem")).toHaveCount(3);
    await expect(page.getByRole("treeitem").filter({ hasText: "Spot light 2" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    const beforeRun = await exportCurrentDocument(page, "006b-before-run.scene.json");
    const point = requireLight(beforeRun, "Point light 1");
    const spot = requireLight(beforeRun, "Spot light 1");
    const spotCopy = requireLight(beforeRun, "Spot light 2");
    expect(point.transform.rotation).toEqual([0, 0, 0, 1]);
    expect(point.transform.scale).toEqual([1, 1, 1]);
    expect(spot.light.intensity).toBe(42.5);
    expect(spot.transform.position[0]).toBe(2.5);
    expect(spot.transform.rotation).not.toEqual([0, 0, 0, 1]);
    expect(spot.locked).toBe(true);
    expect(spotCopy.locked).toBe(false);
    expect(spotCopy.transform.position).toEqual([
      spot.transform.position[0] + 1,
      spot.transform.position[1],
      spot.transform.position[2],
    ]);

    await page.getByRole("button", { name: "Move (W)", exact: true }).click();
    await beginDefaultCameraTranslateDrag(page, canvas, spotCopy.transform.position, "x", 24);
    await page
      .getByRole("button", { name: "Run", exact: true })
      .evaluate((button) => (button as HTMLButtonElement).click());
    await page.mouse.up();
    await expectRevision(page, 8);
    await expect(page.getByTestId("viewport-mode")).toContainText("RUN / SELECT");
    await expect(page.getByRole("treeitem").filter({ hasText: "Spot light 2" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expectCanvasIdentity(page, canvasIdentity);

    const afterRun = await exportCurrentDocument(page, "006b-after-run.scene.json");
    expect(requireLight(afterRun, "Spot light 2").transform).toEqual(spotCopy.transform);
    expect(afterRun.revision).toBe(8);
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await expectCanvasIdentity(page, canvasIdentity);
    await page.screenshot({ path: artifact("006b-light-authoring-1440x900.png"), fullPage: true });
    expect(runtimeErrors).toEqual([]);
  });
});

let archivePromise: Promise<Uint8Array> | undefined;

async function layoutArchive(): Promise<Uint8Array> {
  archivePromise ??= Promise.all([readFile(layoutScenePath, "utf8"), readFile(assetPath)]).then(
    ([sceneJson, assetBuffer]) => {
      const document = {
        ...(JSON.parse(sceneJson) as SceneDocument),
        schemaVersion: "1.3.0" as const,
      };
      const bytes = new Uint8Array(
        assetBuffer.buffer.slice(
          assetBuffer.byteOffset,
          assetBuffer.byteOffset + assetBuffer.byteLength,
        ),
      );
      return exportSceneArchive({
        document,
        createdAt: "2026-07-17T00:00:00.000Z",
        resolveAssetBytes: new Map([[assetSha256, bytes]]),
      });
    },
  );
  return archivePromise;
}

async function delayFixtureAssetReads(page: Page): Promise<void> {
  await page.addInitScript((delayedSize) => {
    const original = Blob.prototype.arrayBuffer;
    let released = false;
    let fixtureReads = 0;
    const pending = new Set<() => void>();
    Object.defineProperty(globalThis, "__release006bFixtureAsset", {
      configurable: true,
      value: () => {
        released = true;
        for (const resolve of pending) resolve();
        pending.clear();
      },
    });
    Blob.prototype.arrayBuffer = async function arrayBuffer() {
      if (this.size === delayedSize) fixtureReads += 1;
      if (this.size === delayedSize && fixtureReads > 1 && !released) {
        await new Promise<void>((resolve) => pending.add(resolve));
      }
      return original.call(this);
    };
  }, assetByteLength);
}

async function releaseFixtureAssetReads(page: Page): Promise<void> {
  await page.evaluate(() => {
    const release = (globalThis as typeof globalThis & { __release006bFixtureAsset?: () => void })
      .__release006bFixtureAsset;
    if (release === undefined) throw new Error("006B fixture asset gate is unavailable.");
    release();
  });
}

async function openLightingMenuReady(page: Page): Promise<void> {
  await page.getByTestId("lighting-menu-trigger").click();
  const menu = page.getByRole("menu", { name: "Lighting actions" });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Add point", exact: true })).toHaveAttribute(
    "aria-disabled",
    "false",
    { timeout: 15_000 },
  );
}

async function inspectorPosition(page: Page): Promise<[number, number, number]> {
  const values = (await Promise.all(
    (["X", "Y", "Z"] as const).map(async (axis) =>
      Number(await page.getByLabel(`Position ${axis}`, { exact: true }).inputValue()),
    ),
  )) as [number, number, number];
  if (!values.every(Number.isFinite)) throw new Error("Inspector position is not finite.");
  return values;
}

async function inspectorRotation(page: Page): Promise<[number, number, number]> {
  const values = (await Promise.all(
    (["X", "Y", "Z"] as const).map(async (axis) =>
      Number(await page.getByLabel(`Rotation (degrees) ${axis}`, { exact: true }).inputValue()),
    ),
  )) as [number, number, number];
  if (!values.every(Number.isFinite)) throw new Error("Inspector rotation is not finite.");
  return values;
}

async function beginDefaultCameraTranslateDrag(
  page: Page,
  canvas: Locator,
  worldOrigin: readonly [number, number, number],
  axis: "x" | "y" | "z",
  distance: number,
): Promise<void> {
  await page.waitForTimeout(180);
  const screenshot = await canvas.screenshot();
  const bounds = await canvas.boundingBox();
  if (bounds === null) throw new Error("Canvas bounds are unavailable for gizmo drag.");
  const origin = projectDefaultWorldPoint(worldOrigin, bounds.width / bounds.height);
  const axisOffset: Record<typeof axis, readonly [number, number, number]> = {
    x: [1, 0, 0],
    y: [0, 1, 0],
    z: [0, 0, 1],
  };
  const offset = axisOffset[axis];
  const projectedAxis = projectDefaultWorldPoint(
    [worldOrigin[0] + offset[0], worldOrigin[1] + offset[1], worldOrigin[2] + offset[2]],
    bounds.width / bounds.height,
  );
  const handle = await findGizmoHandle(page, screenshot, axis, origin, projectedAxis);
  const start = { x: bounds.x + handle.x * bounds.width, y: bounds.y + handle.y * bounds.height };
  const direction = normalize2({ x: projectedAxis.x - origin.x, y: projectedAxis.y - origin.y });
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + direction.x * distance, start.y + direction.y * distance, {
    steps: 12,
  });
}

async function beginDefaultCameraRotateDrag(
  page: Page,
  canvas: Locator,
  worldOrigin: readonly [number, number, number],
  axis: "x" | "y" | "z",
  distance: number,
): Promise<void> {
  await page.waitForTimeout(180);
  const screenshot = await canvas.screenshot();
  const bounds = await canvas.boundingBox();
  if (bounds === null) throw new Error("Canvas bounds are unavailable for rotation gizmo drag.");
  const origin = projectDefaultWorldPoint(worldOrigin, bounds.width / bounds.height);
  const handle = await findRotationGizmoHandle(page, screenshot, axis, origin);
  const start = { x: bounds.x + handle.x * bounds.width, y: bounds.y + handle.y * bounds.height };
  const center = { x: bounds.x + origin.x * bounds.width, y: bounds.y + origin.y * bounds.height };
  const radial = normalize2({ x: start.x - center.x, y: start.y - center.y });
  const tangent = { x: -radial.y, y: radial.x };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + tangent.x * distance, start.y + tangent.y * distance, {
    steps: 16,
  });
}

async function findRotationGizmoHandle(
  page: Page,
  screenshot: Buffer,
  axis: "x" | "y" | "z",
  origin: { readonly x: number; readonly y: number },
): Promise<{ readonly x: number; readonly y: number }> {
  return page.evaluate(
    async ({ encoded, activeAxis, originPoint }) => {
      const response = await fetch(`data:image/png;base64,${encoded}`);
      const bitmap = await createImageBitmap(await response.blob());
      const surface = document.createElement("canvas");
      surface.width = bitmap.width;
      surface.height = bitmap.height;
      const context = surface.getContext("2d", { willReadFrequently: true });
      if (context === null) throw new Error("2D Canvas is unavailable for rotation detection.");
      context.drawImage(bitmap, 0, 0);
      bitmap.close();
      const pixels = context.getImageData(0, 0, surface.width, surface.height).data;
      const center = { x: originPoint.x * surface.width, y: originPoint.y * surface.height };
      const matchesAxis = (red: number, green: number, blue: number): boolean => {
        if (activeAxis === "x") return red > 105 && red - green > 38 && red - blue > 38;
        if (activeAxis === "y") return green > 80 && green - red > 22 && green - blue > 18;
        return blue > 105 && blue - red > 35 && blue - green > 25;
      };
      const candidates: { x: number; y: number; radius: number }[] = [];
      for (let y = 0; y < surface.height; y += 1) {
        for (let x = 0; x < surface.width; x += 1) {
          const index = (y * surface.width + x) * 4;
          const red = pixels[index] ?? 0;
          const green = pixels[index + 1] ?? 0;
          const blue = pixels[index + 2] ?? 0;
          const alpha = pixels[index + 3] ?? 0;
          if (alpha < 180 || !matchesAxis(red, green, blue)) continue;
          const radius = Math.hypot(x - center.x, y - center.y);
          if (radius >= 20 && radius <= 125) candidates.push({ x, y, radius });
        }
      }
      const outerRadius = Math.max(...candidates.map((candidate) => candidate.radius));
      const outer = candidates.filter((candidate) => candidate.radius >= outerRadius - 5);
      if (outer.length === 0) throw new Error(`No ${activeAxis} rotation gizmo pixel was found.`);
      return {
        x: outer.reduce((sum, candidate) => sum + candidate.x, 0) / outer.length / surface.width,
        y: outer.reduce((sum, candidate) => sum + candidate.y, 0) / outer.length / surface.height,
      };
    },
    { encoded: screenshot.toString("base64"), activeAxis: axis, originPoint: origin },
  );
}

async function findGizmoHandle(
  page: Page,
  screenshot: Buffer,
  axis: "x" | "y" | "z",
  origin: { readonly x: number; readonly y: number },
  projectedAxis: { readonly x: number; readonly y: number },
): Promise<{ readonly x: number; readonly y: number }> {
  return page.evaluate(
    async ({ encoded, activeAxis, originPoint, axisPoint }) => {
      const response = await fetch(`data:image/png;base64,${encoded}`);
      const bitmap = await createImageBitmap(await response.blob());
      const surface = document.createElement("canvas");
      surface.width = bitmap.width;
      surface.height = bitmap.height;
      const context = surface.getContext("2d", { willReadFrequently: true });
      if (context === null) throw new Error("2D Canvas is unavailable for gizmo detection.");
      context.drawImage(bitmap, 0, 0);
      bitmap.close();
      const pixels = context.getImageData(0, 0, surface.width, surface.height).data;
      const originPixels = {
        x: originPoint.x * surface.width,
        y: originPoint.y * surface.height,
      };
      const length = Math.hypot(axisPoint.x - originPoint.x, axisPoint.y - originPoint.y);
      const direction = {
        x: (axisPoint.x - originPoint.x) / length,
        y: (axisPoint.y - originPoint.y) / length,
      };
      const candidates: { x: number; y: number; along: number }[] = [];
      const matchesAxis = (red: number, green: number, blue: number): boolean => {
        if (activeAxis === "x") return red > 105 && red - green > 38 && red - blue > 38;
        if (activeAxis === "y") return green > 80 && green - red > 22 && green - blue > 18;
        return blue > 105 && blue - red > 35 && blue - green > 25;
      };
      for (let y = 0; y < surface.height; y += 1) {
        for (let x = 0; x < surface.width; x += 1) {
          const index = (y * surface.width + x) * 4;
          const red = pixels[index] ?? 0;
          const green = pixels[index + 1] ?? 0;
          const blue = pixels[index + 2] ?? 0;
          const alpha = pixels[index + 3] ?? 0;
          if (alpha < 180 || !matchesAxis(red, green, blue)) continue;
          candidates.push({
            x,
            y,
            along: (x - originPixels.x) * direction.x + (y - originPixels.y) * direction.y,
          });
        }
      }
      const maximum = Math.max(...candidates.map((candidate) => candidate.along));
      const head = candidates.filter((candidate) => candidate.along >= maximum - 12);
      if (head.length === 0) throw new Error(`No ${activeAxis} linear gizmo pixel was found.`);
      return {
        x: head.reduce((sum, candidate) => sum + candidate.x, 0) / head.length / surface.width,
        y: head.reduce((sum, candidate) => sum + candidate.y, 0) / head.length / surface.height,
      };
    },
    {
      encoded: screenshot.toString("base64"),
      activeAxis: axis,
      originPoint: origin,
      axisPoint: projectedAxis,
    },
  );
}

function projectDefaultWorldPoint(
  point: readonly [number, number, number],
  aspect: number,
): { readonly x: number; readonly y: number } {
  const camera = [7.5, 5.5, 8.5] as const;
  const target = [0, 0.75, 0] as const;
  const forward = normalize3(subtract3(target, camera));
  const right = normalize3(cross3(forward, [0, 1, 0]));
  const up = cross3(right, forward);
  const relative = subtract3(point, camera);
  const depth = dot3(relative, forward);
  const halfHeight = depth * Math.tan((45 * Math.PI) / 360);
  const ndcX = dot3(relative, right) / (halfHeight * aspect);
  const ndcY = dot3(relative, up) / halfHeight;
  return { x: (ndcX + 1) / 2, y: (1 - ndcY) / 2 };
}

function subtract3(left: readonly number[], right: readonly number[]): [number, number, number] {
  return [left[0]! - right[0]!, left[1]! - right[1]!, left[2]! - right[2]!];
}

function cross3(left: readonly number[], right: readonly number[]): [number, number, number] {
  return [
    left[1]! * right[2]! - left[2]! * right[1]!,
    left[2]! * right[0]! - left[0]! * right[2]!,
    left[0]! * right[1]! - left[1]! * right[0]!,
  ];
}

function dot3(left: readonly number[], right: readonly number[]): number {
  return left[0]! * right[0]! + left[1]! * right[1]! + left[2]! * right[2]!;
}

function normalize3(value: readonly number[]): [number, number, number] {
  const length = Math.hypot(value[0]!, value[1]!, value[2]!);
  if (length === 0) throw new Error("Cannot normalize a zero vector.");
  return [value[0]! / length, value[1]! / length, value[2]! / length];
}

function normalize2(value: { readonly x: number; readonly y: number }): {
  readonly x: number;
  readonly y: number;
} {
  const length = Math.hypot(value.x, value.y);
  if (length === 0) throw new Error("Cannot normalize a zero screen vector.");
  return { x: value.x / length, y: value.y / length };
}

async function exportCurrentDocument(page: Page, fileName: string): Promise<SceneDocument> {
  const projectMenu = page.getByRole("region", { name: "Project menu" });
  if (!(await projectMenu.isVisible())) {
    await page.getByRole("button", { name: "Open project menu" }).click();
  }
  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("export-json-command").click();
  const download = await downloadPromise;
  const outputPath = test.info().outputPath(fileName);
  await download.saveAs(outputPath);
  return JSON.parse(await readFile(outputPath, "utf8")) as SceneDocument;
}

function requireLight(document: SceneDocument, name: string): LightEntity {
  const entity = document.entities.find(
    (candidate): candidate is LightEntity => candidate.type === "light" && candidate.name === name,
  );
  if (entity === undefined) throw new Error(`Missing light ${name}.`);
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
  const identity = `006b-${Date.now()}`;
  await canvas.evaluate((element, value) => {
    element.dataset["e2eIdentity"] = value;
  }, identity);
  return identity;
}

async function expectCanvasIdentity(page: Page, identity: string): Promise<void> {
  const canvas = page.locator('canvas[data-web3d-viewer="true"]');
  await expect(canvas).toHaveAttribute("data-e2e-identity", identity);
  await expect(canvas).toHaveCount(1);
}

function observeRuntimeErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror:${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console:${message.text()}`);
  });
  return errors;
}
