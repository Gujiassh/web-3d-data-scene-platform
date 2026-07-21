import { expect, test, type Page } from "@playwright/test";

import { assertNoRuntimeErrors, observeRuntimeErrors, readyCanvas } from "./hotspot-test-helpers";

test.describe("starter bootstrap browser lifecycle", () => {
  test("fails atomically and recovers once through Retry under StrictMode", async ({ page }) => {
    observeRuntimeErrors(page);
    let descriptorAvailable = false;
    await page.route("**/test-starter/descriptor.json", async (route) => {
      if (descriptorAvailable) {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ schemaVersion: "unavailable" }),
      });
    });

    await page.goto("/");
    const failure = page.getByTestId("starter-bootstrap-error");
    await expect(failure).toContainText("starter project could not be opened (descriptor-fields)");
    await expect(page.locator('canvas[data-web3d-viewer="true"]')).toHaveCount(0);
    expect(await repositoryShape(page)).toEqual({ projects: 0, assets: 0, recent: [] });

    descriptorAvailable = true;
    await failure.getByRole("button", { name: "Retry" }).click();
    await readyCanvas(page);
    await expect(page.locator(".project-copy strong")).toHaveText("Untitled Scene");
    await expect(page.locator(".studio-diagnostics")).toHaveCount(0);
    expect(await repositoryShape(page)).toEqual({
      projects: 1,
      assets: 0,
      recent: ["untitled-project"],
    });
    assertNoRuntimeErrors(page);
  });

  test("bootstraps one fresh project after the repository is cleared and reloaded", async ({
    page,
  }) => {
    observeRuntimeErrors(page);
    await page.goto("/");
    await readyCanvas(page);
    expect(await repositoryShape(page)).toEqual({
      projects: 1,
      assets: 0,
      recent: ["untitled-project"],
    });

    await clearRepository(page);
    await page.reload();
    await readyCanvas(page);
    await expect(page.locator(".project-copy strong")).toHaveText("Untitled Scene");
    expect(await repositoryShape(page)).toEqual({
      projects: 1,
      assets: 0,
      recent: ["untitled-project"],
    });
    assertNoRuntimeErrors(page);
  });
});

async function repositoryShape(page: Page): Promise<{
  readonly projects: number;
  readonly assets: number;
  readonly recent: readonly string[];
}> {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("web3d-studio", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Studio database open failed."));
    });
    const result = <T>(request: IDBRequest<T>) =>
      new Promise<T>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
      });
    const done = (transaction: IDBTransaction) =>
      new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onabort = () =>
          reject(transaction.error ?? new Error("IndexedDB transaction aborted."));
        transaction.onerror = () =>
          reject(transaction.error ?? new Error("IndexedDB transaction failed."));
      });
    try {
      const transaction = database.transaction(["projects", "assets", "settings"], "readonly");
      const projectCount = transaction.objectStore("projects").count();
      const assetCount = transaction.objectStore("assets").count();
      const recent = transaction.objectStore("settings").get("recent-project-ids");
      const [projects, assets, recentSetting] = await Promise.all([
        result(projectCount),
        result(assetCount),
        result<{ readonly value?: readonly string[] } | undefined>(recent),
      ]);
      await done(transaction);
      return { projects, assets, recent: recentSetting?.value ?? [] };
    } finally {
      database.close();
    }
  });
}

async function clearRepository(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("web3d-studio", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Studio database open failed."));
    });
    try {
      const transaction = database.transaction(["projects", "assets", "settings"], "readwrite");
      transaction.objectStore("projects").clear();
      transaction.objectStore("assets").clear();
      transaction.objectStore("settings").clear();
      await new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onabort = () =>
          reject(transaction.error ?? new Error("IndexedDB transaction aborted."));
        transaction.onerror = () =>
          reject(transaction.error ?? new Error("IndexedDB transaction failed."));
      });
    } finally {
      database.close();
    }
  });
}
