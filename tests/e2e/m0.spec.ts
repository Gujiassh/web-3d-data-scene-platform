import { expect, test, type Locator, type Page } from "@playwright/test";

const artifact = (name: string) => `artifacts/e2e/${name}`;

test.describe("M0 Studio browser acceptance", () => {
  test("starts with a local authoring project and gates narrow viewports", async ({ page }) => {
    const runtimeErrors = observeRuntimeErrors(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");

    const canvas = await readyCanvas(page);
    await expect(page.locator('canvas[data-web3d-viewer="true"]')).toHaveCount(1);
    const emptyScene = await canvasMetrics(page, canvas);
    expect(emptyScene.opaqueRatio).toBeGreaterThan(0.99);
    expect(emptyScene.distinct).toBeGreaterThan(8);
    await expect(page.getByTestId("save-state")).toHaveText("Saved locally");
    await expect(page.getByTestId("document-revision")).toHaveText("revision 0");
    await expect(page.getByTestId("viewport-mode")).toHaveText("EDIT / SELECT / NO SELECTION");
    await expect(page.getByRole("treeitem")).toHaveCount(0);
    await expect(page.getByText("No selection", { exact: true })).toBeVisible();
    await expect(page.locator(".diagnostics-title span")).toHaveText("0");
    await expect(page.getByText("document=valid storage=indexeddb authoring=ready")).toBeVisible();

    await page.getByRole("button", { name: "Run", exact: true }).click();
    await expect(page.getByTestId("viewport-mode")).toHaveText("RUN / SELECT / NO SELECTION");
    await expect(page.getByRole("button", { name: "Import", exact: true })).toBeDisabled();
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(page.getByTestId("viewport-mode")).toHaveText("EDIT / SELECT / NO SELECTION");
    await expect(page.locator('canvas[data-web3d-viewer="true"]')).toHaveCount(1);
    await page.screenshot({ path: artifact("studio-desktop-1440x900.png"), fullPage: true });
    await expectNoPageOverflow(page);

    await page.setViewportSize({ width: 768, height: 1024 });
    const sizeGate = page.locator(".studio-size-gate");
    await expect(sizeGate).toBeVisible();
    const gateBox = await sizeGate.boundingBox();
    expect(gateBox).not.toBeNull();
    expect(Math.abs((gateBox?.y ?? 0) + (gateBox?.height ?? 0) / 2 - 512)).toBeLessThan(24);
    await expect(page.locator(".studio-workspace")).toBeHidden();
    await expect(page.locator('canvas[data-web3d-viewer="true"]')).toHaveCount(0);
    await page.screenshot({ path: artifact("studio-size-gate-768x1024.png"), fullPage: true });
    await expectNoPageOverflow(page);
    expect(runtimeErrors).toEqual([]);
  });
});

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

async function canvasMetrics(page: Page, canvas: Locator) {
  const encoded = (await canvas.screenshot()).toString("base64");
  return page.evaluate(async (base64) => {
    const response = await fetch(`data:image/png;base64,${base64}`);
    const bitmap = await createImageBitmap(await response.blob());
    const sample = document.createElement("canvas");
    sample.width = 96;
    sample.height = 96;
    const context = sample.getContext("2d", { willReadFrequently: true });
    if (context === null) return { distinct: 0, opaqueRatio: 0 };
    context.drawImage(bitmap, 0, 0, sample.width, sample.height);
    bitmap.close();
    const pixels = context.getImageData(0, 0, sample.width, sample.height).data;
    const colors = new Set<string>();
    let opaque = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      const red = pixels[index] ?? 0;
      const green = pixels[index + 1] ?? 0;
      const blue = pixels[index + 2] ?? 0;
      const alpha = pixels[index + 3] ?? 0;
      if (alpha > 250) opaque += 1;
      colors.add(`${red >> 4}:${green >> 4}:${blue >> 4}:${alpha >> 4}`);
    }
    return { distinct: colors.size, opaqueRatio: opaque / (pixels.length / 4) };
  }, encoded);
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
