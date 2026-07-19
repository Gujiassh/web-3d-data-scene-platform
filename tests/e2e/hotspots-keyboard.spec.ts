import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  assertNoRuntimeErrors,
  canvasPoint,
  createHotspotFromCenterReticle,
  documentSnapshot,
  expectDocumentSnapshot,
  expectRevision,
  hotspotRow,
  observeRuntimeErrors,
  openHotspotsPanel,
  openStudioWithFactoryModel,
  requiredBounds,
  storedHotspotAnchor,
} from "./hotspot-test-helpers";

test.afterEach(async ({ page }) => assertNoRuntimeErrors(page));

test.describe("Studio hotspot keyboard and direct manipulation", () => {
  test("moves the visible reticle by exact keyboard steps and cancels without mutation", async ({
    page,
  }) => {
    test.setTimeout(75_000);
    observeRuntimeErrors(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await openStudioWithFactoryModel(page);
    const before = await documentSnapshot(page);

    await page.keyboard.press("h");
    await expect(page.getByTestId("add-hotspot-button")).toHaveAttribute("aria-pressed", "true");
    const reticle = visibleReticle(page);
    await expect(reticle).toBeVisible();
    const initial = await requiredBounds(reticle, "hotspot reticle");

    await page.keyboard.press("ArrowRight");
    await expectReticleDelta(reticle, initial, 8, 0);
    const afterRegularStep = await requiredBounds(reticle, "hotspot reticle");
    await page.keyboard.press("Shift+ArrowDown");
    await expectReticleDelta(reticle, afterRegularStep, 0, 32);

    await page.keyboard.press("Escape");
    await expect(reticle).toBeHidden();
    await expectDocumentSnapshot(page, before);

    await page.keyboard.press("h");
    await expect(visibleReticle(page)).toHaveAttribute("data-status", "valid");
    await page.keyboard.press("Enter");
    const title = page.getByLabel("Hotspot title", { exact: true });
    await expect(title).toBeVisible();
    await title.fill("Keyboard point");
    await title.press("Enter");
    await expectRevision(page, 2);

    await openHotspotsPanel(page);
    let row = hotspotRow(page, "Keyboard point");
    await row.focus();
    await page.keyboard.press("F2");
    const rename = page.getByLabel("Hotspot title", { exact: true });
    await expect(rename).toHaveValue("Keyboard point");
    await rename.fill("Keyboard renamed");
    await rename.press("Enter");
    await expectRevision(page, 3);

    row = hotspotRow(page, "Keyboard renamed");
    await row.focus();
    await page.keyboard.press("Delete");
    await expectRevision(page, 4);
    await expect(row).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Add hotspot", exact: true })).toBeFocused();
  });

  test("keeps sub-threshold and invalid drags byte-identical and commits one valid drag", async ({
    page,
  }) => {
    test.setTimeout(75_000);
    observeRuntimeErrors(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    const canvas = await openStudioWithFactoryModel(page);
    await createHotspotFromCenterReticle(page, "Drag point");
    const before = await documentSnapshot(page);
    const anchorBefore = await storedHotspotAnchor(page, before.revision);

    let proxy = page.locator('.web3d-hotspot-proxy[aria-label="Drag point"]');
    let start = await centerOf(proxy, "hotspot proxy");
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 3, start.y);
    await page.mouse.up();
    await expectDocumentSnapshot(page, before);
    await page.keyboard.press("Escape");

    proxy = page.locator('.web3d-hotspot-proxy[aria-label="Drag point"]');
    start = await centerOf(proxy, "hotspot proxy");
    const invalid = await canvasPoint(canvas, 0.95, 0.9);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(invalid.x, invalid.y, { steps: 12 });
    await page.mouse.up();
    await expectDocumentSnapshot(page, before);

    proxy = page.locator('.web3d-hotspot-proxy[aria-label="Drag point"]');
    start = await centerOf(proxy, "hotspot proxy");
    const valid = await canvasPoint(canvas, 0.64, 0.5);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(valid.x, valid.y, { steps: 12 });
    await page.mouse.up();
    await expectRevision(page, before.revision + 1);
    const anchorAfter = await storedHotspotAnchor(page, before.revision + 1);
    expect(anchorAfter).not.toEqual(anchorBefore);
  });

  test("uses Home and End across the locale-sorted hotspot list", async ({ page }) => {
    test.setTimeout(75_000);
    observeRuntimeErrors(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await openStudioWithFactoryModel(page);
    await createHotspotFromCenterReticle(page, "Zulu point");
    await createHotspotFromCenterReticle(page, "Alpha point");
    await openHotspotsPanel(page);

    const first = hotspotRow(page, "Alpha point");
    const last = hotspotRow(page, "Zulu point");
    await first.focus();
    await page.keyboard.press("End");
    await expect(last).toBeFocused();
    await page.keyboard.press("Home");
    await expect(first).toBeFocused();
  });

  test("rejects locked list rename and delete shortcuts while keeping Inspector read-only", async ({
    page,
  }) => {
    test.setTimeout(75_000);
    observeRuntimeErrors(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await openStudioWithFactoryModel(page);
    await createHotspotFromCenterReticle(page, "Locked point");
    await openHotspotsPanel(page);
    const row = hotspotRow(page, "Locked point");
    await row.click();
    await page.getByRole("toolbar").getByRole("button", { name: "Lock" }).click();
    await expectRevision(page, 3);
    const locked = await documentSnapshot(page);

    await row.focus();
    await page.keyboard.press("F2");
    await expect(page.getByLabel("Hotspot title")).toHaveCount(0);
    await page.keyboard.press("Delete");
    await expectDocumentSnapshot(page, locked);

    await row.click();
    const popover = page.getByRole("toolbar", { name: "Hotspot actions for Locked point" });
    await popover.getByRole("button", { name: "More" }).click();
    const inspector = page.locator(".hotspot-inspector");
    await expect(inspector.locator("textarea")).toBeDisabled();
    await inspector.getByText("Behavior", { exact: true }).click();
    for (const action of ["Show content", "Focus hotspot", "Focus target", "Open link"]) {
      await expect(inspector.getByRole("radio", { name: action, exact: true })).toBeDisabled();
    }
  });
});

function visibleReticle(page: Page): Locator {
  return page.locator(".web3d-hotspot-reticle:not([hidden])");
}

async function expectReticleDelta(
  reticle: Locator,
  before: { readonly x: number; readonly y: number },
  deltaX: number,
  deltaY: number,
): Promise<void> {
  await expect
    .poll(async () => {
      const after = await requiredBounds(reticle, "hotspot reticle");
      return { x: Math.round(after.x - before.x), y: Math.round(after.y - before.y) };
    })
    .toEqual({ x: deltaX, y: deltaY });
}

async function centerOf(locator: Locator, name: string) {
  const bounds = await requiredBounds(locator, name);
  return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
}
