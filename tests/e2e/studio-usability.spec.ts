import { readFile } from "node:fs/promises";
import path from "node:path";

import { expect, test, type Locator, type Page } from "@playwright/test";
import { setInterfacePreferences } from "./settings-helpers";
import {
  exportSceneArchive,
  importSceneArchive,
  type SceneDocument,
} from "../../packages/document/src/index.js";

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

    await setInterfacePreferences(page, { locale: "zh-CN", theme: "dark" });
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.getByRole("button", { name: "键盘快捷键 (?)" }).click();
    const chineseHelp = page.getByRole("dialog", { name: "键盘快捷键" });
    await expect(chineseHelp).toContainText("重置旋转");
    await expectDialogInsideViewport(page, chineseHelp);
    await expectNoPageOverflow(page);
    await page.screenshot({ path: artifact("006a1-help-zh-dark-1280x720.png"), fullPage: true });
    expect(runtimeErrors).toEqual([]);
  });

  test("hides advanced transform panels while preserving atomic keyboard resets", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const runtimeErrors = observeRuntimeErrors(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    const canvas = await importUsabilityArchive(page);
    const canvasIdentity = await markCanvasIdentity(canvas);
    await expectRevision(page, 1);

    await expect(page.getByLabel("Rotation (degrees) X")).toHaveCount(0);
    await expect(page.getByLabel("Scale X")).toHaveCount(0);
    await expect(page.getByText("Transform", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Arrange", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Transform snap", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Spatial status", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: /Hierarchy/ })).toBeVisible();

    await selectTreeEntities(page, ["layout-entity-a", "layout-entity-b"]);
    await page.keyboard.press("Alt+g");
    await expectRevision(page, 2);
    const reset = await exportCurrentDocument(page, "006a1-multi-position-reset.scene.json");
    expect(requireEntity(reset, "layout-entity-a").transform.position).toEqual([0, 0, 0]);
    expect(requireEntity(reset, "layout-entity-b").transform.position).toEqual([0, 0, 0]);

    await page.getByRole("button", { name: "Undo" }).click();
    await expectRevision(page, 3);
    const restored = await exportCurrentDocument(page, "006a1-multi-position-undo.scene.json");
    expect(requireEntity(restored, "layout-entity-a").transform.position).toEqual([-4, 0, -1.5]);
    expect(requireEntity(restored, "layout-entity-b").transform.position).toEqual([-0.75, 0, 2.25]);

    await page.getByRole("button", { name: "Run" }).click();
    await page.keyboard.press("Alt+s");
    await expectRevision(page, 3);
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

test.describe("Feature 006A.2 Smart Alignment Guides", () => {
  test("uses real X/Y/Z and XY TransformControls handles without touching inactive axes", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const runtimeErrors = observeRuntimeErrors(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    const canvas = await importUsabilityArchive(page);
    const canvasIdentity = await markCanvasIdentity(canvas);
    const initialPosition = [-0.75, 0, 2.25] as const;

    await selectTreeEntities(page, ["layout-entity-b"]);
    await page.getByRole("button", { name: "Move (W)", exact: true }).click();

    let revision = 1;
    for (const evidence of [
      { axis: "x", distance: 20 },
      { axis: "y", distance: 20 },
      { axis: "z", distance: 4 },
    ] as const) {
      await beginTransformControlDrag(
        page,
        canvas,
        initialPosition,
        evidence.axis,
        evidence.distance,
      );
      await page.mouse.up();
      revision += 1;
      await expectRevision(page, revision);

      const transformed = requireEntity(
        await exportCurrentDocument(page, `006a2-${evidence.axis}-axis.scene.json`),
        "layout-entity-b",
      ).transform.position;
      expectOnlyAxisChanged(transformed, initialPosition, evidence.axis);
      await expectCanvasIdentity(page, canvasIdentity);

      await page.getByRole("button", { name: "Undo" }).click();
      revision += 1;
      await expectRevision(page, revision);
      await expectCanvasIdentity(page, canvasIdentity);
    }

    await selectTreeEntities(page, ["layout-entity-b"]);
    await beginXyPlaneTransformControlDrag(page, canvas, initialPosition, 20);
    await page.mouse.up();
    revision += 1;
    await expectRevision(page, revision);

    const planePosition = requireEntity(
      await exportCurrentDocument(page, "006a2-xy-plane.scene.json"),
      "layout-entity-b",
    ).transform.position;
    expect(planePosition[0]).not.toBeCloseTo(initialPosition[0], 6);
    expect(planePosition[1]).not.toBeCloseTo(initialPosition[1], 6);
    expect(planePosition[2]).toBe(initialPosition[2]);
    await expectCanvasIdentity(page, canvasIdentity);
    expect(runtimeErrors).toEqual([]);
  });

  test("shows a live guide, commits once, bypasses with Alt and persists only the preference", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const runtimeErrors = observeRuntimeErrors(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    const canvas = await importUsabilityArchive(page);
    const canvasIdentity = await markCanvasIdentity(canvas);
    const smartAlign = page.getByRole("button", { name: "Smart Align (S)", exact: true });
    await expect(smartAlign).toHaveAttribute("aria-pressed", "true");

    await selectTreeEntities(page, ["layout-entity-b"]);
    await page.getByRole("button", { name: "Move (W)", exact: true }).click();
    await beginTransformControlDrag(page, canvas, [-0.75, 0, 2.25], "x", 20);
    await page.waitForTimeout(50);
    const draggingPixels = await canvas.screenshot();
    await page.mouse.up();
    await expectRevision(page, 2);
    const releasedPixels = await canvas.screenshot();
    expect(
      await disappearingGuidePixels(page, draggingPixels, releasedPixels, "x"),
    ).toBeGreaterThan(2);
    expect(await canvasPixelDifference(page, draggingPixels, releasedPixels)).toBeGreaterThan(
      0.00005,
    );

    const snapped = await exportCurrentDocument(page, "006a2-smart-aligned.scene.json");
    expect(requireEntity(snapped, "layout-entity-b").transform.position[0]).toBeCloseTo(-0.17, 6);
    await page.getByRole("button", { name: "Undo" }).click();
    await expectRevision(page, 3);
    expect(
      requireEntity(
        await exportCurrentDocument(page, "006a2-smart-undo.scene.json"),
        "layout-entity-b",
      ).transform.position,
    ).toEqual([-0.75, 0, 2.25]);
    await page.getByRole("button", { name: "Redo" }).click();
    await expectRevision(page, 4);
    await page.getByRole("button", { name: "Undo" }).click();
    await expectRevision(page, 5);

    await page.keyboard.down("Alt");
    await beginTransformControlDrag(page, canvas, [-0.75, 0, 2.25], "x", 20);
    await page.mouse.up();
    await page.keyboard.up("Alt");
    await expectRevision(page, 6);
    const bypassed = await exportCurrentDocument(page, "006a2-alt-bypassed.scene.json");
    const bypassedX = requireEntity(bypassed, "layout-entity-b").transform.position[0];
    expect(Math.abs(bypassedX + 0.17)).toBeGreaterThan(0.03);

    await page.keyboard.press("s");
    await expect(smartAlign).toHaveAttribute("aria-pressed", "false");
    await expectCanvasIdentity(page, canvasIdentity);
    await page.getByRole("button", { name: "Run" }).click();
    await expect(smartAlign).toBeDisabled();
    await expect(smartAlign).toHaveAttribute("aria-pressed", "false");
    await expectCanvasIdentity(page, canvasIdentity);
    await page.getByRole("button", { name: "Edit", exact: true }).click();

    const json = await exportCurrentDocument(page, "006a2-transient-scan.scene.json");
    const archive = await exportCurrentArchive(page, "006a2-transient-scan.scene.zip");
    const stored = await activeStoredProject(page);
    for (const value of [JSON.stringify(json), JSON.stringify(archive), stored.documentJson]) {
      assertNoSmartAlignTransientState(value);
    }
    expect(Object.keys(stored).sort()).toEqual([
      "createdAt",
      "documentJson",
      "id",
      "lastExportedRevision",
      "lastOpenedAt",
      "lastSavedRevision",
      "name",
      "updatedAt",
    ]);

    await page.reload();
    await readyCanvas(page);
    await expect(
      page.getByRole("button", { name: "Smart Align (S)", exact: true }),
    ).toHaveAttribute("aria-pressed", "false");
    await expectRevision(page, 6);
    await page.screenshot({
      path: artifact("006a2-smart-align-en-light-1440x900.png"),
      fullPage: true,
    });
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
        document: currentLayoutDocument(sceneJson),
        createdAt: "2026-07-16T00:00:00.000Z",
        resolveAssetBytes: new Map([[assetSha256, bytes]]),
      });
    },
  );
  return archivePromise;
}

function currentLayoutDocument(sceneJson: string): SceneDocument {
  const fixture = JSON.parse(sceneJson) as Omit<SceneDocument, "schemaVersion"> & {
    readonly schemaVersion: "1.2.0";
  };
  return { ...fixture, schemaVersion: "1.3.0" };
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

async function exportCurrentArchive(page: Page, fileName: string): Promise<SceneDocument> {
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = await downloadPromise;
  const outputPath = test.info().outputPath(fileName);
  await download.saveAs(outputPath);
  return (await importSceneArchive(new Uint8Array(await readFile(outputPath)))).document;
}

async function beginTransformControlDrag(
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
  const origin = projectFixtureWorldPoint(worldOrigin, bounds.width / bounds.height);
  const axisOffset: Record<typeof axis, readonly [number, number, number]> = {
    x: [1, 0, 0],
    y: [0, 1, 0],
    z: [0, 0, 1],
  };
  const offset = axisOffset[axis];
  const projectedAxis = projectFixtureWorldPoint(
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

async function beginXyPlaneTransformControlDrag(
  page: Page,
  canvas: Locator,
  worldOrigin: readonly [number, number, number],
  distance: number,
): Promise<void> {
  await page.waitForTimeout(180);
  const screenshot = await canvas.screenshot();
  const bounds = await canvas.boundingBox();
  if (bounds === null) throw new Error("Canvas bounds are unavailable for plane gizmo drag.");
  const aspect = bounds.width / bounds.height;
  const origin = projectFixtureWorldPoint(worldOrigin, aspect);
  const projectedX = projectFixtureWorldPoint(
    [worldOrigin[0] + 1, worldOrigin[1], worldOrigin[2]],
    aspect,
  );
  const projectedY = projectFixtureWorldPoint(
    [worldOrigin[0], worldOrigin[1] + 1, worldOrigin[2]],
    aspect,
  );
  const xHandle = await findGizmoHandle(page, screenshot, "x", origin, projectedX);
  const yHandle = await findGizmoHandle(page, screenshot, "y", origin, projectedY);
  const planeHandle = await findXyPlaneGizmoHandle(page, screenshot, origin, xHandle, yHandle);
  const direction = normalize2({
    x: projectedX.x + projectedY.x - origin.x * 2,
    y: projectedX.y + projectedY.y - origin.y * 2,
  });
  const start = {
    x: bounds.x + planeHandle.x * bounds.width,
    y: bounds.y + planeHandle.y * bounds.height,
  };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + direction.x * distance, start.y + direction.y * distance, {
    steps: 12,
  });
}

async function findXyPlaneGizmoHandle(
  page: Page,
  screenshot: Buffer,
  origin: { readonly x: number; readonly y: number },
  xHandle: { readonly x: number; readonly y: number },
  yHandle: { readonly x: number; readonly y: number },
): Promise<{ readonly x: number; readonly y: number }> {
  return page.evaluate(
    async ({ encoded, originPoint, xAxisHandle, yAxisHandle }) => {
      const response = await fetch(`data:image/png;base64,${encoded}`);
      const bitmap = await createImageBitmap(await response.blob());
      const surface = document.createElement("canvas");
      surface.width = bitmap.width;
      surface.height = bitmap.height;
      const context = surface.getContext("2d", { willReadFrequently: true });
      if (context === null) throw new Error("2D Canvas is unavailable for plane gizmo detection.");
      context.drawImage(bitmap, 0, 0);
      bitmap.close();
      const pixels = context.getImageData(0, 0, surface.width, surface.height).data;
      const originPixels = {
        x: originPoint.x * surface.width,
        y: originPoint.y * surface.height,
      };
      const xVector = {
        x: (xAxisHandle.x - originPoint.x) * surface.width,
        y: (xAxisHandle.y - originPoint.y) * surface.height,
      };
      const yVector = {
        x: (yAxisHandle.x - originPoint.x) * surface.width,
        y: (yAxisHandle.y - originPoint.y) * surface.height,
      };
      const determinant = xVector.x * yVector.y - xVector.y * yVector.x;
      if (Math.abs(determinant) < 1e-6) throw new Error("Projected XY gizmo axes overlap.");
      let best: { x: number; y: number; score: number } | null = null;
      for (let y = 0; y < surface.height; y += 1) {
        for (let x = 0; x < surface.width; x += 1) {
          const index = (y * surface.width + x) * 4;
          const red = pixels[index] ?? 0;
          const green = pixels[index + 1] ?? 0;
          const blue = pixels[index + 2] ?? 0;
          const alpha = pixels[index + 3] ?? 0;
          if (alpha < 180 || blue < 105 || blue - red < 22 || blue - green < 18) continue;
          const dx = x - originPixels.x;
          const dy = y - originPixels.y;
          const alongX = (dx * yVector.y - dy * yVector.x) / determinant;
          const alongY = (xVector.x * dy - xVector.y * dx) / determinant;
          if (alongX < 0.1 || alongX > 0.5 || alongY < 0.1 || alongY > 0.5) continue;
          const score = Math.abs(alongX - 0.28) + Math.abs(alongY - 0.28);
          if (best === null || score < best.score) best = { x, y, score };
        }
      }
      if (best === null) throw new Error("No rendered XY plane gizmo pixel was found.");
      return { x: best.x / surface.width, y: best.y / surface.height };
    },
    {
      encoded: screenshot.toString("base64"),
      originPoint: origin,
      xAxisHandle: xHandle,
      yAxisHandle: yHandle,
    },
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
      let best: { x: number; y: number; score: number } | null = null;
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
          const dx = x - originPixels.x;
          const dy = y - originPixels.y;
          const radius = Math.hypot(dx, dy);
          const along = dx * direction.x + dy * direction.y;
          const perpendicular = Math.abs(dx * direction.y - dy * direction.x);
          if (radius < 14 || radius > 125 || along < 12 || perpendicular > 13) continue;
          const score = along - perpendicular * 2;
          if (best === null || score > best.score) best = { x, y, score };
        }
      }
      if (best === null) throw new Error(`No ${activeAxis} linear gizmo pixel was found.`);
      return { x: best.x / surface.width, y: best.y / surface.height };
    },
    {
      encoded: screenshot.toString("base64"),
      activeAxis: axis,
      originPoint: origin,
      axisPoint: projectedAxis,
    },
  );
}

function projectFixtureWorldPoint(
  point: readonly [number, number, number],
  aspect: number,
): { readonly x: number; readonly y: number } {
  const camera = [14, 10, 16] as const;
  const target = [1.5, 0.75, 0.5] as const;
  const forward = normalize3(subtract3(target, camera));
  const right = normalize3(cross3(forward, [0, 1, 0]));
  const up = cross3(right, forward);
  const relative = subtract3(point, camera);
  const depth = dot3(relative, forward);
  const halfHeight = depth * Math.tan((42 * Math.PI) / 360);
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

async function canvasPixelDifference(page: Page, before: Buffer, after: Buffer): Promise<number> {
  return page.evaluate(
    async ({ beforeBase64, afterBase64 }) => {
      const decode = async (encoded: string): Promise<ImageData> => {
        const response = await fetch(`data:image/png;base64,${encoded}`);
        const bitmap = await createImageBitmap(await response.blob());
        const surface = document.createElement("canvas");
        surface.width = 128;
        surface.height = 128;
        const context = surface.getContext("2d", { willReadFrequently: true });
        if (context === null) throw new Error("2D Canvas is unavailable.");
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

async function disappearingGuidePixels(
  page: Page,
  dragging: Buffer,
  released: Buffer,
  axis: "x" | "y" | "z",
): Promise<number> {
  return page.evaluate(
    async ({ draggingBase64, releasedBase64, activeAxis }) => {
      const decode = async (encoded: string): Promise<ImageData> => {
        const response = await fetch(`data:image/png;base64,${encoded}`);
        const bitmap = await createImageBitmap(await response.blob());
        const surface = document.createElement("canvas");
        surface.width = bitmap.width;
        surface.height = bitmap.height;
        const context = surface.getContext("2d", { willReadFrequently: true });
        if (context === null) throw new Error("2D Canvas is unavailable.");
        context.drawImage(bitmap, 0, 0);
        bitmap.close();
        return context.getImageData(0, 0, surface.width, surface.height);
      };
      const during = await decode(draggingBase64);
      const after = await decode(releasedBase64);
      let count = 0;
      const matchesAxis = (red: number, green: number, blue: number): boolean => {
        if (activeAxis === "x") return red > 120 && red - green > 45 && red - blue > 40;
        if (activeAxis === "y") return green > 95 && green - red > 28 && green - blue > 20;
        return blue > 120 && blue - red > 40 && blue - green > 28;
      };
      for (let index = 0; index < during.data.length; index += 4) {
        const red = during.data[index] ?? 0;
        const green = during.data[index + 1] ?? 0;
        const blue = during.data[index + 2] ?? 0;
        if (!matchesAxis(red, green, blue)) continue;
        const afterDelta =
          Math.abs(red - (after.data[index] ?? 0)) +
          Math.abs(green - (after.data[index + 1] ?? 0)) +
          Math.abs(blue - (after.data[index + 2] ?? 0));
        if (afterDelta > 80) count += 1;
      }
      return count;
    },
    {
      draggingBase64: dragging.toString("base64"),
      releasedBase64: released.toString("base64"),
      activeAxis: axis,
    },
  );
}

interface StoredProject {
  readonly id: string;
  readonly name: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly lastOpenedAt: string;
  readonly lastSavedRevision: number;
  readonly lastExportedRevision: number | null;
  readonly documentJson: string;
}

async function activeStoredProject(page: Page): Promise<StoredProject> {
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
  if (active === undefined) throw new Error("Active IndexedDB project was not found.");
  return active;
}

function assertNoSmartAlignTransientState(serialized: string): void {
  for (const transient of [
    "smartAlign",
    "smart-align",
    "guideStart",
    "guideEnd",
    "referenceEntityId",
    "activeAxis",
  ]) {
    expect(serialized).not.toContain(transient);
  }
}

function expectOnlyAxisChanged(
  actual: readonly number[],
  initial: readonly [number, number, number],
  activeAxis: "x" | "y" | "z",
): void {
  const activeIndex = { x: 0, y: 1, z: 2 }[activeAxis];
  for (const index of [0, 1, 2] as const) {
    if (index === activeIndex) expect(actual[index]).not.toBeCloseTo(initial[index], 6);
    else expect(actual[index]).toBeCloseTo(initial[index], 6);
  }
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
