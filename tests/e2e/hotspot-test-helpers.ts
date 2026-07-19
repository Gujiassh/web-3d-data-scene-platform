import path from "node:path";

import { expect, type Locator, type Page } from "@playwright/test";

export const studioUrl = "/";
export const trustedCatalogStudioUrl = "/e2e-hotspot-host.html";
export const factoryModelPath = path.resolve(
  "tests/fixtures/m0-factory/public/m0-factory-cell.glb",
);
export const factoryModelSha256 =
  "e123f3d64ec60f136d8673478eb2fd2ce28f56bcb5fb94cef5a7377b9605efe8";
export const artifact = (name: string) => `artifacts/e2e/${name}`;

const runtimeErrorsByPage = new WeakMap<Page, string[]>();

export interface StoredProject {
  readonly lastOpenedAt: string;
  readonly lastSavedRevision: number;
  readonly documentJson: string;
}

export interface StoredDocumentSnapshot {
  readonly revision: number;
  readonly documentJson: string;
}

export interface E2eSceneDocument {
  readonly revision: number;
  readonly targets: readonly { readonly id: string; readonly name: string }[];
  readonly annotations: readonly {
    readonly title: string;
    readonly anchor: unknown;
  }[];
}

export function observeRuntimeErrors(page: Page): string[] {
  const errors: string[] = [];
  runtimeErrorsByPage.set(page, errors);
  page.on("pageerror", (error) => errors.push(`pageerror:${error.stack ?? error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console:${message.text()}`);
  });
  return errors;
}

export function assertNoRuntimeErrors(page: Page): void {
  expect(runtimeErrorsByPage.get(page) ?? [], "Studio emitted browser/runtime errors").toEqual([]);
}

export async function openStudioWithFactoryModel(
  page: Page,
  locale: "en" | "zh-CN" = "en",
  url = studioUrl,
): Promise<Locator> {
  await page.goto(url);
  const canvas = await readyCanvas(page);
  await importFactoryModel(page, locale);
  return canvas;
}

export async function importFactoryModel(page: Page, locale: "en" | "zh-CN" = "en"): Promise<void> {
  await page.getByTestId("model-file-input").setInputFiles(factoryModelPath);
  const dialog = page.getByRole("dialog", {
    name: locale === "en" ? "Import model" : "导入模型",
  });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(factoryModelSha256, { exact: true })).toBeVisible();
  await dialog
    .getByRole("button", { name: locale === "en" ? "Add to scene" : "添加到场景" })
    .click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("treeitem").filter({ hasText: "m0-factory-cell" })).toBeVisible();
  await expectRevision(page, 1);
  await expectStoredRevision(page, 1);
}

export async function createHotspotFromCenterReticle(
  page: Page,
  title: string,
  titleLabel = "Hotspot title",
): Promise<number> {
  const before = await currentRevision(page);
  await page.getByTestId("add-hotspot-button").click();
  const reticle = page.locator(".web3d-hotspot-reticle:not([hidden])");
  await expect(reticle).toHaveAttribute("data-status", "valid");
  await page.keyboard.press("Enter");
  const input = page.getByLabel(titleLabel, { exact: true });
  await expect(input).toBeVisible();
  await expectInsideViewport(page, input.locator("xpath=.."));
  await input.fill(title);
  await input.press("Enter");
  await expectRevision(page, before + 1);
  await expectStoredRevision(page, before + 1);
  return before + 1;
}

export async function acceptPointerPlacement(
  page: Page,
  canvas: Locator,
  titleLabel: string,
): Promise<Locator> {
  const input = page.getByLabel(titleLabel, { exact: true });
  for (const [xRatio, yRatio] of [
    [0.512, 0.469],
    [0.4, 0.45],
    [0.64, 0.5],
  ] as const) {
    await canvas.click({ position: await canvasRelativePoint(canvas, xRatio, yRatio) });
    try {
      await input.waitFor({ state: "visible", timeout: 750 });
      return input;
    } catch {
      // An invalid fixture point leaves the single-shot placement session active.
    }
  }
  throw new Error("The M0 fixture did not expose a resolved surface at any calibrated point.");
}

export async function acceptExplicitReposition(
  page: Page,
  canvas: Locator,
  expectedRevision: number,
): Promise<void> {
  for (const [xRatio, yRatio] of [
    [0.64, 0.5],
    [0.4, 0.45],
    [0.58, 0.4],
  ] as const) {
    await canvas.click({ position: await canvasRelativePoint(canvas, xRatio, yRatio) });
    await page.waitForTimeout(50);
    if ((await currentRevision(page)) === expectedRevision) return;
  }
  throw new Error(`No calibrated M0 surface committed revision ${expectedRevision}.`);
}

export async function openHotspotsPanel(page: Page, name = "Hotspots"): Promise<void> {
  await page.getByRole("button", { name, exact: true }).click();
  await expect(page.locator(".hotspots-panel")).toBeVisible();
}

export function hotspotRow(page: Page, title: string): Locator {
  return page.getByRole("option").filter({ hasText: title });
}

export function hotspotRowContainer(page: Page, title: string): Locator {
  return hotspotRow(page, title).locator("xpath=..");
}

export async function openHotspotPopover(
  page: Page,
  title: string,
  accessibleName = `Hotspot actions for ${title}`,
): Promise<Locator> {
  await hotspotRow(page, title).click();
  const popover = page.getByRole("toolbar", { name: accessibleName, exact: true });
  await expect(popover).toBeVisible();
  return popover;
}

export async function openRowFallbackPopover(
  page: Page,
  title: string,
  accessibleName = `Hotspot actions for ${title}`,
): Promise<Locator> {
  await hotspotRowContainer(page, title).locator(".hotspot-row-actions").click();
  const popover = page.getByRole("toolbar", { name: accessibleName, exact: true });
  await expect(popover).toBeVisible();
  return popover;
}

export async function openHotspotInspector(page: Page, title: string): Promise<Locator> {
  const popover = await openRowFallbackPopover(page, title);
  await popover.getByRole("button", { name: "More", exact: true }).click();
  const inspector = page.locator(".hotspot-inspector");
  await expect(inspector).toBeVisible();
  return inspector;
}

export async function readyCanvas(page: Page): Promise<Locator> {
  const canvas = page.locator('canvas[data-web3d-viewer="true"]');
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const errors = runtimeErrorsByPage.get(page) ?? [];
    if (errors.length > 0) {
      throw new Error(
        `Studio emitted a browser error before Canvas readiness:\n${errors.join("\n")}`,
      );
    }
    if (
      (await canvas.isVisible()) &&
      (await canvas.evaluate((element) => {
        const value = element as HTMLCanvasElement;
        return value.width > 100 && value.height > 100;
      }))
    ) {
      return canvas;
    }
    await page.waitForTimeout(50);
  }
  throw new Error("Studio Canvas did not become ready within 15 seconds.");
}

export async function expectRevision(page: Page, revision: number): Promise<void> {
  await expect(page.getByTestId("document-revision")).toHaveAttribute(
    "data-revision",
    String(revision),
  );
}

export async function currentRevision(page: Page): Promise<number> {
  return Number(await page.getByTestId("document-revision").getAttribute("data-revision"));
}

export async function expectStoredRevision(page: Page, revision: number): Promise<void> {
  await expect
    .poll(() => activeStoredProject(page).then((project) => project.lastSavedRevision))
    .toBe(revision);
}

export async function documentSnapshot(page: Page): Promise<StoredDocumentSnapshot> {
  const revision = await currentRevision(page);
  await expectStoredRevision(page, revision);
  return { revision, documentJson: await activeStoredDocumentJson(page) };
}

export async function expectDocumentSnapshot(
  page: Page,
  expected: StoredDocumentSnapshot,
): Promise<void> {
  await expectRevision(page, expected.revision);
  expect(await activeStoredDocumentJson(page)).toBe(expected.documentJson);
}

export async function storedHotspotAnchor(page: Page, revision: number): Promise<unknown> {
  await expectStoredRevision(page, revision);
  const document = await activeStoredDocument(page);
  expect(document.annotations).toHaveLength(1);
  return document.annotations[0]?.anchor;
}

export async function activeStoredDocumentJson(page: Page): Promise<string> {
  return (await activeStoredProject(page)).documentJson;
}

export async function activeStoredDocument(page: Page): Promise<E2eSceneDocument> {
  return JSON.parse(await activeStoredDocumentJson(page)) as E2eSceneDocument;
}

export async function activeStoredProject(page: Page): Promise<StoredProject> {
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
  if (active === undefined) throw new Error("No active Studio project was stored.");
  return active;
}

export async function canvasRelativePoint(
  canvas: Locator,
  xRatio: number,
  yRatio: number,
): Promise<{ readonly x: number; readonly y: number }> {
  const bounds = await requiredBounds(canvas, "Studio Canvas");
  return { x: bounds.width * xRatio, y: bounds.height * yRatio };
}

export async function canvasPoint(
  canvas: Locator,
  xRatio: number,
  yRatio: number,
): Promise<{ readonly x: number; readonly y: number }> {
  const bounds = await requiredBounds(canvas, "Studio Canvas");
  return { x: bounds.x + bounds.width * xRatio, y: bounds.y + bounds.height * yRatio };
}

export async function requiredBounds(locator: Locator, name: string) {
  const bounds = await locator.boundingBox();
  if (bounds === null) throw new Error(`${name} bounds are unavailable.`);
  return bounds;
}

export async function expectInsideViewport(page: Page, locator: Locator): Promise<void> {
  const bounds = await requiredBounds(locator, "hotspot overlay control");
  const viewport = page.viewportSize();
  if (viewport === null) throw new Error("Playwright viewport is unavailable.");
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height + 1);
}

export async function expectNoPageOrToolbarOverflow(page: Page): Promise<void> {
  const pageOverflow = await page.evaluate(() => ({
    horizontal: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    vertical: document.documentElement.scrollHeight - document.documentElement.clientHeight,
  }));
  expect(pageOverflow.horizontal).toBeLessThanOrEqual(1);
  expect(pageOverflow.vertical).toBeLessThanOrEqual(1);
  const toolbar = await page.locator(".studio-toolbar").evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const children = [...element.children]
      .map((child) => child.getBoundingClientRect())
      .filter((child) => child.width > 0 && child.height > 0);
    return {
      horizontalScroll: element.scrollWidth - element.clientWidth,
      verticalScroll: element.scrollHeight - element.clientHeight,
      leftOverflow: bounds.left - Math.min(...children.map((child) => child.left)),
      rightOverflow: Math.max(...children.map((child) => child.right)) - bounds.right,
      topOverflow: bounds.top - Math.min(...children.map((child) => child.top)),
      bottomOverflow: Math.max(...children.map((child) => child.bottom)) - bounds.bottom,
    };
  });
  for (const overflow of Object.values(toolbar)) expect(overflow).toBeLessThanOrEqual(1);
}
