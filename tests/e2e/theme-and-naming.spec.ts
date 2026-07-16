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

  test("follows theme and persists a custom scene background without replacing the Viewer", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const runtimeErrors = observeRuntimeErrors(page);
    await useEnglish(page, studioLocaleKey);
    await page.emulateMedia({ colorScheme: "dark" });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(studioUrl);
    const canvas = await readyCanvas(page);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    expect(await canvasHasContent(page, canvas)).toBe(true);
    await expectCanvasBackground(page, canvas, [17, 23, 21]);
    await rememberCanvas(page, canvas);
    const revision = await page.getByTestId("document-revision").getAttribute("data-revision");
    const before = await activeStoredDocument(page);
    expect(before).toMatchObject({
      schemaVersion: "1.1.0",
      environment: { backgroundMode: "theme", background: "#F4F6F5" },
    });
    await expectNoPageOverflow(page);
    await page.screenshot({ path: artifact("studio-dark-1440x900.png"), fullPage: true });

    await page.getByRole("button", { name: "Switch to light theme" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    expect(await isRememberedCanvas(page, canvas)).toBe(true);
    await expect(page.getByTestId("document-revision")).toHaveAttribute(
      "data-revision",
      revision ?? "",
    );
    await expectCanvasBackground(page, canvas, [244, 246, 245]);
    expect(await activeStoredDocument(page)).toEqual(before);
    expect(await page.evaluate((key) => localStorage.getItem(key), studioThemeKey)).toBe("light");

    await openProjectMenu(page);
    await page.getByRole("button", { name: "Scene settings", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Scene settings" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("radio", { name: "Follow interface theme" })).toBeChecked();
    await expect(page.locator(".studio-toolbar")).toHaveAttribute("inert", "");
    await page.screenshot({
      path: artifact("studio-scene-settings-light-1440x900.png"),
      fullPage: true,
    });

    await dialog.getByText("Custom color", { exact: true }).click();
    const colorInput = dialog.getByLabel("Background color", { exact: true });
    await colorInput.fill("#123");
    await expect(colorInput).toHaveAttribute("aria-invalid", "true");
    await expect(dialog.getByRole("button", { name: "Apply", exact: true })).toBeDisabled();
    await colorInput.fill("#336699");
    await expect(colorInput).toHaveAttribute("aria-invalid", "false");
    await expectCanvasBackground(page, canvas, [51, 102, 153]);
    await expect(page.getByTestId("document-revision")).toHaveAttribute(
      "data-revision",
      revision ?? "",
    );
    expect(await activeStoredDocument(page)).toEqual(before);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expectCanvasBackground(page, canvas, [244, 246, 245]);
    await expect(page.getByRole("button", { name: "Open project menu" })).toBeFocused();

    await openProjectMenu(page);
    await page.getByRole("button", { name: "Scene settings", exact: true }).click();
    const applyDialog = page.getByRole("dialog", { name: "Scene settings" });
    await applyDialog.getByText("Custom color", { exact: true }).click();
    await applyDialog.getByLabel("Background color", { exact: true }).fill("#336699");
    await applyDialog.getByRole("button", { name: "Apply", exact: true }).click();
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(applyDialog).toBeHidden();
    await expect(page.getByTestId("document-revision")).toHaveAttribute("data-revision", "2");
    await expectCanvasBackground(page, canvas, [244, 246, 245]);
    await page.getByRole("button", { name: "Redo" }).click();
    await expect(page.getByTestId("document-revision")).toHaveAttribute("data-revision", "3");
    await expectCanvasBackground(page, canvas, [51, 102, 153]);
    await expect
      .poll(() => activeStoredDocument(page))
      .toMatchObject({
        schemaVersion: "1.1.0",
        revision: 3,
        environment: { backgroundMode: "custom", background: "#336699" },
      });

    await page.getByRole("button", { name: "Switch to dark theme" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expectCanvasBackground(page, canvas, [51, 102, 153]);
    expect(await isRememberedCanvas(page, canvas)).toBe(true);

    await openProjectMenu(page);
    await page.getByRole("button", { name: "Scene settings", exact: true }).click();
    const followPreviewDialog = page.getByRole("dialog", { name: "Scene settings" });
    await followPreviewDialog.getByText("Follow interface theme", { exact: true }).click();
    await expectCanvasBackground(page, canvas, [17, 23, 21]);
    await followPreviewDialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expectCanvasBackground(page, canvas, [51, 102, 153]);

    await page.setViewportSize({ width: 1280, height: 720 });
    await page.getByRole("button", { name: "Chinese" }).click();
    await page.locator(".project-menu-trigger").click();
    await page.locator(".project-menu-commands button").filter({ hasText: "场景设置" }).click();
    await expect(page.locator(".scene-settings-dialog")).toBeVisible();
    await expectNoPageOverflow(page);
    await page.screenshot({
      path: artifact("studio-scene-settings-dark-zh-1280x720.png"),
      fullPage: true,
    });
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "英文" }).click();

    await page.reload();
    const reloadedCanvas = await readyCanvas(page);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expectCanvasBackground(page, reloadedCanvas, [51, 102, 153]);
    await expect
      .poll(() => activeStoredDocument(page))
      .toMatchObject({
        schemaVersion: "1.1.0",
        environment: { backgroundMode: "custom", background: "#336699" },
      });

    await openProjectMenu(page);
    const jsonDownloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export JSON", exact: true }).click();
    const jsonDownload = await jsonDownloadPromise;
    const jsonPath = test.info().outputPath("scene-background.scene.json");
    await jsonDownload.saveAs(jsonPath);
    expect(JSON.parse(await readFile(jsonPath, "utf8"))).toMatchObject({
      schemaVersion: "1.1.0",
      environment: { backgroundMode: "custom", background: "#336699" },
    });
    await rememberCanvas(page, reloadedCanvas);
    await page.getByTestId("json-file-input").setInputFiles(jsonPath);
    const jsonCanvas = await replacedCanvas(page);
    await expectCanvasBackground(page, jsonCanvas, [51, 102, 153]);

    const archiveDownloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export", exact: true }).click();
    const archiveDownload = await archiveDownloadPromise;
    const archivePath = test.info().outputPath("scene-background.scene.zip");
    await archiveDownload.saveAs(archivePath);
    await rememberCanvas(page, jsonCanvas);
    await page.getByTestId("archive-file-input").setInputFiles(archivePath);
    const archiveCanvas = await replacedCanvas(page);
    await expectCanvasBackground(page, archiveCanvas, [51, 102, 153]);
    await expect
      .poll(() => activeStoredDocument(page))
      .toMatchObject({
        schemaVersion: "1.1.0",
        environment: { backgroundMode: "custom", background: "#336699" },
      });
    expect(runtimeErrors).toEqual([]);
  });

  test("rewrites every stored 1.0.0 project to persisted 1.1.0 data", async ({ page }) => {
    await useEnglish(page, studioLocaleKey);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(studioUrl);
    await readyCanvas(page);

    const legacyRecords = await seedLegacyProjects(page);
    await page.reload();
    await readyCanvas(page);

    const migrated = (await storedProjects(page))
      .filter((record) => legacyRecords.some((legacy) => legacy.id === record.id))
      .sort((left, right) => left.id.localeCompare(right.id));
    expect(migrated).toHaveLength(2);
    for (const record of migrated) {
      const legacy = legacyRecords.find((candidate) => candidate.id === record.id);
      expect(legacy).toBeDefined();
      expect(Object.keys(record).sort()).toEqual([
        "createdAt",
        "documentJson",
        "id",
        "lastExportedRevision",
        "lastOpenedAt",
        "lastSavedRevision",
        "name",
        "updatedAt",
      ]);
      expect(withoutDocumentJson(record)).toEqual(withoutDocumentJson(legacy!));
      const before = JSON.parse(legacy!.documentJson) as LegacySceneDocument;
      const after = JSON.parse(record.documentJson) as CurrentSceneDocument;
      expect(after.schemaVersion).toBe("1.1.0");
      expect(after.revision).toBe(before.revision);
      expect(after.environment).toEqual({
        ...before.environment,
        backgroundMode: "custom",
      });
    }
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

async function replacedCanvas(page: Page): Promise<Locator> {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as typeof window & { __themeCanvas?: Element }).__themeCanvas?.isConnected ===
          false,
      ),
    )
    .toBe(true);
  return readyCanvas(page);
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

async function expectCanvasBackground(
  page: Page,
  canvas: Locator,
  expected: readonly [number, number, number],
): Promise<void> {
  await expect
    .poll(async () => {
      const actual = await canvasCornerRgb(page, canvas);
      return Math.max(...actual.map((value, index) => Math.abs(value - expected[index]!)));
    })
    .toBeLessThanOrEqual(3);
}

async function canvasCornerRgb(
  page: Page,
  canvas: Locator,
): Promise<readonly [number, number, number]> {
  const encoded = (await canvas.screenshot()).toString("base64");
  return page.evaluate(async (base64) => {
    const response = await fetch(`data:image/png;base64,${base64}`);
    const bitmap = await createImageBitmap(await response.blob());
    const sample = document.createElement("canvas");
    sample.width = bitmap.width;
    sample.height = bitmap.height;
    const context = sample.getContext("2d", { willReadFrequently: true });
    if (context === null) throw new Error("Canvas sampling context is unavailable.");
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    const points = [
      [4, 4],
      [12, 4],
      [sample.width - 5, 4],
      [sample.width - 13, 4],
    ] as const;
    let red = 0;
    let green = 0;
    let blue = 0;
    for (const [x, y] of points) {
      const pixel = context.getImageData(x, y, 1, 1).data;
      red += pixel[0] ?? 0;
      green += pixel[1] ?? 0;
      blue += pixel[2] ?? 0;
    }
    const composited = [red, green, blue].map((value) => value / points.length);
    const backdrop = document.querySelector<HTMLElement>(".dialog-backdrop");
    const backdropColor = backdrop === null ? null : getComputedStyle(backdrop).backgroundColor;
    const match = backdropColor?.match(
      /^rgba?\(\s*([\d.]+)[, ]+\s*([\d.]+)[, ]+\s*([\d.]+)(?:\s*[/,]\s*([\d.]+))?\s*\)$/u,
    );
    const alpha = Number(match?.[4] ?? 0);
    if (
      match === undefined ||
      match === null ||
      !Number.isFinite(alpha) ||
      alpha <= 0 ||
      alpha >= 1
    ) {
      return composited.map(Math.round) as [number, number, number];
    }
    const overlay = [Number(match[1]), Number(match[2]), Number(match[3])];
    return composited.map((value, index) =>
      Math.round((value - (overlay[index] ?? 0) * alpha) / (1 - alpha)),
    ) as [number, number, number];
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
  readonly id: string;
  readonly name: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly lastOpenedAt: string;
  readonly lastSavedRevision: number;
  readonly lastExportedRevision: number | null;
  readonly documentJson: string;
}

interface LegacySceneDocument {
  readonly schemaVersion: "1.0.0";
  readonly revision: number;
  readonly environment: {
    readonly background: string;
    readonly grid: boolean;
    readonly unit: "m";
    readonly upAxis: "Y";
  };
}

interface CurrentSceneDocument {
  readonly schemaVersion: "1.1.0";
  readonly revision: number;
  readonly environment: LegacySceneDocument["environment"] & {
    readonly backgroundMode: "theme" | "custom";
  };
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

async function seedLegacyProjects(page: Page): Promise<readonly StoredProject[]> {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("web3d-studio", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Failed to seed IndexedDB."));
    });
    const records = [
      legacyProject("legacy-project-a", "Legacy Light", "#F4F6F5", 4, "2026-07-01T00:00:00.000Z"),
      legacyProject("legacy-project-b", "Legacy Dark", "#151B19", 9, "2026-07-02T00:00:00.000Z"),
    ];
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(["projects", "settings"], "readwrite");
        const projectStore = transaction.objectStore("projects");
        const settingsStore = transaction.objectStore("settings");
        for (const record of records) projectStore.put(record);
        const recentRequest = settingsStore.get("recent-project-ids");
        recentRequest.onsuccess = () => {
          const current = (recentRequest.result as { value?: readonly string[] } | undefined)
            ?.value;
          settingsStore.put({
            key: "recent-project-ids",
            value: [
              ...(current ?? []).filter((id) => records.every((record) => record.id !== id)),
              ...records.map((record) => record.id),
            ],
          });
        };
        transaction.oncomplete = () => resolve();
        transaction.onerror = () =>
          reject(transaction.error ?? new Error("Failed to seed legacy projects."));
        transaction.onabort = () =>
          reject(transaction.error ?? new Error("Legacy project seed aborted."));
      });
      return records;
    } finally {
      database.close();
    }

    function legacyProject(
      id: string,
      name: string,
      background: string,
      revision: number,
      timestamp: string,
    ): StoredProject {
      return {
        id,
        name,
        createdAt: timestamp,
        updatedAt: timestamp,
        lastOpenedAt: timestamp,
        lastSavedRevision: revision,
        lastExportedRevision: null,
        documentJson: JSON.stringify({
          schemaVersion: "1.0.0",
          id,
          name,
          revision,
          assets: [],
          entities: [],
          targets: [],
          dataSources: [],
          bindings: [],
          ruleSets: [],
          annotations: [],
          views: [],
          environment: { background, grid: true, unit: "m", upAxis: "Y" },
        }),
      };
    }
  });
}

function withoutDocumentJson(record: StoredProject): Omit<StoredProject, "documentJson"> {
  return {
    id: record.id,
    name: record.name,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    lastOpenedAt: record.lastOpenedAt,
    lastSavedRevision: record.lastSavedRevision,
    lastExportedRevision: record.lastExportedRevision,
  };
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
