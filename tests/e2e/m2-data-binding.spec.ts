import { readFile } from "node:fs/promises";
import path from "node:path";

import { expect, test, type Locator, type Page } from "@playwright/test";
import { setInterfacePreferences } from "./settings-helpers";
import { importSceneArchive, type SceneDocument } from "../../packages/document/src/index.js";

const studioUrl = "/";
const fixturePath = path.resolve("tests/fixtures/m0-factory/public/m0-factory-cell.glb");
const artifact = (name: string) => `artifacts/e2e/${name}`;

test.describe("M2 Studio data binding", () => {
  test("authors, persists, runs, and clears one complete data workflow", async ({ page }) => {
    test.setTimeout(90_000);
    const runtimeErrors = observeRuntimeErrors(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(studioUrl);
    await readyCanvas(page);

    await page.getByTestId("model-file-input").setInputFiles(fixturePath);
    const importDialog = page.getByRole("dialog", { name: "Import model" });
    await expect(importDialog).toBeVisible();
    await importDialog.getByRole("button", { name: "Add to scene" }).click();
    const entityRow = page.getByRole("treeitem").filter({ hasText: "m0-factory-cell" }).first();
    await expect(entityRow).toBeVisible();
    await expect(entityRow).toHaveAttribute("aria-selected", "true");
    await expectRevision(page, 1);

    await page.getByRole("tab", { name: "Data" }).click();
    await page.getByLabel("Business ID").fill("CELL-001");
    await page.getByRole("button", { name: "Save mapping" }).click();
    await expectRevision(page, 2);

    await page.getByRole("button", { name: "Add Mock source" }).click();
    const sourceSection = page
      .getByRole("heading", { name: "Data source" })
      .locator("xpath=ancestor::section");
    await sourceSection.getByLabel("Name", { exact: true }).fill("Cell telemetry");
    await sourceSection.getByLabel("Stale ms").fill("1000");
    await sourceSection.getByLabel("Offline ms").fill("1500");
    await sourceSection.getByLabel("Speed").fill("1");
    await sourceSection.getByRole("button", { name: "Save source" }).click();
    await expectRevision(page, 3);

    await page.getByRole("button", { name: "New binding" }).click();
    await expect(page.getByLabel("Field")).toHaveValue("/telemetry/status");
    const ruleRows = page.locator("fieldset.binding-rule-row");
    await expect(ruleRows).toHaveCount(3);
    const criticalRule = ruleRows.nth(2);
    await expect(criticalRule.getByLabel("Equals")).toHaveValue("critical");
    await criticalRule.getByLabel("Alarm", { exact: true }).check();
    await criticalRule.getByLabel("Level").selectOption("critical");
    await criticalRule.getByLabel("Message").fill("Critical state");
    await page.getByRole("button", { name: "Save binding" }).click();
    await expectRevision(page, 4);
    await expect(page.getByText("Writes color, alarm", { exact: true })).toBeVisible();
    await expect(page.getByTestId("save-state")).toHaveText("Saved locally");

    await page.getByRole("button", { name: "Edit binding" }).click();
    await expectPopulatedRuleEditor(page, { saveLabel: "Save binding" });
    await expectInspectorContentFits(page);
    await expectNoPageOverflow(page);
    await page.screenshot({ path: artifact("m2-edit-1440x900.png"), fullPage: true });

    await page.setViewportSize({ width: 1280, height: 720 });
    await setInterfacePreferences(page, { locale: "zh-CN", theme: "dark" });
    await expectPopulatedRuleEditor(page, { saveLabel: "保存绑定" });
    await expectInspectorContentFits(page);
    await expectNoPageOverflow(page);
    await page.screenshot({ path: artifact("m2-edit-1280x720.png"), fullPage: true });
    await setInterfacePreferences(page, { locale: "en", theme: "light" });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByRole("button", { name: "Cancel", exact: true }).click();

    const canonicalPath = await exportJson(page, "m2-authored.scene.json");
    const canonical = JSON.parse(await readFile(canonicalPath, "utf8")) as SceneDocument;
    assertAuthoredDocument(canonical);

    const archiveDownloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export", exact: true }).click();
    const archiveDownload = await archiveDownloadPromise;
    const archivePath = test.info().outputPath("m2-authored.scene.zip");
    await archiveDownload.saveAs(archivePath);
    const archive = await importSceneArchive(new Uint8Array(await readFile(archivePath)));
    expect(archive.document).toEqual(canonical);
    assertAuthoredDocument(archive.document);

    await page.getByTestId("json-file-input").setInputFiles(canonicalPath);
    const jsonRoundTripPath = await exportJson(page, "m2-json-round-trip.scene.json");
    expect(JSON.parse(await readFile(jsonRoundTripPath, "utf8"))).toEqual(canonical);
    await page.getByTestId("archive-file-input").setInputFiles(archivePath);
    const zipRoundTripPath = await exportJson(page, "m2-zip-round-trip.scene.json");
    expect(JSON.parse(await readFile(zipRoundTripPath, "utf8"))).toEqual(canonical);

    await page.reload();
    const reloadedCanvas = await readyCanvas(page);
    await expectRevision(page, 4);
    await expect(page.getByTestId("save-state")).toHaveText("Saved locally");
    const reloadedRow = page.getByRole("treeitem").filter({ hasText: "m0-factory-cell" }).first();
    await reloadedRow.click();
    await page.getByRole("tab", { name: "Data" }).click();
    await expect(page.getByLabel("Business ID")).toHaveValue("CELL-001");
    await expect(sourceSection.getByLabel("Name", { exact: true })).toHaveValue("Cell telemetry");
    await expect(page.getByText("Writes color, alarm", { exact: true })).toBeVisible();

    const preRunCanonicalPath = await exportJson(page, "m2-before-run.scene.json");
    const preRunCanonical = JSON.parse(
      await readFile(preRunCanonicalPath, "utf8"),
    ) as SceneDocument;
    expect(preRunCanonical).toEqual(canonical);
    assertNoRuntimeStateLeakage(preRunCanonical);

    await instrumentMockRuntime(page);
    await rememberCanvas(page, reloadedCanvas);
    const baseline = await canvasMetrics(page, reloadedCanvas);
    await page.getByRole("button", { name: "Run", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Sources" })).toBeVisible();
    await expect(page.getByTestId("viewport-mode")).toContainText("RUN / SELECT");
    await expect(reloadedRow).toHaveAttribute("aria-selected", "true");
    await expect.poll(() => mockTimerState(page).then((state) => state.scheduled)).toBe(5);
    await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Redo" })).toBeDisabled();
    const runDocumentBeforeHistoryShortcuts = await activeStoredDocument(page);
    const runDiagnosticsBeforeHistoryShortcuts = await diagnosticsSnapshot(page);
    await page.keyboard.press("Control+z");
    await page.keyboard.press("Control+Shift+z");
    await page.keyboard.press("Meta+z");
    await page.keyboard.press("Meta+Shift+z");
    await expectRevision(page, 4);
    expect(await activeStoredDocument(page)).toEqual(runDocumentBeforeHistoryShortcuts);
    expect(await diagnosticsSnapshot(page)).toEqual(runDiagnosticsBeforeHistoryShortcuts);

    await expect(page.getByText("Critical state", { exact: true })).toBeVisible({ timeout: 5_000 });
    await expect(page.locator(".runtime-value")).toHaveText("critical");
    const latency = await expect
      .poll(() => criticalLatency(page), { timeout: 2_000 })
      .not.toBeNull()
      .then(() => criticalLatency(page));
    expect(latency).not.toBeNull();
    expect(latency ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(100);
    expect((await canvasMetrics(page, reloadedCanvas)).redRatio).toBeGreaterThan(0.005);
    await page.getByRole("button", { name: /Focus alarm target/u }).click();
    await expect(reloadedRow).toHaveAttribute("aria-selected", "true");
    await page.screenshot({ path: artifact("m2-run-critical-1440x900.png"), fullPage: true });

    const scheduledBeforePreferences = (await mockTimerState(page)).scheduled;
    await setInterfacePreferences(page, { locale: "zh-CN", theme: "dark" });
    await expect(page.getByRole("heading", { name: "数据源" })).toBeVisible();
    await setInterfacePreferences(page, { locale: "en" });
    await expect(page.getByRole("heading", { name: "Sources" })).toBeVisible();
    expect(await isRememberedCanvas(page, reloadedCanvas)).toBe(true);
    expect((await mockTimerState(page)).scheduled).toBe(scheduledBeforePreferences);
    await expectRevision(page, 4);

    await expect
      .poll(() => mockTimerState(page).then(hasOfflineRecovery), { timeout: 10_000 })
      .toBe(true);
    await expect(page.locator(".runtime-value")).toHaveText("ready");
    expect((await mockTimerState(page)).scheduled).toBe(5);
    expect((await mockTimerState(page)).active).toBe(0);

    const contextResult = await restoreWebGlContext(reloadedCanvas);
    expect(contextResult).toBe("restored");
    await expect(page.locator(".runtime-diagnostics")).toHaveText("RENDERER_CONTEXT_LOST");
    const restored = await canvasMetrics(page, reloadedCanvas);
    expect(restored.opaqueRatio).toBeGreaterThan(0.99);
    expect(restored.distinct).toBeGreaterThan(8);

    await page.setViewportSize({ width: 1280, height: 720 });
    await expectNoPageOverflow(page);
    await page.screenshot({ path: artifact("m2-run-1280x720.png"), fullPage: true });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(page.getByRole("tab", { name: "Data" })).toBeVisible();
    expect(await isRememberedCanvas(page, reloadedCanvas)).toBe(true);
    expect((await mockTimerState(page)).active).toBe(0);
    await expectRevision(page, 4);
    const cleared = await canvasMetrics(page, reloadedCanvas);
    expect(cleared.greenRatio).toBeLessThan(baseline.greenRatio + 0.01);
    expect(cleared.redRatio).toBeLessThan(0.005);

    const afterRunJsonPath = await exportJson(page, "m2-after-run.scene.json");
    const afterRunDocument = JSON.parse(await readFile(afterRunJsonPath, "utf8")) as SceneDocument;
    expect(afterRunDocument).toEqual(preRunCanonical);
    assertNoRuntimeStateLeakage(afterRunDocument);

    const afterRunArchivePath = await exportArchive(page, "m2-after-run.scene.zip");
    const afterRunArchive = await importSceneArchive(
      new Uint8Array(await readFile(afterRunArchivePath)),
    );
    expect(afterRunArchive.document).toEqual(preRunCanonical);
    assertNoRuntimeStateLeakage(afterRunArchive.document);

    await expect
      .poll(() => activeStoredProject(page).then((project) => project.lastSavedRevision))
      .toBe(preRunCanonical.revision);
    const storedProject = await activeStoredProject(page);
    expect(Object.keys(storedProject).sort()).toEqual([
      "createdAt",
      "documentJson",
      "id",
      "lastExportedRevision",
      "lastOpenedAt",
      "lastSavedRevision",
      "name",
      "updatedAt",
    ]);
    expect(storedProject.name).toBe(preRunCanonical.name);
    expect(storedProject.lastSavedRevision).toBe(preRunCanonical.revision);
    const storedDocument = JSON.parse(storedProject.documentJson) as SceneDocument;
    expect(storedDocument).toEqual(preRunCanonical);
    assertNoRuntimeStateLeakage(storedDocument, storedProject);

    await page.getByRole("button", { name: "Run", exact: true }).click();
    await expect.poll(() => mockTimerState(page).then((state) => state.scheduled)).toBe(10);
    expect((await mockTimerState(page)).maxActive).toBeLessThanOrEqual(5);
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    expect((await mockTimerState(page)).active).toBe(0);
    await expectNoPageOverflow(page);
    expect(runtimeErrors).toEqual([]);
  });

  test("remounts the Viewer when projects share a SceneDocument id", async ({ page }) => {
    const runtimeErrors = observeRuntimeErrors(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(studioUrl);
    const firstCanvas = await readyCanvas(page);
    await rememberCanvas(page, firstCanvas);
    const originalDocument = await activeStoredDocument(page);
    const alphaDocument = { ...originalDocument, name: "Shared Identity Alpha" };
    const betaDocument = { ...originalDocument, name: "Shared Identity Beta" };

    await importJsonDocument(page, alphaDocument, "shared-alpha.scene.json");
    const secondCanvas = await readyCanvas(page);
    expect(await isRememberedCanvas(page, secondCanvas)).toBe(false);
    await rememberCanvas(page, secondCanvas);

    await importJsonDocument(page, betaDocument, "shared-beta.scene.json");
    const thirdCanvas = await readyCanvas(page);
    expect(await isRememberedCanvas(page, thirdCanvas)).toBe(false);
    await rememberCanvas(page, thirdCanvas);

    await page.getByRole("button", { name: "Open project menu" }).click();
    await page.locator(".recent-project-open").filter({ hasText: "Shared Identity Alpha" }).click();
    const reopenedAlphaCanvas = await readyCanvas(page);
    expect(await isRememberedCanvas(page, reopenedAlphaCanvas)).toBe(false);
    await rememberCanvas(page, reopenedAlphaCanvas);

    await page.getByRole("button", { name: "Open project menu" }).click();
    await page.locator(".recent-project-open").filter({ hasText: "Shared Identity Beta" }).click();
    const reopenedBetaCanvas = await readyCanvas(page);
    expect(await isRememberedCanvas(page, reopenedBetaCanvas)).toBe(false);
    expect((await activeStoredDocument(page)).id).toBe(originalDocument.id);
    expect(runtimeErrors).toEqual([]);
  });

  test("reports and clears an unsupported legacy WebSocket source", async ({ page }) => {
    const runtimeErrors = observeRuntimeErrors(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(studioUrl);
    await readyCanvas(page);
    const base = await activeStoredDocument(page);
    const legacy: SceneDocument = {
      ...base,
      name: "Legacy WebSocket Source",
      dataSources: [
        {
          id: "legacy-websocket",
          name: "Legacy WebSocket",
          adapter: "websocket",
          staleAfterMs: 1_000,
          offlineAfterMs: 2_000,
          options: { channel: "telemetry/status", protocolVersion: "1" },
        },
      ],
    };
    await importJsonDocument(page, legacy, "legacy-websocket.scene.json");
    const before = await exportJsonDocument(page, "legacy-websocket-before.scene.json");
    const diagnosticsBefore = await diagnosticsSnapshot(page);

    await page.getByRole("button", { name: "Run", exact: true }).click();
    const sourceRow = page.locator(".runtime-row").filter({ hasText: "Legacy WebSocket" });
    await expect(sourceRow.getByText("Error", { exact: true })).toBeVisible();
    await expect(page.locator(".runtime-diagnostics")).toHaveText("DATASOURCE_CONNECTION_FAILED");
    await expectRevision(page, before.revision);

    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(page.getByRole("tab", { name: "Data" })).toBeVisible();
    await expect(page.getByText("Error", { exact: true })).toHaveCount(0);
    expect(await diagnosticsSnapshot(page)).toEqual(diagnosticsBefore);
    const after = await exportJsonDocument(page, "legacy-websocket-after.scene.json");
    expect(after).toEqual(before);
    await expectRevision(page, before.revision);
    expect(runtimeErrors).toEqual([]);
  });
});

function assertAuthoredDocument(document: SceneDocument): void {
  expect(document.targets).toHaveLength(1);
  expect(document.targets[0]?.businessId).toBe("CELL-001");
  expect(document.dataSources).toHaveLength(1);
  expect(document.dataSources[0]).toMatchObject({
    adapter: "mock",
    name: "Cell telemetry",
    staleAfterMs: 1_000,
    offlineAfterMs: 1_500,
    options: { scenario: "status-cycle", defaultSpeed: 1 },
  });
  expect(document.bindings).toHaveLength(1);
  expect(document.bindings[0]).toMatchObject({
    targetId: document.targets[0]?.id,
    sourceId: document.dataSources[0]?.id,
    pointer: "/telemetry/status",
    writes: ["color", "alarm"],
    enabled: true,
  });
  const ruleSet = document.ruleSets.find(
    (candidate) => candidate.id === document.bindings[0]?.ruleSetId,
  );
  expect(ruleSet?.rules).toHaveLength(3);
  expect(
    ruleSet?.rules.find((rule) => rule.when.operator === "eq" && rule.when.expected === "critical"),
  ).toMatchObject({
    effects: expect.arrayContaining([
      { type: "color", value: "#B93632" },
      { type: "alarm", level: "critical", message: "Critical state" },
    ]),
  });
}

async function exportJson(page: Page, fileName: string): Promise<string> {
  await page.getByRole("button", { name: "Open project menu" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  const download = await downloadPromise;
  const outputPath = test.info().outputPath(fileName);
  await download.saveAs(outputPath);
  return outputPath;
}

async function exportJsonDocument(page: Page, fileName: string): Promise<SceneDocument> {
  const outputPath = await exportJson(page, fileName);
  return JSON.parse(await readFile(outputPath, "utf8")) as SceneDocument;
}

async function importJsonDocument(
  page: Page,
  document: SceneDocument,
  fileName: string,
): Promise<void> {
  await page.getByTestId("json-file-input").setInputFiles({
    name: fileName,
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(document)),
  });
  await expect(page.locator(".project-copy strong")).toHaveText(document.name);
  await readyCanvas(page);
}

async function exportArchive(page: Page, fileName: string): Promise<string> {
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = await downloadPromise;
  const outputPath = test.info().outputPath(fileName);
  await download.saveAs(outputPath);
  return outputPath;
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
  const projects = await storedProjects(page);
  const active = projects.toSorted((left, right) =>
    right.lastOpenedAt.localeCompare(left.lastOpenedAt),
  )[0];
  if (active === undefined) throw new Error("Active IndexedDB project was not found.");
  return active;
}

async function activeStoredDocument(page: Page): Promise<SceneDocument> {
  return JSON.parse((await activeStoredProject(page)).documentJson) as SceneDocument;
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

function assertNoRuntimeStateLeakage(document: SceneDocument, project?: StoredProject): void {
  const owners: Array<readonly [string, Record<string, unknown>]> = [
    ["document", asRecord(document)],
    ...document.entities.map((entity) => [`entity:${entity.id}`, asRecord(entity)] as const),
    ...document.entities.map(
      (entity) => [`entity-metadata:${entity.id}`, asRecord(entity.metadata)] as const,
    ),
    ...document.targets.map((target) => [`target:${target.id}`, asRecord(target)] as const),
    ...document.dataSources.map((source) => [`source:${source.id}`, asRecord(source)] as const),
    ...document.dataSources.map(
      (source) => [`source-options:${source.id}`, asRecord(source.options)] as const,
    ),
    ...document.bindings.map((binding) => [`binding:${binding.id}`, asRecord(binding)] as const),
    ...document.ruleSets.map((ruleSet) => [`rule-set:${ruleSet.id}`, asRecord(ruleSet)] as const),
    ...document.ruleSets.flatMap((ruleSet) =>
      ruleSet.rules.flatMap((rule) => [
        [`rule:${rule.id}`, asRecord(rule)] as const,
        [`rule-condition:${rule.id}`, asRecord(rule.when)] as const,
      ]),
    ),
    ...(project === undefined
      ? []
      : ([["project-record", asRecord(project)]] as Array<
          readonly [string, Record<string, unknown>]
        >)),
  ];
  const runtimeFields = [
    "connection",
    "connections",
    "currentValue",
    "currentValues",
    "value",
    "values",
    "quality",
    "alarm",
    "alarms",
    "diagnostic",
    "diagnostics",
    "preview",
    "runtime",
    "runtimeState",
  ] as const;

  for (const [owner, value] of owners) {
    for (const field of runtimeFields) {
      expect(Object.hasOwn(value, field), `${owner} leaked runtime field ${field}`).toBe(false);
    }
  }
}

function asRecord(value: object): Record<string, unknown> {
  return value as unknown as Record<string, unknown>;
}

async function diagnosticsSnapshot(page: Page): Promise<{
  readonly count: string;
  readonly text: string;
}> {
  const diagnostics = page.locator(".studio-diagnostics");
  if ((await diagnostics.count()) === 0) return { count: "0", text: "" };
  return {
    count: (await page.locator(".diagnostics-title span").textContent()) ?? "",
    text: (await page.locator(".diagnostics-stream").textContent()) ?? "",
  };
}

async function expectPopulatedRuleEditor(
  page: Page,
  options: { readonly saveLabel: string },
): Promise<void> {
  const editor = page.locator(".binding-editor");
  const section = editor.locator("xpath=ancestor::section");
  await expect(editor).toBeVisible();
  await expect(editor.locator("fieldset.binding-rule-row")).toHaveCount(3);
  await expect(section.getByRole("button", { name: options.saveLabel })).toBeVisible();
}

async function expectInspectorContentFits(page: Page): Promise<void> {
  const inspector = page.locator(".studio-inspector");
  const editor = inspector.locator(".binding-editor");
  const scrollContainer = editor.locator('xpath=ancestor::*[@role="tabpanel"]');
  const section = editor.locator("xpath=ancestor::section");
  const save = section.getByRole("button", { name: /Save binding|保存绑定/u });
  const rows = editor.locator("fieldset.binding-rule-row");
  for (const container of [inspector, scrollContainer]) {
    const horizontal = await container.evaluate(
      (element) => element.scrollWidth - element.clientWidth,
    );
    expect(horizontal).toBeLessThanOrEqual(1);
  }

  const boxes = await Promise.all([
    ...Array.from({ length: await rows.count() }, (_, index) => rows.nth(index).boundingBox()),
    save.boundingBox(),
  ]);
  boxes.forEach((box) => expect(box).not.toBeNull());
  for (let index = 1; index < boxes.length; index += 1) {
    const previous = boxes[index - 1];
    const current = boxes[index];
    if (previous === undefined || current === undefined || previous === null || current === null) {
      continue;
    }
    expect(current.y).toBeGreaterThanOrEqual(previous.y + previous.height - 1);
  }

  for (const control of [rows.nth(0), rows.nth(1), rows.nth(2), save]) {
    await control.scrollIntoViewIfNeeded();
    await expect(control).toBeInViewport();
    const controlBox = await control.boundingBox();
    const containerBox = await scrollContainer.boundingBox();
    expect(controlBox).not.toBeNull();
    expect(containerBox).not.toBeNull();
    if (controlBox === null || containerBox === null) continue;
    expect(controlBox.x).toBeGreaterThanOrEqual(containerBox.x - 1);
    expect(controlBox.x + controlBox.width).toBeLessThanOrEqual(
      containerBox.x + containerBox.width + 1,
    );
    expect(controlBox.y).toBeGreaterThanOrEqual(containerBox.y - 1);
    expect(controlBox.y + controlBox.height).toBeLessThanOrEqual(
      containerBox.y + containerBox.height + 1,
    );
  }
}

async function expectRevision(page: Page, revision: number): Promise<void> {
  await expect(page.getByTestId("document-revision")).toHaveAttribute(
    "data-revision",
    String(revision),
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
    (window as typeof window & { __m2Canvas?: Element }).__m2Canvas = element;
  });
}

async function isRememberedCanvas(page: Page, canvas: Locator): Promise<boolean> {
  return canvas.evaluate(
    (element) => (window as typeof window & { __m2Canvas?: Element }).__m2Canvas === element,
  );
}

interface MockRuntimeState {
  readonly active: number;
  readonly maxActive: number;
  readonly scheduled: number;
  readonly criticalLatency: number | null;
  readonly connectionTransitions: readonly string[];
}

async function instrumentMockRuntime(page: Page): Promise<void> {
  await page.evaluate(() => {
    const trackedDelays = new Set([80, 900, 1_800, 2_700, 8_200]);
    const active = new Set<number>();
    let scheduled = 0;
    let maxActive = 0;
    let lastScenarioFireAt: number | null = null;
    let criticalLatency: number | null = null;
    const connectionTransitions: string[] = [];
    const originalSetTimeout = window.setTimeout.bind(window);
    const originalClearTimeout = window.clearTimeout.bind(window);
    window.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
      if (!trackedDelays.has(Number(timeout)) || typeof handler !== "function") {
        return originalSetTimeout(handler, timeout, ...args);
      }
      scheduled += 1;
      let timer = 0;
      timer = originalSetTimeout(() => {
        active.delete(timer);
        lastScenarioFireAt = performance.now();
        handler(...args);
      }, timeout);
      active.add(timer);
      maxActive = Math.max(maxActive, active.size);
      return timer;
    }) as typeof window.setTimeout;
    window.clearTimeout = ((timer?: number) => {
      if (timer !== undefined) active.delete(timer);
      originalClearTimeout(timer);
    }) as typeof window.clearTimeout;

    const recordConnectionTransition = () => {
      const status = [...(document.querySelector(".runtime-status")?.classList ?? [])]
        .find((className) => className.startsWith("status-"))
        ?.slice("status-".length);
      if (status === undefined || connectionTransitions.at(-1) === status) return;
      connectionTransitions.push(status);
    };
    const observer = new MutationObserver(() => {
      recordConnectionTransition();
      if (criticalLatency !== null || lastScenarioFireAt === null) return;
      const hasCritical = [...document.querySelectorAll(".runtime-value")].some(
        (element) => element.textContent?.trim() === "critical",
      );
      if (!hasCritical) return;
      requestAnimationFrame(() => {
        if (lastScenarioFireAt !== null) criticalLatency = performance.now() - lastScenarioFireAt;
      });
    });
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["class"],
      childList: true,
      characterData: true,
      subtree: true,
    });
    recordConnectionTransition();
    (window as typeof window & { __m2MockState?: () => MockRuntimeState }).__m2MockState = () => ({
      active: active.size,
      maxActive,
      scheduled,
      criticalLatency,
      connectionTransitions: [...connectionTransitions],
    });
  });
}

async function mockTimerState(page: Page): Promise<MockRuntimeState> {
  return page.evaluate(() =>
    (window as typeof window & { __m2MockState: () => MockRuntimeState }).__m2MockState(),
  );
}

async function criticalLatency(page: Page): Promise<number | null> {
  return (await mockTimerState(page)).criticalLatency;
}

function hasOfflineRecovery(state: MockRuntimeState): boolean {
  const offlineIndex = state.connectionTransitions.indexOf("offline");
  return (
    offlineIndex >= 0 && state.connectionTransitions.slice(offlineIndex + 1).includes("online")
  );
}

async function restoreWebGlContext(canvas: Locator): Promise<string> {
  return canvas.evaluate(async (element) => {
    const value = element as HTMLCanvasElement;
    const context = value.getContext("webgl2");
    const extension = context?.getExtension("WEBGL_lose_context");
    if (extension === null || extension === undefined) return "unsupported";
    const waitFor = (event: "webglcontextlost" | "webglcontextrestored", timeoutMs: number) =>
      Promise.race([
        new Promise<true>((resolve) =>
          value.addEventListener(event, () => resolve(true), { once: true }),
        ),
        new Promise<false>((resolve) => setTimeout(() => resolve(false), timeoutMs)),
      ]);
    const lost = waitFor("webglcontextlost", 2_000);
    extension.loseContext();
    if (!(await lost)) return "loss-timeout";
    await new Promise((resolve) => setTimeout(resolve, 250));
    const restored = waitFor("webglcontextrestored", 5_000);
    extension.restoreContext();
    if (!(await restored)) return "restore-timeout";
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    return "restored";
  });
}

async function canvasMetrics(page: Page, canvas: Locator) {
  const encoded = (await canvas.screenshot()).toString("base64");
  return page.evaluate(async (base64) => {
    const response = await fetch(`data:image/png;base64,${base64}`);
    const bitmap = await createImageBitmap(await response.blob());
    const sample = document.createElement("canvas");
    sample.width = 72;
    sample.height = 72;
    const context = sample.getContext("2d", { willReadFrequently: true });
    if (context === null) return { distinct: 0, greenRatio: 0, opaqueRatio: 0, redRatio: 0 };
    context.drawImage(bitmap, 0, 0, sample.width, sample.height);
    bitmap.close();
    const pixels = context.getImageData(0, 0, sample.width, sample.height).data;
    const colors = new Set<string>();
    let green = 0;
    let opaque = 0;
    let red = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      const r = pixels[index] ?? 0;
      const g = pixels[index + 1] ?? 0;
      const b = pixels[index + 2] ?? 0;
      const a = pixels[index + 3] ?? 0;
      if (a > 250) opaque += 1;
      if (g > 55 && g > r + 10 && g > b + 5) green += 1;
      if (r > 70 && r > g + 15 && r > b + 15) red += 1;
      colors.add(`${r >> 4}:${g >> 4}:${b >> 4}:${a >> 4}`);
    }
    const count = pixels.length / 4;
    return {
      distinct: colors.size,
      greenRatio: green / count,
      opaqueRatio: opaque / count,
      redRatio: red / count,
    };
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
