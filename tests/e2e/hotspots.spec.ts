import { readFile, writeFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";

import {
  acceptExplicitReposition,
  activeStoredDocument,
  artifact,
  assertNoRuntimeErrors,
  canvasRelativePoint,
  createHotspotFromCenterReticle,
  currentRevision,
  documentSnapshot,
  expectDocumentSnapshot,
  expectInsideViewport,
  expectRevision,
  expectStoredRevision,
  hotspotRow,
  hotspotRowContainer,
  observeRuntimeErrors,
  openHotspotInspector,
  openHotspotPopover,
  openHotspotsPanel,
  openRowFallbackPopover,
  openStudioWithFactoryModel,
  storedHotspotAnchor,
  trustedCatalogStudioUrl,
} from "./hotspot-test-helpers";

test.afterEach(async ({ page }) => assertNoRuntimeErrors(page));

test.describe("Studio hotspot management", () => {
  test("opens one title draft from a resolved surface click", async ({ page }) => {
    test.setTimeout(75_000);
    observeRuntimeErrors(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    const canvas = await openStudioWithFactoryModel(page);
    const before = await documentSnapshot(page);

    await page.getByTestId("add-hotspot-button").click();
    await expect(page.locator(".web3d-hotspot-reticle:not([hidden])")).toHaveAttribute(
      "data-status",
      "valid",
    );
    await canvas.click({ position: await canvasRelativePoint(canvas, 0.5, 0.5) });
    const title = page.getByLabel("Hotspot title", { exact: true });
    await expect(title).toBeVisible();
    await expectDocumentSnapshot(page, before);
    await title.fill("Pointer point");
    await title.press("Enter");
    await expectRevision(page, before.revision + 1);
  });

  test("preserves authored hotspot title bytes", async ({ page }) => {
    observeRuntimeErrors(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await openStudioWithFactoryModel(page);
    const title = "  Inspection \u{1F600}  ";

    await createHotspotFromCenterReticle(page, title);

    const document = await activeStoredDocument(page);
    expect(document.annotations[0]?.title).toBe(title);
  });

  test("authors and manages a resolved hotspot through visible controls", async ({ page }) => {
    test.setTimeout(90_000);
    observeRuntimeErrors(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    const canvas = await openStudioWithFactoryModel(page);

    await createHotspotFromCenterReticle(page, "Station sensor");

    await openHotspotsPanel(page);
    let row = hotspotRow(page, "Station sensor");
    await expect(row).toBeVisible();
    await expect(page.locator(".web3d-hotspot-proxy")).toHaveAttribute(
      "aria-label",
      "Station sensor",
    );

    let popover = await openHotspotPopover(page, "Station sensor");
    await expectInsideViewport(page, popover);
    await popover.getByRole("button", { name: "Rename", exact: true }).click();
    const rename = page.getByLabel("Hotspot title", { exact: true });
    await expect(rename).toHaveValue("Station sensor");
    await rename.fill("Inspection point");
    await rename.press("Enter");
    await expectRevision(page, 3);
    row = hotspotRow(page, "Inspection point");

    const anchorBefore = await storedHotspotAnchor(page, 3);
    popover = await openHotspotPopover(page, "Inspection point");
    await popover.getByRole("button", { name: "Reposition", exact: true }).click();
    await acceptExplicitReposition(page, canvas, 4);
    expect(await storedHotspotAnchor(page, 4)).not.toEqual(anchorBefore);

    popover = await openHotspotPopover(page, "Inspection point");
    await popover.getByRole("button", { name: "Hide", exact: true }).click();
    await expectRevision(page, 5);
    await expect(row.getByLabel("Hidden", { exact: true })).toBeVisible();
    await expect(page.locator(".web3d-hotspot-proxy")).toBeHidden();
    popover = await openRowFallbackPopover(page, "Inspection point");
    await expectInsideViewport(page, popover);
    await popover.getByRole("button", { name: "Show", exact: true }).click();
    await expectRevision(page, 6);

    popover = await openHotspotPopover(page, "Inspection point");
    await popover.getByRole("button", { name: "Lock", exact: true }).click();
    await expectRevision(page, 7);
    await expect(row.getByLabel("Locked", { exact: true })).toBeVisible();
    popover = await openRowFallbackPopover(page, "Inspection point");
    await expect(popover.getByRole("button", { name: "Rename", exact: true })).toBeDisabled();
    await expect(popover.getByRole("button", { name: "Reposition", exact: true })).toBeDisabled();
    await expect(popover.getByRole("button", { name: "Delete", exact: true })).toBeDisabled();
    await popover.getByRole("button", { name: "Unlock", exact: true }).click();
    await expectRevision(page, 8);

    await page.screenshot({ path: artifact("hotspots-en-light-1440x900.png"), fullPage: true });
    popover = await openRowFallbackPopover(page, "Inspection point");
    await popover.getByRole("button", { name: "Delete", exact: true }).click();
    await expectRevision(page, 9);
    await expect(row).toHaveCount(0);
    await expect(page.locator(".web3d-hotspot-proxy")).toHaveCount(0);
  });

  test("uses trusted display-name selectors without exposing persisted IDs", async ({ page }) => {
    test.setTimeout(75_000);
    observeRuntimeErrors(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await openStudioWithFactoryModel(page, "en", trustedCatalogStudioUrl);
    await createHotspotFromCenterReticle(page, "Selector point");
    await openHotspotsPanel(page);

    let inspector = await openHotspotInspector(page, "Selector point");
    await inspector.getByRole("button", { name: "Host content", exact: true }).click();
    const trustedSearch = inspector.getByRole("searchbox", { name: "Trusted content" });
    await expect(trustedSearch).toHaveAttribute("placeholder", "Search trusted content");
    await trustedSearch.fill("maintenance");
    const trustedResults = inspector.getByRole("listbox", { name: "Trusted content" });
    await expect(trustedResults.getByRole("option")).toHaveCount(1);
    await expect(trustedResults.getByRole("option", { name: "Maintenance record" })).toBeVisible();
    await expect(inspector).not.toContainText("studio.maintenance-record");
    await trustedResults.getByRole("option", { name: "Maintenance record" }).click();
    await expectRevision(page, 3);

    inspector = page.locator(".hotspot-inspector");
    await expect(
      inspector
        .getByRole("listbox", { name: "Trusted content" })
        .getByRole("option", { name: "Maintenance record" }),
    ).toHaveAttribute("aria-selected", "true");
    await inspector.getByText("Behavior", { exact: true }).click();
    await inspector.getByRole("radio", { name: "Focus target", exact: true }).click();
    const targetSearch = inspector.getByRole("searchbox", { name: "Target" });
    await expect(targetSearch).toHaveAttribute("placeholder", "Search targets");
    const document = await activeStoredDocument(page);
    const target = document.targets[0];
    if (target === undefined) throw new Error("The imported M0 scene has no real Target.");
    await expect(inspector).not.toContainText(target.id);
    await targetSearch.fill("m0-factory");
    const targetResults = inspector.getByRole("listbox", { name: "Target" });
    await expect(
      targetResults.getByRole("option", { name: target.name, exact: true }),
    ).toBeVisible();
    await targetResults.getByRole("option", { name: target.name, exact: true }).click();
    await expectRevision(page, 4);
    await expectStoredRevision(page, 4);
  });

  test("keeps hidden and unresolved rows manageable and enforces Run visibility", async ({
    page,
  }, testInfo) => {
    test.setTimeout(75_000);
    observeRuntimeErrors(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await openStudioWithFactoryModel(page);
    await createHotspotFromCenterReticle(page, "Hidden point");
    await createHotspotFromCenterReticle(page, "Unresolved point");
    await openHotspotsPanel(page);
    let popover = await openHotspotPopover(page, "Hidden point");
    await popover.getByRole("button", { name: "Hide", exact: true }).click();
    await expectRevision(page, 4);
    await expect(page.locator('.web3d-hotspot-proxy[aria-label="Hidden point"]')).toBeHidden();
    popover = await openRowFallbackPopover(page, "Hidden point");
    await expectInsideViewport(page, popover);
    await page.keyboard.press("Escape");
    await expectStoredRevision(page, 4);

    await page.getByRole("button", { name: "Open project menu" }).click();
    const downloadPromise = page.waitForEvent("download");
    await page.getByTestId("export-json-command").click();
    const download = await downloadPromise;
    const exportedPath = testInfo.outputPath("resolved.scene.json");
    await download.saveAs(exportedPath);
    const document = JSON.parse(await readFile(exportedPath, "utf8")) as {
      targets: Array<{ id: string }>;
      annotations: Array<{
        title: string;
        anchor: unknown;
      }>;
    };
    const annotation = document.annotations.find(
      (candidate) => candidate.title === "Unresolved point",
    );
    const target = document.targets[0];
    if (annotation === undefined || target === undefined) {
      throw new Error("Expected one hotspot and one real imported Target.");
    }
    annotation.anchor = {
      kind: "legacy",
      targetId: target.id,
      localOffset: [0, 0, 0],
    };
    const unresolvedPath = testInfo.outputPath("unresolved.scene.json");
    await writeFile(unresolvedPath, `${JSON.stringify(document, null, 2)}\n`, "utf8");
    await page.getByTestId("json-file-input").setInputFiles(unresolvedPath);

    await openHotspotsPanel(page);
    const row = hotspotRow(page, "Unresolved point");
    await expect(row).toContainText("Reposition this legacy hotspot");
    await expect(page.locator(".web3d-hotspot-proxy")).toHaveCount(0);
    popover = await openRowFallbackPopover(page, "Unresolved point");
    await expectInsideViewport(page, popover);
    const rowBounds = await hotspotRowContainer(page, "Unresolved point").boundingBox();
    const popoverBounds = await popover.boundingBox();
    expect(rowBounds).not.toBeNull();
    expect(popoverBounds).not.toBeNull();
    expect((popoverBounds?.x ?? 0) + (popoverBounds?.width ?? 0)).toBeGreaterThan(
      rowBounds?.x ?? Number.POSITIVE_INFINITY,
    );
    expect(await currentRevision(page)).toBe(4);

    await page.getByRole("button", { name: "Run", exact: true }).click();
    await expect(hotspotRow(page, "Hidden point")).toHaveCount(0);
    await expect(hotspotRow(page, "Unresolved point")).toBeVisible();
    await expect(hotspotRow(page, "Unresolved point")).toBeDisabled();
    await expectRevision(page, 4);
  });
});
