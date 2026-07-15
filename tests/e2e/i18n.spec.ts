import { readFile } from "node:fs/promises";
import path from "node:path";

import { expect, test, type Locator, type Page } from "@playwright/test";

const studioUrl = "http://127.0.0.1:4173";
const factoryUrl = "http://127.0.0.1:4174";
const studioLocaleKey = "web3d.studio.locale";
const factoryLocaleKey = "web3d.factory-demo.locale";
const factoryModelPath = path.resolve("assets/factory/public/m0-factory-cell.glb");
const artifact = (name: string) => `artifacts/e2e/${name}`;

test.describe("Chinese and English interface", () => {
  test.use({ locale: "zh-CN" });

  test("Studio detects, switches, persists, and leaves the document and Viewer intact", async ({
    page,
  }) => {
    const runtimeErrors = observeRuntimeErrors(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await seedLocale(page, studioLocaleKey, "unsupported");
    await page.goto(studioUrl);

    const canvas = await readyCanvas(page);
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
    await expect(page).toHaveTitle(/[\u3400-\u9fff]/u);
    await expect(page.getByRole("button", { name: "运行", exact: true })).toBeVisible();
    await expect(canvas).toHaveAttribute("aria-label", /[\u3400-\u9fff]/u);
    await expectNoPageOverflow(page);
    await page.screenshot({ path: artifact("studio-zh-1440x900.png"), fullPage: true });

    await page.getByTestId("model-file-input").setInputFiles(factoryModelPath);
    const importDialog = page.getByRole("dialog", { name: "导入模型" });
    await expect(importDialog).toBeVisible();
    await importDialog.getByRole("button", { name: "添加到场景" }).click();
    await expect(page.getByRole("treeitem")).toHaveCount(1);

    await rememberCanvas(page, canvas);
    const revision = await page.getByTestId("document-revision").getAttribute("data-revision");
    expect(revision).toBe("1");
    const before = await exportCanonicalDocument(page);

    await page.getByRole("button", { name: "英文", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("button", { name: "Run", exact: true })).toBeVisible();
    await expect(canvas).toHaveAttribute("aria-label", "Interactive 3D scene");
    expect(await isRememberedCanvas(page, canvas)).toBe(true);
    await expect(page.getByTestId("document-revision")).toHaveAttribute(
      "data-revision",
      revision ?? "",
    );
    expect(await exportCanonicalDocument(page)).toEqual(before);
    expect(await page.evaluate((key) => localStorage.getItem(key), studioLocaleKey)).toBe("en");

    await page.getByRole("button", { name: "Undo" }).click();
    await expect(page.getByRole("treeitem")).toHaveCount(0);
    await expect(page.getByTestId("document-revision")).toHaveAttribute("data-revision", "2");
    await page.getByRole("button", { name: "Redo" }).click();
    await expect(page.getByRole("treeitem")).toHaveCount(1);
    await expect(page.getByTestId("document-revision")).toHaveAttribute("data-revision", "3");
    await page.getByRole("button", { name: "Save local project" }).click();
    await expect(page.getByTestId("save-state")).toHaveText("Saved locally");

    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("button", { name: "Run", exact: true })).toBeVisible();
    await expect(page.getByRole("treeitem")).toHaveCount(1);
    await expect(page.getByTestId("document-revision")).toHaveAttribute("data-revision", "3");
    expect(runtimeErrors).toEqual([]);
  });

  test("Factory switches presentation without resetting selection, connection, or Viewer", async ({
    page,
  }) => {
    const runtimeErrors = observeRuntimeErrors(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(factoryUrl);

    const canvas = await readyCanvas(page);
    const connection = page.getByTestId("connection-state");
    await expect(connection).toHaveClass(/connection-online/, { timeout: 5_000 });
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
    await expect(page.getByText("设备", { exact: true }).first()).toBeVisible();
    await expect(canvas).toHaveAttribute("aria-label", /[\u3400-\u9fff]/u);
    await expectNoPageOverflow(page);
    await page.screenshot({ path: artifact("factory-zh-1440x900.png"), fullPage: true });

    await page.getByTestId("equipment-conveyor-01").click();
    await expect(page.getByTestId("equipment-conveyor-01")).toHaveClass(/is-selected/);
    const alarm = page.getByTestId("alarm-list").getByRole("button");
    await expect(alarm).toContainText("设备故障", { timeout: 5_000 });
    await rememberCanvas(page, canvas);
    const connectionClass = await connection.getAttribute("class");

    await page.getByRole("button", { name: "切换到英文", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(connection).toHaveText("online");
    await expect(connection).toHaveAttribute("class", connectionClass ?? "");
    await expect(page.getByTestId("equipment-conveyor-01")).toHaveClass(/is-selected/);
    await expect(alarm).toContainText("Equipment fault");
    await expect(alarm).toHaveCount(1);
    expect(await isRememberedCanvas(page, canvas)).toBe(true);
    expect(await page.evaluate((key) => localStorage.getItem(key), factoryLocaleKey)).toBe("en");

    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByText("Equipment", { exact: true }).first()).toBeVisible();
    expect(runtimeErrors).toEqual([]);
  });

  test("Chinese layouts fit the Studio desktop and Factory tablet viewports", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(studioUrl);
    await readyCanvas(page);
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
    await expectNoPageOverflow(page);
    await page.screenshot({ path: artifact("studio-zh-1280x720.png"), fullPage: true });

    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto(factoryUrl);
    await readyCanvas(page);
    await expect(page.getByTestId("connection-state")).toHaveClass(/connection-online/, {
      timeout: 5_000,
    });
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
    await expectNoPageOverflow(page);
    await page.screenshot({ path: artifact("factory-zh-768x1024.png"), fullPage: true });
  });
});

async function exportCanonicalDocument(page: Page): Promise<unknown> {
  await page.locator(".project-menu-trigger").click();
  const download = page.waitForEvent("download");
  await page.getByTestId("export-json-command").click();
  const downloadPath = await (await download).path();
  if (downloadPath === null) throw new Error("The canonical document download has no local path.");
  return JSON.parse(await readFile(downloadPath, "utf8")) as unknown;
}

async function seedLocale(page: Page, key: string, value: string): Promise<void> {
  await page.addInitScript(
    ({ storageKey, storageValue }) => {
      const marker = `i18n-seeded:${storageKey}`;
      if (sessionStorage.getItem(marker) !== null) return;
      localStorage.setItem(storageKey, storageValue);
      sessionStorage.setItem(marker, "true");
    },
    { storageKey: key, storageValue: value },
  );
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

async function rememberCanvas(page: Page, canvas: Locator): Promise<void> {
  await canvas.evaluate((element) => {
    (window as typeof window & { __i18nCanvas?: Element }).__i18nCanvas = element;
  });
}

async function isRememberedCanvas(page: Page, canvas: Locator): Promise<boolean> {
  return canvas.evaluate(
    (element) => (window as typeof window & { __i18nCanvas?: Element }).__i18nCanvas === element,
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

function observeRuntimeErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror:${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console:${message.text()}`);
  });
  return errors;
}
