import { readFile } from "node:fs/promises";

import { expect, test, type Locator, type Page } from "@playwright/test";

const studioUrl = "/";
const studioLocaleKey = "web3d.studio.locale";
const studioThemeKey = "web3d.studio.theme";
const artifact = (name: string) => `artifacts/e2e/${name}`;

test.describe("Theme and scene naming", () => {
  test("creates only after naming and keeps rename history, metadata, reload, and export aligned", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const runtimeErrors = observeRuntimeErrors(page);
    await useEnglish(page, studioLocaleKey);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(studioUrl);
    const canvas = await readyCanvas(page);
    await rememberCanvas(page, canvas);
    await expect.poll(() => storedProjects(page).then((projects) => projects.length)).toBe(1);

    await openProjectMenu(page);
    await page.getByRole("button", { name: "New scene", exact: true }).click();
    const createDialog = page.getByRole("dialog", { name: "Create scene" });
    await expect(createDialog).toBeVisible();
    await expect(createDialog).toHaveAttribute("aria-busy", "false");
    await expect(page.locator(".studio-toolbar")).toHaveAttribute("inert", "");
    await expect(createDialog.getByLabel("Scene name")).toBeFocused();
    await createDialog.getByRole("button", { name: "Create scene" }).click();
    await expect(createDialog.getByRole("alert")).toHaveText("Enter a scene name.");
    await page.screenshot({
      path: artifact("studio-create-scene-dialog-light-1440x900.png"),
      fullPage: true,
    });
    expect((await storedProjects(page)).length).toBe(1);
    await createDialog.getByRole("button", { name: "Close scene naming" }).focus();
    await page.keyboard.press("Shift+Tab");
    await expect(createDialog.getByRole("button", { name: "Create scene" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(createDialog).toBeHidden();
    await expect(page.getByRole("button", { name: "Open project menu" })).toBeFocused();
    expect(await isRememberedCanvas(page, canvas)).toBe(true);
    expect((await storedProjects(page)).length).toBe(1);

    await openProjectMenu(page);
    await page.getByRole("button", { name: "New scene", exact: true }).click();
    const dismissedDialog = page.getByRole("dialog", { name: "Create scene" });
    await expect(dismissedDialog).toBeVisible();
    await page.locator(".dialog-backdrop").click({ position: { x: 4, y: 4 } });
    await expect(dismissedDialog).toBeHidden();
    await expect(page.getByRole("button", { name: "Open project menu" })).toBeFocused();
    expect((await storedProjects(page)).length).toBe(1);

    await openProjectMenu(page);
    await page.getByRole("button", { name: "New scene", exact: true }).click();
    const nextCreateDialog = page.getByRole("dialog", { name: "Create scene" });
    await nextCreateDialog.getByLabel("Scene name").fill("  Assembly Review  ");
    await nextCreateDialog.getByRole("button", { name: "Create scene" }).click();
    await expect(nextCreateDialog).toBeHidden();
    await expect(page.locator(".project-copy strong")).toHaveText("Assembly Review");
    await expect(page.getByTestId("document-revision")).toHaveAttribute("data-revision", "0");
    await expect.poll(() => storedProjects(page).then((projects) => projects.length)).toBe(2);
    await expect
      .poll(async () => projectNames(await storedProjects(page)))
      .toContain("Assembly Review");

    await openProjectMenu(page);
    await page.getByRole("button", { name: "Rename scene", exact: true }).click();
    const renameDialog = page.getByRole("dialog", { name: "Rename scene" });
    await expect(renameDialog.getByLabel("Scene name")).toHaveValue("Assembly Review");
    await expect(renameDialog.getByLabel("Scene name")).toBeFocused();
    await renameDialog.getByLabel("Scene name").fill("Line A Commissioning");
    await renameDialog.getByRole("button", { name: "Rename scene" }).click();
    await expect(renameDialog).toBeHidden();
    await expect(page.locator(".project-copy strong")).toHaveText("Line A Commissioning");
    await expect(page.getByTestId("document-revision")).toHaveAttribute("data-revision", "1");
    await expectCurrentRecentName(page, "Line A Commissioning");

    await page.getByRole("button", { name: "Undo" }).click();
    await expect(page.locator(".project-copy strong")).toHaveText("Assembly Review");
    await expect(page.getByTestId("document-revision")).toHaveAttribute("data-revision", "2");
    await expectCurrentRecentName(page, "Assembly Review");
    await page.getByRole("button", { name: "Redo" }).click();
    await expect(page.locator(".project-copy strong")).toHaveText("Line A Commissioning");
    await expect(page.getByTestId("document-revision")).toHaveAttribute("data-revision", "3");
    await expectCurrentRecentName(page, "Line A Commissioning");

    await expect
      .poll(async () => {
        const project = (await storedProjects(page)).find(
          (candidate) => candidate.name === "Line A Commissioning",
        );
        return project === undefined
          ? null
          : {
              documentName: (JSON.parse(project.documentJson) as { name?: string }).name,
              recordName: project.name,
              revision: project.lastSavedRevision,
            };
      })
      .toEqual({
        documentName: "Line A Commissioning",
        recordName: "Line A Commissioning",
        revision: 3,
      });

    await openProjectMenu(page);
    await page.getByRole("button", { name: "Rename scene", exact: true }).click();
    const unchangedDialog = page.getByRole("dialog", { name: "Rename scene" });
    await unchangedDialog.getByRole("button", { name: "Rename scene" }).click();
    await expect(unchangedDialog).toBeHidden();
    await expect(page.getByTestId("document-revision")).toHaveAttribute("data-revision", "3");

    await page.getByRole("button", { name: "Run", exact: true }).click();
    await openProjectMenu(page);
    await expect(page.getByRole("button", { name: "Rename scene", exact: true })).toBeDisabled();
    await page.getByRole("button", { name: "Close project menu" }).click();
    await page.getByRole("button", { name: "Edit", exact: true }).click();

    await openProjectMenu(page);
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export JSON" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("Line-A-Commissioning.scene.json");
    const exportPath = test.info().outputPath("renamed.scene.json");
    await download.saveAs(exportPath);
    expect((JSON.parse(await readFile(exportPath, "utf8")) as { name?: string }).name).toBe(
      "Line A Commissioning",
    );

    await page.getByTestId("json-file-input").setInputFiles(exportPath);
    await expect(page.locator(".project-copy strong")).toHaveText("Line A Commissioning");
    await expect(page.getByTestId("document-revision")).toHaveAttribute("data-revision", "3");

    const archiveDownloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export", exact: true }).click();
    const archiveDownload = await archiveDownloadPromise;
    expect(archiveDownload.suggestedFilename()).toBe("Line-A-Commissioning.scene.zip");
    const archivePath = test.info().outputPath("renamed.scene.zip");
    await archiveDownload.saveAs(archivePath);
    await page.getByTestId("archive-file-input").setInputFiles(archivePath);
    await expect(page.locator(".project-copy strong")).toHaveText("Line A Commissioning");
    await expect(page.getByTestId("document-revision")).toHaveAttribute("data-revision", "3");

    await page.reload();
    const reloadedCanvas = await readyCanvas(page);
    await expect(page.locator(".project-copy strong")).toHaveText("Line A Commissioning");
    await expect(page.getByTestId("document-revision")).toHaveAttribute("data-revision", "3");
    expect(await canvasHasContent(page, reloadedCanvas)).toBe(true);

    const longName = `Commissioning-${"VeryLongContinuousSceneName".repeat(5)}`;
    await openProjectMenu(page);
    await page.getByRole("button", { name: "Rename scene", exact: true }).click();
    const longNameDialog = page.getByRole("dialog", { name: "Rename scene" });
    await longNameDialog.getByLabel("Scene name").fill(longName);
    await longNameDialog.getByRole("button", { name: "Rename scene" }).click();
    await page.setViewportSize({ width: 1280, height: 720 });
    const projectName = page.locator(".project-copy strong");
    await expect(projectName).toHaveText(longName);
    expect(await projectName.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(
      true,
    );
    await expect(page.getByRole("button", { name: "Open project menu" })).toHaveAttribute(
      "title",
      longName,
    );
    await expectNoPageOverflow(page);
    expect(runtimeErrors).toEqual([]);
  });

  test("Studio detects and persists theme without changing the Viewer or document", async ({
    page,
  }) => {
    const runtimeErrors = observeRuntimeErrors(page);
    await useEnglish(page, studioLocaleKey);
    await page.emulateMedia({ colorScheme: "dark" });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(studioUrl);
    const canvas = await readyCanvas(page);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    expect(await canvasHasContent(page, canvas)).toBe(true);
    await rememberCanvas(page, canvas);
    const revision = await page.getByTestId("document-revision").getAttribute("data-revision");
    const before = await activeStoredDocument(page);
    await expectNoPageOverflow(page);
    await page.screenshot({ path: artifact("studio-dark-1440x900.png"), fullPage: true });

    await page.getByRole("button", { name: "Switch to light theme" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    expect(await isRememberedCanvas(page, canvas)).toBe(true);
    await expect(page.getByTestId("document-revision")).toHaveAttribute(
      "data-revision",
      revision ?? "",
    );
    expect(await activeStoredDocument(page)).toEqual(before);
    expect(await page.evaluate((key) => localStorage.getItem(key), studioThemeKey)).toBe("light");

    await page.setViewportSize({ width: 1280, height: 720 });
    await expectNoPageOverflow(page);
    await page.screenshot({ path: artifact("studio-light-1280x720.png"), fullPage: true });
    await page.reload();
    await readyCanvas(page);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    expect(runtimeErrors).toEqual([]);
  });
});

async function useEnglish(page: Page, key: string): Promise<void> {
  await page.addInitScript((storageKey) => localStorage.setItem(storageKey, "en"), key);
}

async function openProjectMenu(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Open project menu" }).click();
  await expect(page.getByRole("region", { name: "Project menu" })).toBeVisible();
}

async function expectCurrentRecentName(page: Page, name: string): Promise<void> {
  await openProjectMenu(page);
  await expect(page.locator(".recent-project.is-current strong")).toHaveText(name);
  await page.getByRole("button", { name: "Close project menu" }).click();
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
    (window as typeof window & { __themeCanvas?: Element }).__themeCanvas = element;
  });
}

async function isRememberedCanvas(page: Page, canvas: Locator): Promise<boolean> {
  return canvas.evaluate(
    (element) => (window as typeof window & { __themeCanvas?: Element }).__themeCanvas === element,
  );
}

async function canvasHasContent(page: Page, canvas: Locator): Promise<boolean> {
  const encoded = (await canvas.screenshot()).toString("base64");
  return page.evaluate(async (base64) => {
    const response = await fetch(`data:image/png;base64,${base64}`);
    const bitmap = await createImageBitmap(await response.blob());
    const sample = document.createElement("canvas");
    sample.width = 48;
    sample.height = 48;
    const context = sample.getContext("2d", { willReadFrequently: true });
    if (context === null) return false;
    context.drawImage(bitmap, 0, 0, sample.width, sample.height);
    bitmap.close();
    const pixels = context.getImageData(0, 0, sample.width, sample.height).data;
    const colors = new Set<string>();
    let opaque = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      const alpha = pixels[index + 3] ?? 0;
      if (alpha > 250) opaque += 1;
      colors.add(
        `${(pixels[index] ?? 0) >> 4}:${(pixels[index + 1] ?? 0) >> 4}:${(pixels[index + 2] ?? 0) >> 4}`,
      );
    }
    return opaque / (pixels.length / 4) > 0.99 && colors.size > 8;
  }, encoded);
}

async function activeStoredDocument(page: Page): Promise<unknown> {
  const projects = await storedProjects(page);
  const active = projects.toSorted((left, right) =>
    right.lastOpenedAt.localeCompare(left.lastOpenedAt),
  )[0];
  return active === undefined ? null : JSON.parse(active.documentJson);
}

interface StoredProject {
  readonly name: string;
  readonly lastOpenedAt: string;
  readonly lastSavedRevision: number;
  readonly documentJson: string;
}

async function storedProjects(page: Page): Promise<readonly StoredProject[]> {
  return page.evaluate(async () => {
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
}

function projectNames(projects: readonly StoredProject[]): string[] {
  return projects.map((project) => project.name).sort();
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
