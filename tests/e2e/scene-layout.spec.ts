import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  exportSceneArchive,
  importSceneArchive,
  type SceneDocument,
  type SceneEntity,
  type Transform,
} from "../../packages/document/src/index.js";

const studioUrl = "/";
const fixtureDirectory = path.resolve("tests/fixtures/006-layout");
const scenePath = path.join(fixtureDirectory, "layout.scene.json");
const oraclePath = path.join(fixtureDirectory, "layout-oracles.json");
const assetPath = path.resolve("tests/fixtures/m0-factory/public/m0-factory-cell.glb");
const artifact = (name: string) => `artifacts/e2e/${name}`;
const archiveCreatedAt = "2026-07-16T00:00:00.000Z";
const expectedAssetBytes = 1_216;
const expectedAssetSha256 = "e123f3d64ec60f136d8673478eb2fd2ce28f56bcb5fb94cef5a7377b9605efe8";
const expectedProjectRecordKeys = [
  "createdAt",
  "documentJson",
  "id",
  "lastExportedRevision",
  "lastOpenedAt",
  "lastSavedRevision",
  "name",
  "updatedAt",
] as const;

test.describe("Feature 006 scene layout", () => {
  test("imports the fixed archive and preserves its canonical P0 payload", async ({ page }) => {
    test.setTimeout(60_000);
    const runtimeErrors = observeRuntimeErrors(page);
    const fixture = await loadLayoutFixture();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(studioUrl);

    const canvas = await importLayoutArchive(page, fixture);
    await expectRevision(page, fixture.canonical.revision);
    await expect(page.getByTestId("save-state")).toHaveText("Saved locally");
    await expect(page.getByRole("treeitem")).toHaveCount(5);
    assertInitialOracle(fixture.canonical, fixture.oracles);

    const metrics = await canvasMetrics(page, canvas);
    expect(metrics.opaqueRatio).toBeGreaterThan(0.99);
    expect(metrics.distinct).toBeGreaterThan(8);
    expect(metrics.authoredRatio).toBeGreaterThan(0.005);
    await expectNoPageOverflow(page);

    const jsonPath = await exportJson(page, "006-imported.scene.json");
    const jsonDocument = JSON.parse(await readFile(jsonPath, "utf8")) as SceneDocument;
    expect(jsonDocument).toEqual(fixture.canonical);

    const zipPath = await exportArchive(page, "006-imported.scene.zip");
    const zipImport = await importSceneArchive(new Uint8Array(await readFile(zipPath)));
    expect(zipImport.document).toEqual(fixture.canonical);
    expect(zipImport.assets).toHaveLength(1);
    expect(zipImport.assets[0]?.bytes.byteLength).toBe(expectedAssetBytes);
    expect(
      createHash("sha256")
        .update(zipImport.assets[0]?.bytes ?? new Uint8Array())
        .digest("hex"),
    ).toBe(expectedAssetSha256);

    await expect
      .poll(() => activeStoredProject(page).then((project) => project.lastSavedRevision))
      .toBe(fixture.canonical.revision);
    const storedProject = await activeStoredProject(page);
    assertProjectRecordShape(storedProject);
    expect(storedProject.name).toBe(fixture.canonical.name);
    expect(storedProject.lastSavedRevision).toBe(fixture.canonical.revision);
    const storedDocument = JSON.parse(storedProject.documentJson) as SceneDocument;
    expect(storedDocument).toEqual(fixture.canonical);

    assertNoTransientStateLeakage(jsonDocument, storedProject);
    assertNoTransientStateLeakage(zipImport.document);
    assertNoTransientStateLeakage(storedDocument, storedProject);

    await page.getByTestId("json-file-input").setInputFiles(jsonPath);
    await expectRevision(page, fixture.canonical.revision);
    await readyCanvas(page);
    const jsonRoundTripPath = await exportJson(page, "006-json-round-trip.scene.json");
    expect(JSON.parse(await readFile(jsonRoundTripPath, "utf8"))).toEqual(fixture.canonical);

    await page.getByTestId("archive-file-input").setInputFiles(zipPath);
    await expectRevision(page, fixture.canonical.revision);
    const roundTripCanvas = await readyCanvas(page);
    const archiveRoundTripPath = await exportJson(page, "006-zip-round-trip.scene.json");
    expect(JSON.parse(await readFile(archiveRoundTripPath, "utf8"))).toEqual(fixture.canonical);
    const roundTripProjects = await storedProjects(page);
    expect(roundTripProjects.filter(projectStoresDocument(fixture.canonical))).toHaveLength(3);
    for (const project of roundTripProjects) {
      assertProjectRecordShape(project);
      assertNoTransientStateLeakage(JSON.parse(project.documentJson) as SceneDocument, project);
    }
    await expectCanvasEvidence(page, roundTripCanvas);
    await page.screenshot({ path: artifact("006-round-trip-1440x900.png"), fullPage: true });
    expect(runtimeErrors).toEqual([]);
  });

  test("uses stable tree multi-selection, Canvas replacement, grouping and explicit reparent history", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const runtimeErrors = observeRuntimeErrors(page);
    const fixture = await loadLayoutFixture();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(studioUrl);
    const canvas = await importLayoutArchive(page, fixture);

    await selectTreeEntities(page, ["layout-entity-a", "layout-entity-b"]);
    await expectSelection(page, ["layout-entity-a", "layout-entity-b"], "layout-entity-b");
    await expect(page.getByRole("status").filter({ hasText: "Pivot" })).toContainText(
      "-2.427 / 0.900 / 0.404",
    );

    const entityC = requireOracleEntity(fixture.oracles, "layout-entity-c");
    await clickWorldPoint(page, canvas, boundsCenter(entityC.worldBounds));
    await expectSelection(page, ["layout-entity-c"], "layout-entity-c");

    await selectTreeEntities(page, ["layout-entity-a", "layout-entity-b"]);
    const groupTiming = await clickAndMeasureNextRaf(
      page,
      page.getByRole("button", { name: "Group selection" }),
    );
    expect(groupTiming.revision).toBe(2);
    expect(groupTiming.durationMs).toBeLessThanOrEqual(100);
    await expectRevision(page, 2);
    await expect(page.getByRole("treeitem")).toHaveCount(6);

    const grouped = await exportCurrentDocument(page, "006-grouped.scene.json");
    const group = grouped.entities.find(
      (entity) => entity.type === "group" && entity.id !== "layout-root",
    );
    expect(group).toBeDefined();
    expectTransformClose(
      group?.transform,
      fixture.oracles.actions.createGroupAB.expectedGroup.localTransform,
      fixture.oracles.epsilon,
    );
    expect(group?.parentId).toBe("layout-root");
    for (const member of fixture.oracles.actions.createGroupAB.expectedMembers) {
      expect(requireEntity(grouped, member.entityId).parentId).toBe(group?.id);
      expectNumberArrayClose(
        worldMatrixFor(grouped, member.entityId),
        member.worldMatrix,
        fixture.oracles.epsilon,
      );
    }

    await page.getByRole("button", { name: "Undo" }).click();
    await expectRevision(page, 3);
    await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();
    expectDocumentEqualIgnoringRevision(
      await exportCurrentDocument(page, "006-group-undo.scene.json"),
      fixture.canonical,
    );
    await page.getByRole("button", { name: "Redo" }).click();
    await expectRevision(page, 4);
    await expect(page.getByRole("button", { name: "Redo" })).toBeDisabled();

    await selectTreeEntities(page, ["layout-entity-c"]);
    await page.getByLabel("Parent target").selectOption(group!.id);
    await page.getByRole("button", { name: "Reparent selection" }).click();
    await expectRevision(page, 5);
    const reparented = await exportCurrentDocument(page, "006-reparent-in.scene.json");
    expect(requireEntity(reparented, "layout-entity-c").parentId).toBe(group?.id);
    expectNumberArrayClose(
      worldMatrixFor(reparented, "layout-entity-c"),
      entityC.worldMatrix,
      fixture.oracles.epsilon,
    );

    await page.getByLabel("Parent target").selectOption("__scene_root__");
    await page.getByRole("button", { name: "Reparent selection" }).click();
    await expectRevision(page, 6);
    const reparentedOut = await exportCurrentDocument(page, "006-reparent-out.scene.json");
    expect(requireEntity(reparentedOut, "layout-entity-c").parentId).toBeNull();
    expectNumberArrayClose(
      worldMatrixFor(reparentedOut, "layout-entity-c"),
      entityC.worldMatrix,
      fixture.oracles.epsilon,
    );
    await expect
      .poll(() => activeStoredProject(page).then((project) => project.lastSavedRevision))
      .toBe(6);
    await expect(page.getByTestId("save-state")).toHaveText("Saved locally");
    await page.reload();
    await readyCanvas(page);
    await expectRevision(page, 6);
    expect(await exportCurrentDocument(page, "006-hierarchy-reload.scene.json")).toEqual(
      reparentedOut,
    );

    await expect(
      page.getByLabel("Parent target").locator('option[value="layout-entity-a"]'),
    ).toHaveCount(0);
    await expectNoPageOverflow(page);
    await expectPrimaryRegionsDoNotOverlap(page);
    await page.screenshot({ path: artifact("006-hierarchy-1440x900.png"), fullPage: true });
    expect(runtimeErrors).toEqual([]);
  });

  test("aligns from live bounds, distributes equal clear gaps and preserves one-step history", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const runtimeErrors = observeRuntimeErrors(page);
    const fixture = await loadLayoutFixture();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(studioUrl);
    const canvas = await importLayoutArchive(page, fixture);
    const beforePixels = await canvas.screenshot();

    await selectTreeEntities(page, ["layout-entity-a", "layout-entity-c", "layout-entity-b"]);
    await expectSelection(
      page,
      ["layout-entity-a", "layout-entity-b", "layout-entity-c"],
      "layout-entity-b",
    );
    await page.getByRole("group", { name: "Axis" }).getByRole("button", { name: "Z" }).click();
    await page.getByRole("group", { name: "Anchor" }).getByRole("button", { name: "Min" }).click();
    const alignTiming = await clickAndMeasureNextRaf(
      page,
      page.getByRole("button", { name: "Align bounds" }),
    );
    expect(alignTiming.revision).toBe(2);
    expect(alignTiming.durationMs).toBeLessThanOrEqual(100);
    await expectRevision(page, 2);

    const aligned = await exportCurrentDocument(page, "006-aligned.scene.json");
    for (const expected of fixture.oracles.actions.alignMinZToB.expected) {
      const entity = requireEntity(aligned, expected.entityId);
      expectNumberArrayClose(entity.transform.position, expected.position, fixture.oracles.epsilon);
      expectNumberArrayClose(
        worldMatrixFor(aligned, expected.entityId),
        expected.worldMatrix,
        fixture.oracles.epsilon,
      );
      expectBoundsClose(
        worldBoundsFor(aligned, expected.entityId, fixture.oracles.sourceAsset.localBounds),
        expected.worldBounds,
        fixture.oracles.epsilon,
      );
    }
    expect(
      await canvasPixelDifference(page, beforePixels, await canvas.screenshot()),
    ).toBeGreaterThan(0.002);
    await expect(page.getByRole("status").filter({ hasText: "Pivot" })).toContainText(
      "0.492 / 0.900 / 2.250",
    );
    await page.getByRole("button", { name: "Align bounds" }).click();
    await expectRevision(page, 2);
    await expect(page.locator(".layout-feedback .layout-reason.is-error")).toHaveText(
      "The layout is already unchanged.",
    );
    expect(await exportCurrentDocument(page, "006-aligned-idempotent.scene.json")).toEqual(aligned);
    await page.getByLabel("Parent target").selectOption("layout-root");
    await expect(page.getByRole("button", { name: "Reparent selection" })).toBeDisabled();
    await expect(page.getByText("Choose a different parent.")).toBeVisible();
    await expectRevision(page, 2);
    expectDocumentEqualIgnoringRevision(
      await exportCurrentDocument(page, "006-invalid-noop.scene.json"),
      aligned,
    );

    await page.getByRole("button", { name: "Undo" }).click();
    await expectRevision(page, 3);
    await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();
    expectDocumentEqualIgnoringRevision(
      await exportCurrentDocument(page, "006-align-undo.scene.json"),
      fixture.canonical,
    );
    await page.getByRole("button", { name: "Redo" }).click();
    await expectRevision(page, 4);

    await page.getByTestId("archive-file-input").setInputFiles({
      name: "006-layout-reset.scene.zip",
      mimeType: "application/zip",
      buffer: Buffer.from(fixture.archiveBytes),
    });
    await expectRevision(page, 1);
    const resetCanvas = await readyCanvas(page);
    await selectTreeEntities(page, ["layout-entity-a", "layout-entity-b", "layout-entity-d"]);
    await page.getByRole("button", { name: "Distribute gaps" }).click();
    await expectRevision(page, 2);
    const distributed = await exportCurrentDocument(page, "006-distributed.scene.json");
    const distribution = fixture.oracles.actions.distributeEqualGapX;
    expectNumberArrayClose(
      requireEntity(distributed, distribution.expectedMovedEntity.entityId).transform.position,
      distribution.expectedMovedEntity.position,
      fixture.oracles.epsilon,
    );
    for (const entityId of distribution.fixedOuterEntityIds) {
      expect(requireEntity(distributed, entityId).transform).toEqual(
        requireEntity(fixture.canonical, entityId).transform,
      );
    }
    expectEqualClearGaps(
      distributed,
      distribution.stableOrder,
      distribution.expectedEqualGap,
      fixture.oracles.sourceAsset.localBounds,
      fixture.oracles.epsilon,
    );
    await page.getByRole("button", { name: "Distribute gaps" }).click();
    await expectRevision(page, 2);
    await expect(page.locator(".layout-feedback .layout-reason.is-error")).toHaveText(
      "The layout is already unchanged.",
    );
    expect(await exportCurrentDocument(page, "006-distributed-idempotent.scene.json")).toEqual(
      distributed,
    );
    await expectCanvasEvidence(page, resetCanvas);
    await page.screenshot({
      path: artifact("006-align-distribute-1440x900.png"),
      fullPage: true,
    });
    expect(runtimeErrors).toEqual([]);
  });

  test("duplicates multiple roots atomically, inherits lock and suppresses selected descendants", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const runtimeErrors = observeRuntimeErrors(page);
    const fixture = await loadLayoutFixture();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(studioUrl);
    await importLayoutArchive(page, fixture);

    await page.getByRole("button", { name: "Lock Robot West" }).click();
    await expectRevision(page, 2);
    await selectTreeEntities(page, ["layout-entity-a", "layout-entity-d"]);
    await page.getByLabel("Duplicate offset X").fill("0");
    await page.getByLabel("Duplicate offset Y").fill("0");
    await page.getByLabel("Duplicate offset Z").fill("4");
    await page.getByRole("button", { name: "Duplicate with offset" }).click();
    await expectRevision(page, 3);

    const duplicated = await exportCurrentDocument(page, "006-duplicated.scene.json");
    expect(duplicated.entities).toHaveLength(fixture.canonical.entities.length + 2);
    expect(duplicated.targets).toHaveLength(fixture.canonical.targets.length + 2);
    const copiedA = requireDuplicateOf(duplicated, "layout-entity-a");
    const copiedD = requireDuplicateOf(duplicated, "layout-entity-d");
    expect(copiedA.parentId).toBe("layout-root");
    expect(copiedD.parentId).toBe("layout-root");
    expect(copiedA.locked).toBe(false);
    expect(copiedD.locked).toBe(true);
    expectNumberArrayClose(copiedA.transform.position, [-4, 0, 2.5], fixture.oracles.epsilon);
    expectNumberArrayClose(copiedD.transform.position, [7.25, 0, 5.5], fixture.oracles.epsilon);
    for (const copy of [copiedA, copiedD]) {
      const target = duplicated.targets.find((candidate) => candidate.entityId === copy.id);
      expect(target).toBeDefined();
      expect(Object.hasOwn(target ?? {}, "businessId")).toBe(false);
    }
    expect(duplicated.dataSources).toEqual(fixture.canonical.dataSources);
    expect(duplicated.bindings).toEqual(fixture.canonical.bindings);
    expect(duplicated.ruleSets).toEqual(fixture.canonical.ruleSets);
    expect(duplicated.annotations).toEqual(fixture.canonical.annotations);

    await page.getByTestId("archive-file-input").setInputFiles({
      name: "006-layout-ancestor.scene.zip",
      mimeType: "application/zip",
      buffer: Buffer.from(fixture.archiveBytes),
    });
    await expectRevision(page, 1);
    await selectTreeEntities(page, ["layout-entity-a", "layout-entity-b"]);
    await page.getByRole("button", { name: "Group selection" }).click();
    await expectRevision(page, 2);
    const groupId = (await selectedTreeIds(page))[0];
    expect(groupId).toBeDefined();
    await page.getByTestId(`tree-${groupId}`).locator(".tree-select").first().click();
    await page
      .getByTestId("tree-layout-entity-a")
      .locator(".tree-select")
      .click({ modifiers: ["Control"] });
    await page.getByLabel("Duplicate offset X").fill("0");
    await page.getByLabel("Duplicate offset Y").fill("0");
    await page.getByLabel("Duplicate offset Z").fill("4");
    await page.getByRole("button", { name: "Duplicate with offset" }).click();
    await expectRevision(page, 3);
    const ancestorDuplicate = await exportCurrentDocument(
      page,
      "006-ancestor-duplicate.scene.json",
    );
    expect(ancestorDuplicate.entities).toHaveLength(9);
    const copiedGroups = ancestorDuplicate.entities.filter(
      (entity) => entity.type === "group" && !["layout-root", groupId].includes(entity.id),
    );
    expect(copiedGroups).toHaveLength(1);
    expect(
      ancestorDuplicate.entities.filter((entity) => entity.parentId === copiedGroups[0]?.id),
    ).toHaveLength(2);
    expect(runtimeErrors).toEqual([]);
  });

  test("commits translation and scale snap through real TransformControls pointers", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const runtimeErrors = observeRuntimeErrors(page);
    const fixture = await loadLayoutFixture();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(studioUrl);
    const canvas = await importLayoutArchive(page, fixture);
    const identity = await markCanvasIdentity(canvas);

    await selectTreeEntities(page, ["layout-entity-b"]);
    await page.getByLabel("Grid").fill("0.5");
    await page.getByRole("button", { name: "Move" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Snap" })).toContainText("T 0.5");
    const translatePixels = await canvas.screenshot();
    await dragTransformControl(page, canvas, [-0.75, 0, 2.25], "x", "linear", 72);
    await expectRevision(page, 2);
    const translated = await exportCurrentDocument(page, "006-translation-snap.scene.json");
    const translatedB = requireEntity(translated, "layout-entity-b").transform;
    expect(translatedB.position[0]).not.toBe(-0.75);
    expectMultipleOfStep(translatedB.position[0], 0.5);
    expect(translatedB.position[1]).toBe(0);
    expect(translatedB.position[2]).toBe(2.25);
    await expect(page.getByRole("status").filter({ hasText: "Delta" })).not.toContainText(
      "0.000 / 0.000 / 0.000",
    );
    expect(
      await canvasPixelDifference(page, translatePixels, await canvas.screenshot()),
    ).toBeGreaterThan(0.0005);

    await selectTreeEntities(page, ["layout-entity-b"]);
    await page.locator(".layout-snap-fields").getByLabel("Scale", { exact: true }).fill("0.25");
    await page.getByRole("button", { name: "Scale" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Snap" })).toContainText("S 0.25");
    await dragTransformControl(page, canvas, translatedB.position, "x", "linear", 56);
    await expectRevision(page, 3);
    const scaled = await exportCurrentDocument(page, "006-scale-snap.scene.json");
    const scale = requireEntity(scaled, "layout-entity-b").transform.scale;
    expect(scale[0]).not.toBe(0.8);
    expectMultipleOfStep(scale[0], 0.25);
    expect(scale.every((value) => value > 0)).toBe(true);

    const scaleXInput = page.getByLabel("Scale X");
    const acceptedScaleX = await scaleXInput.inputValue();
    await scaleXInput.fill("0");
    await expect(scaleXInput).toHaveAttribute("aria-invalid", "true");
    await scaleXInput.press("Tab");
    await expectRevision(page, 3);
    expect(
      requireEntity(
        await exportCurrentDocument(page, "006-inspector-scale-rejected.scene.json"),
        "layout-entity-b",
      ).transform.scale,
    ).toEqual(scale);
    await scaleXInput.fill(acceptedScaleX);
    await expect(scaleXInput).toHaveAttribute("aria-invalid", "false");
    await scaleXInput.press("Tab");
    await expectRevision(page, 3);

    const rejectedDrag = await dragTransformControl(
      page,
      canvas,
      translatedB.position,
      "x",
      "linear",
      -600,
    );
    expect(rejectedDrag.startAlongAxis).toBeGreaterThan(0);
    expect(rejectedDrag.endAlongAxis).toBeLessThan(0);
    await expectRevision(page, 3);
    const rejected = await exportCurrentDocument(page, "006-scale-rejected.scene.json");
    expect(requireEntity(rejected, "layout-entity-b").transform.scale).toEqual(scale);
    await expectCanvasIdentity(page, identity);
    await expectCanvasEvidence(page, canvas);
    expect(runtimeErrors).toEqual([]);
  });

  test("commits 15-degree rotation snap through a real TransformControls pointer", async ({
    page,
  }) => {
    test.setTimeout(30_000);
    const runtimeErrors = observeRuntimeErrors(page);
    const fixture = await loadLayoutFixture();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(studioUrl);
    const canvas = await importLayoutArchive(page, fixture);

    await selectTreeEntities(page, ["layout-entity-c"]);
    await page.getByLabel("Angle").fill("15");
    await page.getByRole("button", { name: "Rotate" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Snap" })).toContainText("R 15.0 deg");
    await dragTransformControl(page, canvas, [3.5, 0, -0.25], "y", "rotation", 58);
    await expectRevision(page, 2);
    const rotated = await exportCurrentDocument(page, "006-rotation-snap.scene.json");
    const rotation = requireEntity(rotated, "layout-entity-c").transform.rotation;
    expect(rotation).not.toEqual([0, 0, 0, 1]);
    expectMultipleOfStep((2 * Math.acos(Math.min(1, Math.abs(rotation[3])))) / (Math.PI / 180), 15);
    expect(runtimeErrors).toEqual([]);
  });

  test("snaps explicit bounds anchors, rejects null bounds and disables layout mutation in Run", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const runtimeErrors = observeRuntimeErrors(page);
    const fixture = await loadLayoutFixture();
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(studioUrl);
    const canvas = await importLayoutArchive(page, fixture);
    const identity = await markCanvasIdentity(canvas);
    const beforePixels = await canvas.screenshot();

    await selectTreeEntities(page, ["layout-entity-a"]);
    await page.getByLabel("Source anchor").selectOption("maxX");
    await page.getByLabel("Target entity").selectOption("layout-entity-b");
    await page.getByLabel("Target anchor").selectOption("minX");
    const anchorTiming = await clickAndMeasureNextRaf(
      page,
      page.getByRole("button", { name: "Snap to anchor" }),
    );
    expect(anchorTiming.revision).toBe(2);
    expect(anchorTiming.durationMs).toBeLessThanOrEqual(100);
    expect(anchorTiming.statusText).toContain("layout-entity-a");
    expect(anchorTiming.statusText).toContain("layout-entity-b");
    await expectRevision(page, 2);
    const anchorButton = page.getByRole("button", { name: "Snap to anchor" });
    await page.getByLabel("Target entity").selectOption("layout-entity-c");
    await expect(anchorButton).toBeEnabled();
    await page.getByLabel("Target entity").selectOption("layout-entity-b");
    await expect(anchorButton).toBeEnabled();
    await expect(page.getByRole("status").filter({ hasText: "Source anchor" })).toContainText(
      "layout-entity-a",
    );
    await expect(page.getByRole("status").filter({ hasText: "Target anchor" })).toContainText(
      "layout-entity-b",
    );
    await expect(page.getByText("Current spatial measurements are unavailable.")).toHaveCount(0);
    const anchored = await exportCurrentDocument(page, "006-anchor.scene.json");
    const anchorOracle = fixture.oracles.actions.boundsAnchorAtoB;
    expectNumberArrayClose(
      requireEntity(anchored, anchorOracle.sourceEntityId).transform.position,
      anchorOracle.expectedPosition,
      fixture.oracles.epsilon,
    );
    expect(
      await canvasPixelDifference(page, beforePixels, await canvas.screenshot()),
    ).toBeGreaterThan(0.002);
    await expectCanvasIdentity(page, identity);
    await selectTreeEntities(page, ["layout-entity-c"]);
    await expect(page.getByRole("status").filter({ hasText: "Source anchor" })).toHaveCount(0);
    await expect(page.getByRole("status").filter({ hasText: "Target anchor" })).toHaveCount(0);

    await page.getByTestId("archive-file-input").setInputFiles({
      name: "006-layout-null-bounds.scene.zip",
      mimeType: "application/zip",
      buffer: Buffer.from(fixture.archiveBytes),
    });
    await expectRevision(page, 1);
    const resetCanvas = await readyCanvas(page);
    const resetIdentity = await markCanvasIdentity(resetCanvas);
    await selectTreeEntities(page, [
      "layout-entity-a",
      "layout-entity-b",
      "layout-entity-c",
      "layout-entity-d",
    ]);
    await page.getByLabel("Parent target").selectOption("__scene_root__");
    await page.getByRole("button", { name: "Reparent selection" }).click();
    await expectRevision(page, 2);
    await selectTreeEntities(page, ["layout-root", "layout-entity-b"]);
    await expect(page.getByRole("button", { name: "Align bounds" })).toBeDisabled();
    await expect(
      page
        .getByRole("region", { name: "Arrange" })
        .getByText("Current world bounds are unavailable."),
    ).toBeVisible();
    await selectTreeEntities(page, ["layout-root"]);
    await page.getByLabel("Target entity").selectOption("layout-entity-b");
    await expect(page.getByRole("button", { name: "Snap to anchor" })).toBeDisabled();
    await expectRevision(page, 2);
    await page.getByLabel("Grid").fill("0.5");
    await expect(page.getByRole("status").filter({ hasText: "Snap" })).toContainText("T 0.5");
    await expectCanvasIdentity(page, resetIdentity);

    const beforeRun = await exportCurrentDocument(page, "006-before-run.scene.json");
    await expect(page.getByTestId("export-state")).toHaveCount(0);
    await page.getByRole("button", { name: "Run", exact: true }).click();
    await expect(page.getByTestId("viewport-mode")).toContainText("RUN");
    const runLayoutControls = page.locator('[data-layout-control="true"]');
    await expect(runLayoutControls).toHaveCount(16);
    for (let index = 0; index < (await runLayoutControls.count()); index += 1) {
      await expect(runLayoutControls.nth(index)).toBeDisabled();
    }
    await expect(page.getByRole("button", { name: /^Duplicate selection/ })).toBeDisabled();
    await page.keyboard.press("Control+d");
    await page.keyboard.press("Delete");
    await page.keyboard.press("w");
    await page.waitForTimeout(150);
    await expectRevision(page, 2);
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(page.getByLabel("Grid")).toHaveValue("0.5");
    expectDocumentEqualIgnoringRevision(
      await exportCurrentDocument(page, "006-after-run.scene.json"),
      beforeRun,
    );

    await page.getByRole("button", { name: "Chinese" }).click();
    await page.getByRole("button", { name: "切换到深色主题" }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expectCanvasIdentity(page, resetIdentity);
    await expectCanvasEvidence(page, resetCanvas);
    await expectNoPageOverflow(page);
    await expectPrimaryRegionsDoNotOverlap(page);
    await expectVisibleControlsNotClipped(page);
    await page.getByRole("button", { name: "吸附到锚点" }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: artifact("006-snap-1280x720.png"), fullPage: true });
    expect(runtimeErrors).toEqual([]);
  });
});

interface LayoutFixture {
  readonly source: SceneDocument;
  readonly canonical: SceneDocument;
  readonly oracles: LayoutOracles;
  readonly archiveBytes: Uint8Array;
  readonly assetBytes: Uint8Array;
}

interface LayoutOracles {
  readonly initialRevision: number;
  readonly epsilon: number;
  readonly sourceAsset: {
    readonly uri: string;
    readonly byteLength: number;
    readonly sha256: string;
    readonly localBounds: WorldBounds;
  };
  readonly initial: {
    readonly rootEntityId: string;
    readonly entities: readonly InitialEntityOracle[];
  };
  readonly actions: {
    readonly createGroupAB: {
      readonly expectedGroup: {
        readonly localTransform: Transform;
      };
      readonly expectedMembers: readonly {
        readonly entityId: string;
        readonly worldMatrix: readonly number[];
      }[];
    };
    readonly alignMinZToB: {
      readonly expected: readonly {
        readonly entityId: string;
        readonly position: readonly number[];
        readonly worldMatrix: readonly number[];
        readonly worldBounds: WorldBounds;
      }[];
    };
    readonly distributeEqualGapX: {
      readonly stableOrder: readonly string[];
      readonly expectedEqualGap: number;
      readonly expectedMovedEntity: {
        readonly entityId: string;
        readonly position: readonly number[];
      };
      readonly fixedOuterEntityIds: readonly string[];
    };
    readonly boundsAnchorAtoB: {
      readonly sourceEntityId: string;
      readonly expectedPosition: readonly number[];
    };
  };
}

interface WorldBounds {
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
}

interface InitialEntityOracle {
  readonly entityId: string;
  readonly parentId: string | null;
  readonly localTransform: SceneDocument["entities"][number]["transform"];
  readonly localMatrix: readonly number[];
  readonly worldMatrix: readonly number[];
  readonly worldBounds: WorldBounds;
}

let fixturePromise: Promise<LayoutFixture> | undefined;

function loadLayoutFixture(): Promise<LayoutFixture> {
  fixturePromise ??= createLayoutFixture();
  return fixturePromise;
}

async function createLayoutFixture(): Promise<LayoutFixture> {
  const [sceneJson, oracleJson, assetBuffer] = await Promise.all([
    readFile(scenePath, "utf8"),
    readFile(oraclePath, "utf8"),
    readFile(assetPath),
  ]);
  const source = JSON.parse(sceneJson) as SceneDocument;
  const oracles = JSON.parse(oracleJson) as LayoutOracles;
  const assetBytes = new Uint8Array(
    assetBuffer.buffer.slice(
      assetBuffer.byteOffset,
      assetBuffer.byteOffset + assetBuffer.byteLength,
    ),
  );

  expect(assetBytes.byteLength).toBe(expectedAssetBytes);
  expect(createHash("sha256").update(assetBytes).digest("hex")).toBe(expectedAssetSha256);
  expect(oracles.sourceAsset).toMatchObject({
    uri: source.assets[0]?.uri,
    byteLength: expectedAssetBytes,
    sha256: expectedAssetSha256,
  });

  const archiveBytes = await exportSceneArchive({
    document: source,
    createdAt: archiveCreatedAt,
    resolveAssetBytes: new Map([[expectedAssetSha256, assetBytes]]),
  });
  const imported = await importSceneArchive(archiveBytes);
  expect(imported.assets).toHaveLength(1);
  expect(imported.assets[0]?.bytes).toEqual(assetBytes);

  return { source, canonical: imported.document, oracles, archiveBytes, assetBytes };
}

async function importLayoutArchive(page: Page, fixture: LayoutFixture): Promise<Locator> {
  await page.getByTestId("archive-file-input").setInputFiles({
    name: "006-layout.scene.zip",
    mimeType: "application/zip",
    buffer: Buffer.from(fixture.archiveBytes),
  });
  await expect(page.locator(".project-copy strong")).toHaveText(fixture.canonical.name);
  const canvas = await readyCanvas(page);
  await expect(page.getByTestId("save-state")).toHaveText("Saved locally");
  return canvas;
}

function assertInitialOracle(document: SceneDocument, oracles: LayoutOracles): void {
  expect(document.revision).toBe(oracles.initialRevision);
  expect(document.entities.map((entity) => entity.id)).toEqual([
    "layout-entity-a",
    "layout-entity-b",
    "layout-entity-c",
    "layout-entity-d",
    "layout-root",
  ]);
  expect(document.targets.map((target) => target.id)).toEqual([
    "layout-target-a",
    "layout-target-b",
    "layout-target-c",
    "layout-target-d",
  ]);
  expect(document.entities).toHaveLength(oracles.initial.entities.length);
  for (const expected of oracles.initial.entities) {
    const entity = document.entities.find((candidate) => candidate.id === expected.entityId);
    expect(entity, `Missing fixture entity ${expected.entityId}`).toBeDefined();
    expect(entity?.parentId).toBe(expected.parentId);
    expect(entity?.transform).toEqual(expected.localTransform);
    expect(expected.localMatrix).toHaveLength(16);
    expect(expected.worldMatrix).toHaveLength(16);
  }
  expect(oracles.initial.rootEntityId).toBe("layout-root");
  expect(document.dataSources).toHaveLength(1);
  expect(document.dataSources[0]).toMatchObject({
    id: "layout-status-source",
    adapter: "mock",
    options: { scenario: "status-cycle" },
  });
  expect(document.bindings).toEqual([
    expect.objectContaining({
      id: "layout-a-status-binding",
      targetId: "layout-target-a",
      pointer: "/telemetry/status",
      ruleSetId: "layout-status-rules",
      writes: ["color", "alarm"],
    }),
  ]);
  expect(document.ruleSets[0]?.rules).toHaveLength(3);
}

function requireEntity(document: SceneDocument, entityId: string): SceneEntity {
  const entity = document.entities.find((candidate) => candidate.id === entityId);
  if (entity === undefined) throw new Error(`Missing entity ${entityId}.`);
  return entity;
}

function requireOracleEntity(oracles: LayoutOracles, entityId: string): InitialEntityOracle {
  const entity = oracles.initial.entities.find((candidate) => candidate.entityId === entityId);
  if (entity === undefined) throw new Error(`Missing oracle entity ${entityId}.`);
  return entity;
}

function requireDuplicateOf(document: SceneDocument, sourceEntityId: string): SceneEntity {
  const source = requireEntity(document, sourceEntityId);
  const duplicates = document.entities.filter(
    (candidate) =>
      candidate.id !== sourceEntityId &&
      candidate.type === source.type &&
      candidate.name === source.name,
  );
  if (duplicates.length !== 1) {
    throw new Error(`Expected one duplicate of ${sourceEntityId}, found ${duplicates.length}.`);
  }
  return duplicates[0]!;
}

async function selectTreeEntities(page: Page, entityIds: readonly string[]): Promise<void> {
  if (entityIds.length === 0) throw new Error("Tree selection requires at least one entity.");
  await page.getByTestId(`tree-${entityIds[0]}`).locator(".tree-select").click();
  for (const entityId of entityIds.slice(1)) {
    await page
      .getByTestId(`tree-${entityId}`)
      .locator(".tree-select")
      .click({ modifiers: ["Control"] });
  }
}

async function selectedTreeIds(page: Page): Promise<readonly string[]> {
  return page.locator('[role="treeitem"][aria-selected="true"]').evaluateAll((items) =>
    items
      .map((item) => (item as HTMLElement).dataset["entityId"] ?? "")
      .filter(Boolean)
      .sort(),
  );
}

async function expectSelection(
  page: Page,
  entityIds: readonly string[],
  primaryEntityId: string,
): Promise<void> {
  await expect.poll(() => selectedTreeIds(page)).toEqual([...entityIds].sort());
  await expect(page.getByTestId("viewport-mode")).toContainText(primaryEntityId);
  await expect(page.getByText(`${entityIds.length} selected`, { exact: true })).toBeVisible();
}

async function exportCurrentDocument(page: Page, fileName: string): Promise<SceneDocument> {
  const outputPath = await exportJson(page, fileName);
  return JSON.parse(await readFile(outputPath, "utf8")) as SceneDocument;
}

function expectDocumentEqualIgnoringRevision(actual: SceneDocument, expected: SceneDocument): void {
  expect({ ...actual, revision: expected.revision }).toEqual(expected);
}

function expectTransformClose(
  actual: Transform | undefined,
  expected: Transform,
  epsilon: number,
): void {
  expect(actual).toBeDefined();
  if (actual === undefined) return;
  expectNumberArrayClose(actual.position, expected.position, epsilon);
  expectNumberArrayClose(actual.rotation, expected.rotation, epsilon);
  expectNumberArrayClose(actual.scale, expected.scale, epsilon);
}

function expectNumberArrayClose(
  actual: readonly number[],
  expected: readonly number[],
  epsilon: number,
): void {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((value, index) =>
    expect(Math.abs(value - (expected[index] ?? Number.NaN))).toBeLessThanOrEqual(epsilon),
  );
}

function expectBoundsClose(
  actual: WorldBounds | null,
  expected: WorldBounds,
  epsilon: number,
): void {
  expect(actual).not.toBeNull();
  if (actual === null) return;
  expectNumberArrayClose(actual.min, expected.min, epsilon);
  expectNumberArrayClose(actual.max, expected.max, epsilon);
}

function worldMatrixFor(document: SceneDocument, entityId: string): readonly number[] {
  const entity = requireEntity(document, entityId);
  const local = composeMatrix(entity.transform);
  return entity.parentId === null
    ? local
    : multiplyMatrices(worldMatrixFor(document, entity.parentId), local);
}

function composeMatrix(transform: Transform): readonly number[] {
  const [x, y, z, w] = transform.rotation;
  const [sx, sy, sz] = transform.scale;
  const x2 = x + x;
  const y2 = y + y;
  const z2 = z + z;
  const xx = x * x2;
  const xy = x * y2;
  const xz = x * z2;
  const yy = y * y2;
  const yz = y * z2;
  const zz = z * z2;
  const wx = w * x2;
  const wy = w * y2;
  const wz = w * z2;
  const [px, py, pz] = transform.position;
  return [
    (1 - (yy + zz)) * sx,
    (xy + wz) * sx,
    (xz - wy) * sx,
    0,
    (xy - wz) * sy,
    (1 - (xx + zz)) * sy,
    (yz + wx) * sy,
    0,
    (xz + wy) * sz,
    (yz - wx) * sz,
    (1 - (xx + yy)) * sz,
    0,
    px,
    py,
    pz,
    1,
  ];
}

function multiplyMatrices(left: readonly number[], right: readonly number[]): readonly number[] {
  const result = new Array<number>(16).fill(0);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      let value = 0;
      for (let index = 0; index < 4; index += 1) {
        value += (left[index * 4 + row] ?? 0) * (right[column * 4 + index] ?? 0);
      }
      result[column * 4 + row] = value;
    }
  }
  return result;
}

function transformPoint(
  matrix: readonly number[],
  point: readonly number[],
): [number, number, number] {
  const [x = 0, y = 0, z = 0] = point;
  return [
    (matrix[0] ?? 0) * x + (matrix[4] ?? 0) * y + (matrix[8] ?? 0) * z + (matrix[12] ?? 0),
    (matrix[1] ?? 0) * x + (matrix[5] ?? 0) * y + (matrix[9] ?? 0) * z + (matrix[13] ?? 0),
    (matrix[2] ?? 0) * x + (matrix[6] ?? 0) * y + (matrix[10] ?? 0) * z + (matrix[14] ?? 0),
  ];
}

function worldBoundsFor(
  document: SceneDocument,
  entityId: string,
  assetLocalBounds: WorldBounds,
): WorldBounds | null {
  const entity = requireEntity(document, entityId);
  if (!entity.visible) return null;
  if (entity.type === "asset") {
    const matrix = worldMatrixFor(document, entityId);
    const corners: Array<[number, number, number]> = [];
    for (const x of [assetLocalBounds.min[0], assetLocalBounds.max[0]]) {
      for (const y of [assetLocalBounds.min[1], assetLocalBounds.max[1]]) {
        for (const z of [assetLocalBounds.min[2], assetLocalBounds.max[2]]) {
          corners.push(transformPoint(matrix, [x, y, z]));
        }
      }
    }
    return boundsForPoints(corners);
  }
  const childBounds = document.entities
    .filter((candidate) => candidate.parentId === entityId)
    .map((candidate) => worldBoundsFor(document, candidate.id, assetLocalBounds))
    .filter((bounds): bounds is WorldBounds => bounds !== null);
  return unionBounds(childBounds);
}

function boundsForPoints(points: readonly (readonly number[])[]): WorldBounds {
  const values = points.flatMap((point) => point);
  if (values.some((value) => !Number.isFinite(value)))
    throw new Error("Bounds contain non-finite data.");
  return {
    min: [
      Math.min(...points.map((point) => point[0] ?? Infinity)),
      Math.min(...points.map((point) => point[1] ?? Infinity)),
      Math.min(...points.map((point) => point[2] ?? Infinity)),
    ],
    max: [
      Math.max(...points.map((point) => point[0] ?? -Infinity)),
      Math.max(...points.map((point) => point[1] ?? -Infinity)),
      Math.max(...points.map((point) => point[2] ?? -Infinity)),
    ],
  };
}

function unionBounds(bounds: readonly WorldBounds[]): WorldBounds | null {
  if (bounds.length === 0) return null;
  return boundsForPoints(bounds.flatMap((value) => [value.min, value.max]));
}

function boundsCenter(bounds: WorldBounds): readonly [number, number, number] {
  return [
    (bounds.min[0] + bounds.max[0]) / 2,
    (bounds.min[1] + bounds.max[1]) / 2,
    (bounds.min[2] + bounds.max[2]) / 2,
  ];
}

function expectEqualClearGaps(
  document: SceneDocument,
  stableOrder: readonly string[],
  expectedGap: number,
  assetLocalBounds: WorldBounds,
  epsilon: number,
): void {
  const bounds = stableOrder.map((entityId) => {
    const value = worldBoundsFor(document, entityId, assetLocalBounds);
    if (value === null) throw new Error(`Missing bounds for ${entityId}.`);
    return value;
  });
  const gaps = bounds.slice(1).map((value, index) => value.min[0] - bounds[index]!.max[0]);
  expectNumberArrayClose(
    gaps,
    gaps.map(() => expectedGap),
    epsilon,
  );
}

async function clickWorldPoint(
  page: Page,
  canvas: Locator,
  worldPoint: readonly [number, number, number],
): Promise<void> {
  const bounds = await canvas.boundingBox();
  if (bounds === null) throw new Error("Canvas bounds are unavailable.");
  const point = projectFixtureWorldPoint(worldPoint, bounds.width / bounds.height);
  await page.mouse.click(bounds.x + point.x * bounds.width, bounds.y + point.y * bounds.height);
}

function projectFixtureWorldPoint(
  point: readonly [number, number, number],
  aspect: number,
): { readonly x: number; readonly y: number } {
  const camera = [14, 10, 16] as const;
  const target = [1.5, 0.75, 0.5] as const;
  const forward = normalize3(subtract3(target, camera));
  const right = normalize3(cross3(forward, [0, 1, 0]));
  const up = cross3(right, forward);
  const relative = subtract3(point, camera);
  const depth = dot3(relative, forward);
  const halfHeight = depth * Math.tan((42 * Math.PI) / 360);
  const ndcX = dot3(relative, right) / (halfHeight * aspect);
  const ndcY = dot3(relative, up) / halfHeight;
  return { x: (ndcX + 1) / 2, y: (1 - ndcY) / 2 };
}

function subtract3(left: readonly number[], right: readonly number[]): [number, number, number] {
  return [
    (left[0] ?? 0) - (right[0] ?? 0),
    (left[1] ?? 0) - (right[1] ?? 0),
    (left[2] ?? 0) - (right[2] ?? 0),
  ];
}

function cross3(left: readonly number[], right: readonly number[]): [number, number, number] {
  return [
    (left[1] ?? 0) * (right[2] ?? 0) - (left[2] ?? 0) * (right[1] ?? 0),
    (left[2] ?? 0) * (right[0] ?? 0) - (left[0] ?? 0) * (right[2] ?? 0),
    (left[0] ?? 0) * (right[1] ?? 0) - (left[1] ?? 0) * (right[0] ?? 0),
  ];
}

function dot3(left: readonly number[], right: readonly number[]): number {
  return (
    (left[0] ?? 0) * (right[0] ?? 0) +
    (left[1] ?? 0) * (right[1] ?? 0) +
    (left[2] ?? 0) * (right[2] ?? 0)
  );
}

function normalize3(value: readonly number[]): [number, number, number] {
  const length = Math.hypot(value[0] ?? 0, value[1] ?? 0, value[2] ?? 0);
  if (length === 0) throw new Error("Cannot normalize a zero vector.");
  return [(value[0] ?? 0) / length, (value[1] ?? 0) / length, (value[2] ?? 0) / length];
}

interface ActionTiming {
  readonly durationMs: number;
  readonly revision: number;
  readonly statusText: string;
}

async function clickAndMeasureNextRaf(page: Page, button: Locator): Promise<ActionTiming> {
  await button.evaluate((element) => {
    element.addEventListener(
      "click",
      () => {
        const startedAt = performance.now();
        const controlled = globalThis as typeof globalThis & {
          __layoutActionTiming?: Promise<ActionTiming>;
        };
        controlled.__layoutActionTiming = new Promise((resolve) => {
          requestAnimationFrame(() => {
            const revision = Number(
              document.querySelector<HTMLElement>('[data-testid="document-revision"]')?.dataset[
                "revision"
              ],
            );
            const statusText =
              document.querySelector<HTMLElement>('.layout-feedback [role="status"]')?.innerText ??
              "";
            resolve({ durationMs: performance.now() - startedAt, revision, statusText });
          });
        });
      },
      { capture: true, once: true },
    );
  });
  await button.click();
  return page.evaluate(async () => {
    const controlled = globalThis as typeof globalThis & {
      __layoutActionTiming?: Promise<ActionTiming>;
    };
    if (controlled.__layoutActionTiming === undefined) {
      throw new Error("Layout action timing was not captured.");
    }
    return controlled.__layoutActionTiming;
  });
}

function expectMultipleOfStep(value: number, step: number, epsilon = 1e-6): void {
  expect(Math.abs(value / step - Math.round(value / step))).toBeLessThanOrEqual(epsilon);
}

type GizmoAxis = "x" | "y" | "z";
type GizmoHandleKind = "linear" | "rotation";

interface GizmoDragEvidence {
  readonly startAlongAxis: number;
  readonly endAlongAxis: number;
}

async function dragTransformControl(
  page: Page,
  canvas: Locator,
  worldOrigin: readonly [number, number, number],
  axis: GizmoAxis,
  kind: GizmoHandleKind,
  distance: number,
): Promise<GizmoDragEvidence> {
  await page.waitForTimeout(180);
  const screenshot = await canvas.screenshot();
  const bounds = await canvas.boundingBox();
  if (bounds === null) throw new Error("Canvas bounds are unavailable for gizmo drag.");
  const origin = projectFixtureWorldPoint(worldOrigin, bounds.width / bounds.height);
  const axisOffset: Record<GizmoAxis, readonly [number, number, number]> = {
    x: [1, 0, 0],
    y: [0, 1, 0],
    z: [0, 0, 1],
  };
  const offset = axisOffset[axis];
  const axisWorldPoint: [number, number, number] = [
    worldOrigin[0] + offset[0],
    worldOrigin[1] + offset[1],
    worldOrigin[2] + offset[2],
  ];
  const projectedAxis = projectFixtureWorldPoint(axisWorldPoint, bounds.width / bounds.height);
  const handle = await findGizmoHandle(page, screenshot, {
    axis,
    kind,
    origin,
    projectedAxis,
  });
  const start = {
    x: bounds.x + handle.x * bounds.width,
    y: bounds.y + handle.y * bounds.height,
  };
  const direction =
    kind === "rotation"
      ? normalize2({ x: -(handle.y - origin.y), y: handle.x - origin.x })
      : normalize2({ x: projectedAxis.x - origin.x, y: projectedAxis.y - origin.y });
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + direction.x * distance, start.y + direction.y * distance, {
    steps: 12,
  });
  await page.mouse.up();
  const originScreen = {
    x: bounds.x + origin.x * bounds.width,
    y: bounds.y + origin.y * bounds.height,
  };
  const startAlongAxis =
    (start.x - originScreen.x) * direction.x + (start.y - originScreen.y) * direction.y;
  return { startAlongAxis, endAlongAxis: startAlongAxis + distance };
}

function normalize2(value: { readonly x: number; readonly y: number }): {
  readonly x: number;
  readonly y: number;
} {
  const length = Math.hypot(value.x, value.y);
  if (length === 0) throw new Error("Cannot normalize a zero screen vector.");
  return { x: value.x / length, y: value.y / length };
}

async function findGizmoHandle(
  page: Page,
  screenshot: Buffer,
  options: {
    readonly axis: GizmoAxis;
    readonly kind: GizmoHandleKind;
    readonly origin: { readonly x: number; readonly y: number };
    readonly projectedAxis: { readonly x: number; readonly y: number };
  },
): Promise<{ readonly x: number; readonly y: number }> {
  return page.evaluate(
    async ({ encoded, axis, kind, origin, projectedAxis }) => {
      const response = await fetch(`data:image/png;base64,${encoded}`);
      const bitmap = await createImageBitmap(await response.blob());
      const surface = document.createElement("canvas");
      surface.width = bitmap.width;
      surface.height = bitmap.height;
      const context = surface.getContext("2d", { willReadFrequently: true });
      if (context === null) throw new Error("2D Canvas is unavailable for gizmo detection.");
      context.drawImage(bitmap, 0, 0);
      bitmap.close();
      const pixels = context.getImageData(0, 0, surface.width, surface.height).data;
      const originPixels = { x: origin.x * surface.width, y: origin.y * surface.height };
      const directionLength = Math.hypot(projectedAxis.x - origin.x, projectedAxis.y - origin.y);
      const direction = {
        x: (projectedAxis.x - origin.x) / directionLength,
        y: (projectedAxis.y - origin.y) / directionLength,
      };
      let best: { x: number; y: number; score: number } | null = null;
      const matchesAxis = (red: number, green: number, blue: number): boolean => {
        if (axis === "x") return red > 105 && red - green > 38 && red - blue > 38;
        if (axis === "y") return green > 80 && green - red > 22 && green - blue > 18;
        return blue > 105 && blue - red > 35 && blue - green > 25;
      };
      for (let y = 0; y < surface.height; y += 1) {
        for (let x = 0; x < surface.width; x += 1) {
          const index = (y * surface.width + x) * 4;
          const red = pixels[index] ?? 0;
          const green = pixels[index + 1] ?? 0;
          const blue = pixels[index + 2] ?? 0;
          const alpha = pixels[index + 3] ?? 0;
          if (alpha < 180 || !matchesAxis(red, green, blue)) continue;
          const dx = x - originPixels.x;
          const dy = y - originPixels.y;
          const radius = Math.hypot(dx, dy);
          if (radius < 14 || radius > 125) continue;
          let score = radius;
          if (kind === "linear") {
            const along = dx * direction.x + dy * direction.y;
            const perpendicular = Math.abs(dx * direction.y - dy * direction.x);
            if (along < 12 || perpendicular > 13) continue;
            score = along - perpendicular * 2;
          }
          if (best === null || score > best.score) best = { x, y, score };
        }
      }
      if (best === null) {
        throw new Error(
          `No ${axis} ${kind} gizmo pixel near ${originPixels.x.toFixed(1)},${originPixels.y.toFixed(1)}.`,
        );
      }
      return { x: best.x / surface.width, y: best.y / surface.height };
    },
    {
      encoded: screenshot.toString("base64"),
      axis: options.axis,
      kind: options.kind,
      origin: options.origin,
      projectedAxis: options.projectedAxis,
    },
  );
}

async function exportJson(page: Page, fileName: string): Promise<string> {
  await page.getByRole("button", { name: "Open project menu" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("export-json-command").click();
  const download = await downloadPromise;
  const outputPath = test.info().outputPath(fileName);
  await download.saveAs(outputPath);
  return outputPath;
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

function projectStoresDocument(expected: SceneDocument): (project: StoredProject) => boolean {
  return (project) => {
    try {
      return JSON.stringify(JSON.parse(project.documentJson)) === JSON.stringify(expected);
    } catch {
      return false;
    }
  };
}

function assertProjectRecordShape(project: StoredProject): void {
  expect(Object.keys(project).sort()).toEqual(expectedProjectRecordKeys);
}

function assertNoTransientStateLeakage(document: SceneDocument, project?: StoredProject): void {
  const transientFields = new Set([
    "selectedEntityIds",
    "primaryEntityId",
    "transformSettings",
    "translationSnap",
    "rotationSnap",
    "rotationSnapRadians",
    "scaleSnap",
    "boundsAnchor",
    "anchorKind",
    "pivot",
    "spatialSnapshot",
    "worldBounds",
    "worldMatrix",
    "hover",
    "preview",
    "transformPreview",
    "object3D",
    "Object3D",
    "layoutDiagnostic",
    "activeAxis",
    "transformDelta",
    "connection",
    "currentValue",
    "quality",
    "alarm",
    "diagnostic",
    "runtimeState",
  ]);
  const visit = (value: unknown, owner: string): void => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${owner}[${index}]`));
      return;
    }
    if (value === null || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      expect(transientFields.has(key), `${owner} leaked transient field ${key}`).toBe(false);
      visit(child, `${owner}.${key}`);
    }
  };
  visit(document, "document");
  if (project !== undefined) visit(project, "project-record");
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

async function expectRevision(page: Page, revision: number): Promise<void> {
  await expect(page.getByTestId("document-revision")).toHaveAttribute(
    "data-revision",
    String(revision),
  );
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
    if (context === null) return { authoredRatio: 0, distinct: 0, opaqueRatio: 0 };
    context.drawImage(bitmap, 0, 0, sample.width, sample.height);
    bitmap.close();
    const pixels = context.getImageData(0, 0, sample.width, sample.height).data;
    const colors = new Set<string>();
    let authored = 0;
    let opaque = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      const red = pixels[index] ?? 0;
      const green = pixels[index + 1] ?? 0;
      const blue = pixels[index + 2] ?? 0;
      const alpha = pixels[index + 3] ?? 0;
      if (alpha > 250) opaque += 1;
      if (Math.max(red, green, blue) < 215) authored += 1;
      colors.add(`${red >> 4}:${green >> 4}:${blue >> 4}:${alpha >> 4}`);
    }
    const count = pixels.length / 4;
    return {
      authoredRatio: authored / count,
      distinct: colors.size,
      opaqueRatio: opaque / count,
    };
  }, encoded);
}

async function expectCanvasEvidence(page: Page, canvas: Locator): Promise<void> {
  const metrics = await canvasMetrics(page, canvas);
  expect(metrics.opaqueRatio).toBeGreaterThan(0.99);
  expect(metrics.distinct).toBeGreaterThan(8);
  expect(metrics.authoredRatio).toBeGreaterThan(0.005);
}

async function canvasPixelDifference(page: Page, before: Buffer, after: Buffer): Promise<number> {
  return page.evaluate(
    async ({ beforeBase64, afterBase64 }) => {
      const decode = async (encoded: string): Promise<ImageData> => {
        const response = await fetch(`data:image/png;base64,${encoded}`);
        const bitmap = await createImageBitmap(await response.blob());
        const surface = document.createElement("canvas");
        surface.width = 128;
        surface.height = 128;
        const context = surface.getContext("2d", { willReadFrequently: true });
        if (context === null) throw new Error("2D Canvas is unavailable.");
        context.drawImage(bitmap, 0, 0, surface.width, surface.height);
        bitmap.close();
        return context.getImageData(0, 0, surface.width, surface.height);
      };
      const left = await decode(beforeBase64);
      const right = await decode(afterBase64);
      let changed = 0;
      for (let index = 0; index < left.data.length; index += 4) {
        const delta =
          Math.abs((left.data[index] ?? 0) - (right.data[index] ?? 0)) +
          Math.abs((left.data[index + 1] ?? 0) - (right.data[index + 1] ?? 0)) +
          Math.abs((left.data[index + 2] ?? 0) - (right.data[index + 2] ?? 0));
        if (delta > 24) changed += 1;
      }
      return changed / (left.data.length / 4);
    },
    { beforeBase64: before.toString("base64"), afterBase64: after.toString("base64") },
  );
}

async function markCanvasIdentity(canvas: Locator): Promise<string> {
  const identity = `canvas-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  await canvas.evaluate((element, value) => {
    (element as HTMLCanvasElement).dataset["e2eIdentity"] = value;
  }, identity);
  return identity;
}

async function expectCanvasIdentity(page: Page, identity: string): Promise<void> {
  await expect(page.locator('canvas[data-web3d-viewer="true"]')).toHaveAttribute(
    "data-e2e-identity",
    identity,
  );
  await expect(page.locator('canvas[data-web3d-viewer="true"]')).toHaveCount(1);
}

async function expectNoPageOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => ({
    horizontal: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    vertical: document.documentElement.scrollHeight - document.documentElement.clientHeight,
  }));
  expect(overflow.horizontal).toBeLessThanOrEqual(1);
  expect(overflow.vertical).toBeLessThanOrEqual(1);
}

async function expectPrimaryRegionsDoNotOverlap(page: Page): Promise<void> {
  const regions = await page.evaluate(() => {
    const rect = (selector: string): DOMRect => {
      const element = document.querySelector(selector);
      if (element === null) throw new Error(`Missing region ${selector}.`);
      return element.getBoundingClientRect();
    };
    const normalize = (value: DOMRect) => ({
      left: value.left,
      right: value.right,
      top: value.top,
      bottom: value.bottom,
    });
    return {
      left: normalize(rect(".studio-left")),
      viewport: normalize(rect(".studio-viewport")),
      inspector: normalize(rect(".studio-inspector")),
      diagnostics: normalize(rect(".studio-diagnostics")),
    };
  });
  expect(regions.left.right).toBeLessThanOrEqual(regions.viewport.left + 1);
  expect(regions.viewport.right).toBeLessThanOrEqual(regions.inspector.left + 1);
  expect(regions.left.bottom).toBeLessThanOrEqual(regions.diagnostics.top + 1);
  expect(regions.viewport.bottom).toBeLessThanOrEqual(regions.diagnostics.top + 1);
  expect(regions.inspector.bottom).toBeLessThanOrEqual(regions.diagnostics.top + 1);
}

async function expectVisibleControlsNotClipped(page: Page): Promise<void> {
  const controls = page.locator(
    ".studio-toolbar button:visible, .studio-inspector button:visible, .studio-inspector input:visible, .studio-inspector select:visible",
  );
  const count = await controls.count();
  for (let index = 0; index < count; index += 1) {
    const control = controls.nth(index);
    await control.scrollIntoViewIfNeeded();
    const result = await control.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      const inspector = element.closest(".studio-inspector")?.getBoundingClientRect();
      return {
        textFits:
          (element as HTMLElement).scrollWidth <= (element as HTMLElement).clientWidth + 1 &&
          (element as HTMLElement).scrollHeight <= (element as HTMLElement).clientHeight + 1,
        withinInspector:
          inspector === undefined ||
          (bounds.left >= inspector.left - 1 && bounds.right <= inspector.right + 1),
      };
    });
    expect(result.textFits, `Control ${index} text is clipped.`).toBe(true);
    expect(result.withinInspector, `Control ${index} exceeds the inspector.`).toBe(true);
  }
}

function observeRuntimeErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror:${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console:${message.text()}`);
  });
  return errors;
}
