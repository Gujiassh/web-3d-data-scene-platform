import { expect, test, type Locator, type Page } from "@playwright/test";

const artifact = (name: string) => `artifacts/e2e/${name}`;

test.describe("M0 browser acceptance", () => {
  test("Factory Demo renders WebGL, focuses equipment, and completes the telemetry cycle", async ({
    page,
  }) => {
    const runtimeErrors = observeRuntimeErrors(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await instrumentScenarioTimers(page);
    await page.goto("http://127.0.0.1:4174");

    const canvas = await readyCanvas(page);
    await expect(page.locator('canvas[data-web3d-viewer="true"]')).toHaveCount(1);
    await expect(page.getByTestId("connection-state")).toHaveText("online");
    const initial = await expectRunningScene(page, canvas);
    expect(await scenarioTimerCount(page)).toBe(4);

    const beforeFocus = await canvas.screenshot();
    await page.getByTestId("equipment-conveyor-01").click();
    await expect(page.getByTestId("equipment-conveyor-01")).toHaveClass(/is-selected/);
    await expect(page.getByLabel("Runtime operations").getByText("CONVEYOR-01")).toBeVisible();
    await page.waitForTimeout(350);
    const afterFocus = await canvas.screenshot();
    expect(afterFocus.equals(beforeFocus)).toBe(false);
    const focused = await canvasMetrics(page, canvas);
    expectFramed(focused.blueBounds, 0.04);
    expect(focused.greenRatio).toBeGreaterThan(initial.greenRatio * 1.1);

    const alarm = page.getByTestId("alarm-list").getByRole("button");
    await expect(alarm).toContainText("Equipment fault", { timeout: 5_000 });
    await expect(alarm).toHaveCount(1);
    await expect(page.getByTestId("equipment-press-01")).toContainText("critical");
    expect((await canvasMetrics(page, canvas)).redRatio).toBeGreaterThan(0.005);
    await alarm.click();
    await expect(page.getByTestId("equipment-press-01")).toHaveClass(/is-selected/);
    await page.waitForTimeout(350);
    expectFramed((await canvasMetrics(page, canvas)).blueBounds, 0.04);
    await page.screenshot({ path: artifact("factory-fault-1440x900.png"), fullPage: true });

    await expect(page.getByText("No active alarms", { exact: true })).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.getByTestId("connection-state")).toHaveText("offline", {
      timeout: 4_000,
    });
    await expect(page.getByTestId("equipment-press-01")).toContainText("offline");
    await expect(page.getByTestId("equipment-conveyor-01")).toContainText("offline");
    const offline = await canvasMetrics(page, canvas);
    expect(offline.darkNeutralRatio).toBeGreaterThan(0.01);
    expect(offline.greenRatio).toBeLessThan(0.01);
    await expect(page.getByTestId("alarm-list").getByRole("button")).toHaveCount(2);
    await page.screenshot({ path: artifact("factory-offline-1440x900.png"), fullPage: true });

    await expect(page.getByTestId("connection-state")).toHaveText("online", {
      timeout: 4_000,
    });
    expect((await canvasMetrics(page, canvas)).greenRatio).toBeGreaterThan(0.01);
    await expect(page.getByTestId("alarm-list")).toHaveCount(0);
    await expect(page.locator('canvas[data-web3d-viewer="true"]')).toHaveCount(1);
    await expect(page.locator(".diagnostic-count")).toHaveText("0 recent");
    expect(await scenarioTimerCount(page)).toBe(0);
    await page.screenshot({ path: artifact("factory-desktop-1440x900.png"), fullPage: true });
    await expectNoPageOverflow(page);
    expect(runtimeErrors).toEqual([]);
  });

  test("Studio shares the runtime contract and gates narrow viewports", async ({ page }) => {
    const runtimeErrors = observeRuntimeErrors(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("http://127.0.0.1:4173");

    const canvas = await readyCanvas(page);
    await expect(page.locator('canvas[data-web3d-viewer="true"]')).toHaveCount(1);
    await expect(page.locator(".studio-connection")).toHaveText("online");
    await expectRunningScene(page, canvas);
    await expect(page.getByText("contract=valid asset_hash=verified targets=2")).toBeVisible();

    await page.getByRole("button", { name: "Inspect" }).click();
    await expect(page.locator(".studio-connection")).toHaveText("adapter paused");
    await expect(page.locator(".source-summary small")).toHaveText("paused");
    await page.getByRole("button", { name: "Run", exact: true }).click();
    await expect(page.locator(".studio-connection")).toHaveText("online");
    await expect(page.locator('canvas[data-web3d-viewer="true"]')).toHaveCount(1);
    await expect(page.locator(".diagnostics-title span")).toHaveText("0");

    await page.getByTestId("tree-conveyor-01").click();
    await expect(page.getByTestId("tree-conveyor-01")).toHaveClass(/is-selected/);
    await expect(page.locator(".viewport-mode")).toContainText("CONVEYOR-01");
    await expect(page.locator(".inspector-header .mono")).toHaveText("CONVEYOR-01");
    await expect(page.getByText("/machines/CONVEYOR-01/status", { exact: true })).toBeVisible();
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

  test("Factory Demo remains usable at tablet width", async ({ page }) => {
    const runtimeErrors = observeRuntimeErrors(page);
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto("http://127.0.0.1:4174");

    const canvas = await readyCanvas(page);
    await expect(page.getByTestId("connection-state")).toHaveText("online");
    const initial = await expectRunningScene(page, canvas);
    await expect(page.getByTestId("equipment-press-01")).toBeVisible();
    await expect(page.getByTestId("equipment-conveyor-01")).toBeVisible();
    const operations = page.locator(".operations-rail");
    await expect(operations).toBeVisible();
    await page.getByTestId("equipment-press-01").click();
    await expect(operations.getByText("PRESS-01", { exact: true })).toBeVisible();
    await page.waitForTimeout(350);
    const focused = await canvasMetrics(page, canvas);
    expectFramed(focused.blueBounds, 0.04);
    expect(focused.greenRatio).toBeGreaterThan(initial.greenRatio * 1.1);
    await page.screenshot({ path: artifact("factory-tablet-768x1024.png"), fullPage: true });
    await expectNoPageOverflow(page);
    expect(runtimeErrors).toEqual([]);
  });

  test("Factory Demo redraws after WebGL context restoration", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("http://127.0.0.1:4174");

    const canvas = await readyCanvas(page);
    await expect(page.getByTestId("connection-state")).toHaveText("online");
    await expectRunningScene(page, canvas);
    const contextState = await canvas.evaluate(async (element) => {
      const value = element as HTMLCanvasElement;
      const context = value.getContext("webgl2");
      const extension = context?.getExtension("WEBGL_lose_context");
      if (extension === null || extension === undefined) return "unsupported";

      const lost = new Promise<void>((resolve) => {
        value.addEventListener("webglcontextlost", () => resolve(), { once: true });
      });
      extension.loseContext();
      if (!(await within(lost, 2_000))) return "loss-timeout";
      await new Promise((resolve) => setTimeout(resolve, 250));
      const restored = new Promise<void>((resolve) => {
        value.addEventListener("webglcontextrestored", () => resolve(), { once: true });
      });
      extension.restoreContext();
      if (!(await within(restored, 5_000))) return "restore-timeout";
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      return "restored";

      async function within(promise: Promise<void>, timeoutMs: number): Promise<boolean> {
        return Promise.race([
          promise.then(() => true),
          new Promise<false>((resolve) => setTimeout(() => resolve(false), timeoutMs)),
        ]);
      }
    });

    expect(contextState).toBe("restored");
    await expect(page.locator(".diagnostic-count")).toHaveText("1 recent");
    await expectRunningScene(page, canvas);
    await expect(page.locator('canvas[data-web3d-viewer="true"]')).toHaveCount(1);
    await page.screenshot({
      path: artifact("factory-context-restored-1440x900.png"),
      fullPage: true,
    });
  });
});

async function readyCanvas(page: Page): Promise<Locator> {
  const canvas = page.locator('canvas[data-web3d-viewer="true"]');
  await expect(canvas).toBeVisible({ timeout: 15_000 });
  await expect
    .poll(async () =>
      canvas.evaluate((element) => {
        const value = element as HTMLCanvasElement;
        return value.width > 100 && value.height > 100;
      }),
    )
    .toBe(true);
  return canvas;
}

async function expectRunningScene(page: Page, canvas: Locator) {
  const result = await canvasMetrics(page, canvas);
  expect(result.opaqueRatio).toBeGreaterThan(0.99);
  expect(result.distinct).toBeGreaterThan(8);
  expect(result.greenRatio).toBeGreaterThan(0.01);
  expectFramed(result.greenBounds, 0.01);
  return result;
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
      return {
        blueBounds: null,
        darkNeutralRatio: 0,
        distinct: 0,
        greenBounds: null,
        greenRatio: 0,
        opaqueRatio: 0,
        redRatio: 0,
      };
    }
    context.drawImage(bitmap, 0, 0, sample.width, sample.height);
    bitmap.close();
    const pixels = context.getImageData(0, 0, sample.width, sample.height).data;
    const colors = new Set<string>();
    const blueBounds = { maxX: -1, maxY: -1, minX: sample.width, minY: sample.height };
    const greenBounds = { maxX: -1, maxY: -1, minX: sample.width, minY: sample.height };
    let blueCount = 0;
    let darkNeutral = 0;
    let greenCount = 0;
    let opaque = 0;
    let redCount = 0;

    for (let index = 0; index < pixels.length; index += 4) {
      const red = pixels[index] ?? 0;
      const green = pixels[index + 1] ?? 0;
      const blue = pixels[index + 2] ?? 0;
      const alpha = pixels[index + 3] ?? 0;
      const pixel = index / 4;
      const x = pixel % sample.width;
      const y = Math.floor(pixel / sample.width);
      const maximum = Math.max(red, green, blue);
      const minimum = Math.min(red, green, blue);
      const isBlue = blue > 100 && blue > red + 40 && blue > green + 25;
      const isGreen = green > 55 && green > red + 10 && green > blue + 5;
      const isRed = red > 70 && red > green + 15 && red > blue + 15;

      if (alpha > 250) opaque += 1;
      if (isBlue) {
        blueCount += 1;
        include(blueBounds, x, y);
      }
      if (isGreen) {
        greenCount += 1;
        include(greenBounds, x, y);
      }
      if (isRed) redCount += 1;
      if (maximum - minimum < 14 && maximum < 145 && minimum > 45) darkNeutral += 1;
      colors.add(`${red >> 4}:${green >> 4}:${blue >> 4}:${alpha >> 4}`);
    }

    const count = pixels.length / 4;
    return {
      blueBounds: normalizedBounds(blueBounds, blueCount, sample.width, sample.height),
      darkNeutralRatio: darkNeutral / count,
      distinct: colors.size,
      greenBounds: normalizedBounds(greenBounds, greenCount, sample.width, sample.height),
      greenRatio: greenCount / count,
      opaqueRatio: opaque / count,
      redRatio: redCount / count,
    };

    function include(bounds: typeof blueBounds, x: number, y: number): void {
      bounds.minX = Math.min(bounds.minX, x);
      bounds.maxX = Math.max(bounds.maxX, x);
      bounds.minY = Math.min(bounds.minY, y);
      bounds.maxY = Math.max(bounds.maxY, y);
    }

    function normalizedBounds(
      bounds: typeof blueBounds,
      pixelCount: number,
      width: number,
      height: number,
    ) {
      if (pixelCount === 0) return null;
      return {
        maxX: bounds.maxX / (width - 1),
        maxY: bounds.maxY / (height - 1),
        minX: bounds.minX / (width - 1),
        minY: bounds.minY / (height - 1),
      };
    }
  }, encoded);
}

function expectFramed(
  bounds: { maxX: number; maxY: number; minX: number; minY: number } | null,
  padding: number,
): void {
  expect(bounds).not.toBeNull();
  expect(bounds?.minX ?? 0).toBeGreaterThan(padding);
  expect(bounds?.minY ?? 0).toBeGreaterThan(padding);
  expect(bounds?.maxX ?? 1).toBeLessThan(1 - padding);
  expect(bounds?.maxY ?? 1).toBeLessThan(1 - padding);
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

async function instrumentScenarioTimers(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const scenarioDelays = new Set([120, 2_600, 5_600, 7_800, 9_800]);
    const active = new Set<number>();
    const originalSetTimeout = window.setTimeout.bind(window);
    const originalClearTimeout = window.clearTimeout.bind(window);

    window.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
      if (!scenarioDelays.has(Number(timeout)) || typeof handler !== "function") {
        return originalSetTimeout(handler, timeout, ...args);
      }
      let timer = 0;
      timer = originalSetTimeout(() => {
        active.delete(timer);
        handler(...args);
      }, timeout);
      active.add(timer);
      return timer;
    }) as typeof window.setTimeout;
    window.clearTimeout = ((timer?: number) => {
      if (timer !== undefined) active.delete(timer);
      originalClearTimeout(timer);
    }) as typeof window.clearTimeout;
    (window as typeof window & { __m0ScenarioTimerCount?: () => number }).__m0ScenarioTimerCount =
      () => active.size;
  });
}

async function scenarioTimerCount(page: Page): Promise<number> {
  return page.evaluate(() =>
    (window as typeof window & { __m0ScenarioTimerCount: () => number }).__m0ScenarioTimerCount(),
  );
}
