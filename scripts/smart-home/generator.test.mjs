import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  exportSceneArchive,
  importSceneArchive,
  validateSceneDocument,
} from "../../packages/document/src/index.ts";
import { inspectGltf } from "../../packages/runtime/src/assets/inspect-gltf.ts";
import { mockScenario } from "../../apps/studio/src/data-binding/mock-scenarios.ts";
import { EXCLUDED_ASSETS, SEMANTIC_NODE_INDEX, SHIP_ASSET_ALLOWLIST } from "./allowlist.mjs";
import {
  ARCHIVE_CREATED_AT,
  assertLayoutContract,
  assertOutputPolicy,
  auditAssetAgainstAllowlist,
  auditSmartHomeSource,
  buildSmartHomeDocument,
  validateLicenseAuthorization,
} from "./generator.mjs";
import { DEVICE_TARGETS, SMART_HOME_INSTANCES, SMART_HOME_VIEWS } from "./layout.mjs";
import {
  buildPresentationShellAsset,
  PRESENTATION_DEFAULT_HIDDEN_ASSET_IDS,
  PRESENTATION_SHELL_ASSET_ID,
  PRESENTATION_SHELL_ENTITY_ID,
  PRESENTATION_SHELL_SHA256,
  validatePresentationShellLicense,
} from "./presentation-shell.mjs";

const sourceRoot = "/mnt/e/data/model/smart_home_90sqm";
const hasOwnerSource = existsSync(sourceRoot);
const WARDROBE_HEIGHT_M = 2.4;
const WALL_AC_HALF_HEIGHT_M = 0.15;
const MIN_MASTER_AC_WARDROBE_CLEARANCE_M = 0.02;
const MIN_VISIBLE_COPLANAR_SEPARATION_M = 0.005;

describe("smart-home starter contract", () => {
  it("freezes complete SHIP placement and explicit semantic node keys", () => {
    expect(() => assertLayoutContract()).not.toThrow();
    expect(SHIP_ASSET_ALLOWLIST).toHaveLength(38);
    expect(SMART_HOME_INSTANCES).toHaveLength(61);
    expect(SMART_HOME_VIEWS).toHaveLength(5);
    expect(DEVICE_TARGETS.map((target) => target.storyState).sort()).toEqual([
      "alarm",
      "normal",
      "normal",
      "normal",
      "offline",
    ]);
    expect(EXCLUDED_ASSETS).toEqual([
      expect.objectContaining({ id: "smart_toilet", reason: expect.stringContaining("NO-SHIP") }),
      expect.objectContaining({
        id: "recessed_downlight",
        reason: expect.stringContaining("NO-SHIP"),
      }),
    ]);
    expect(SMART_HOME_INSTANCES.some((item) => item.assetId === "smart_toilet")).toBe(false);
    expect(SMART_HOME_INSTANCES.some((item) => item.assetId === "recessed_downlight")).toBe(false);
    expect(SEMANTIC_NODE_INDEX).toEqual([
      expect.objectContaining({ semanticTargetId: "STATE_EMITTER", nodeIndex: 6 }),
      expect.objectContaining({ semanticTargetId: "STATE_DISPLAY", nodeIndex: 76 }),
      expect.objectContaining({ semanticTargetId: "STATE_LED", nodeIndex: 147 }),
      expect.objectContaining({ semanticTargetId: "STATE_SCREEN", nodeIndex: 102 }),
      expect.objectContaining({ semanticTargetId: "STATE_MOTION", nodeIndex: 64 }),
    ]);
  });

  it("keeps the master air conditioner clear of the wardrobe top", () => {
    const wardrobe = SMART_HOME_INSTANCES.find((item) => item.id === "master-wardrobe");
    const airConditioner = SMART_HOME_INSTANCES.find((item) => item.id === "master-ac");
    if (wardrobe === undefined || airConditioner === undefined) {
      throw new Error("Master bedroom layout fixtures are missing.");
    }

    const wardrobeTop = wardrobe.position[1] + WARDROBE_HEIGHT_M;
    const airConditionerBottom = airConditioner.position[1] - WALL_AC_HALF_HEIGHT_M;
    expect(airConditionerBottom - wardrobeTop).toBeGreaterThanOrEqual(
      MIN_MASTER_AC_WARDROBE_CLEARANCE_M,
    );
  });

  it("keeps visible kitchen instance surfaces off audited coplanar planes", () => {
    const cabinet = requireInstance("kitchen-cabinet");
    const dishwasher = requireInstance("kitchen-dishwasher");
    const cooktop = requireInstance("kitchen-cooktop");
    const faucet = requireInstance("kitchen-faucet");
    const separations = [
      separation(cabinet.position[0] - 1.8, 2.25),
      separation(faucet.position[1], cabinet.position[1] + 0.92),
      separation(dishwasher.position[1] + 0.15, cabinet.position[1] + 0.15),
      separation(dishwasher.position[2] + 0.08, cabinet.position[2] + 0.18),
      separation(cooktop.position[2] - 0.26, cabinet.position[2] - 0.31),
      separation(cooktop.position[0] + 0.091, cabinet.position[0] - 0.609),
      separation(cooktop.position[0] + 0.109, cabinet.position[0] - 0.591),
    ];

    for (const value of separations) {
      expect(value).toBeGreaterThanOrEqual(MIN_VISIBLE_COPLANAR_SEPARATION_M);
    }
  });

  it("builds an ordinary SceneDocument 1.4 with runtime-backed state pointers", () => {
    const document = buildSmartHomeDocument(syntheticAudit());
    const scenario = mockScenario("multi-status-cycle");
    if (scenario === null) throw new Error("multi-status-cycle must exist");
    expect(document.schemaVersion).toBe("1.4.0");
    expect(document.assets).toHaveLength(39);
    expect(document.entities).toHaveLength(70);
    expect(document.assets).toContainEqual(
      expect.objectContaining({
        id: PRESENTATION_SHELL_ASSET_ID,
        sha256: PRESENTATION_SHELL_SHA256,
        byteLength: 13_908,
        stats: {
          nodeCount: 36,
          meshCount: 35,
          materialCount: 10,
          triangleCount: 420,
        },
      }),
    );
    expect(document.entities).toContainEqual(
      expect.objectContaining({
        id: PRESENTATION_SHELL_ENTITY_ID,
        type: "asset",
        assetId: PRESENTATION_SHELL_ASSET_ID,
        visible: true,
        locked: true,
        metadata: expect.objectContaining({
          fixtureRole: "presentation-shell",
          licenseId: "CC0-1.0",
          sourceFloorplanSha256: "11acb6ad855f243f62211ef58b9c7b99f64a08ac09bb9a797159d272e41f8f9d",
        }),
      }),
    );
    expect(document.entities).toContainEqual(
      expect.objectContaining({
        id: "home-shell",
        type: "asset",
        assetId: "home_shell",
        visible: false,
      }),
    );
    const entitiesById = new Map(document.entities.map((entity) => [entity.id, entity]));
    for (const item of SMART_HOME_INSTANCES) {
      const entity = entitiesById.get(item.id);
      if (entity === undefined) throw new Error(`Missing generated entity ${item.id}.`);
      const hidden =
        item.id === "home-shell" || PRESENTATION_DEFAULT_HIDDEN_ASSET_IDS.includes(item.assetId);
      expect(entity.visible, item.id).toBe(!hidden);
      if (item.id !== "home-shell") expect(entity.locked, item.id).toBe(false);
    }
    expect(
      SMART_HOME_INSTANCES.filter((item) =>
        PRESENTATION_DEFAULT_HIDDEN_ASSET_IDS.includes(item.assetId),
      ),
    ).toHaveLength(17);
    expect(document.environment.grid).toBe(false);
    expect(document.targets.map((target) => target.nodeIndex)).toEqual([6, 76, 147, 102, 64]);
    expect(document.bindings.map((binding) => binding.pointer)).toEqual([
      "/channels/channel-a/status",
      "/channels/channel-b/status",
      "/channels/channel-c/status",
      "/channels/channel-a/status",
      "/channels/channel-a/status",
    ]);
    expect([...new Set(document.bindings.map((binding) => binding.pointer))].sort()).toEqual(
      Object.keys(scenario.suggestedValues).sort(),
    );
    expect(DEVICE_TARGETS.map((target) => readPointer(scenario.sample, target.pointer))).toEqual([
      "ready",
      "offline",
      "alarm",
      "ready",
      "ready",
    ]);
    for (const binding of document.bindings) {
      expect(scenario.suggestedValues[binding.pointer]).toEqual(["ready", "offline", "alarm"]);
      expect(binding.writes).toEqual(["color", "alarm"]);
    }
    expect(JSON.stringify(document.ruleSets)).not.toContain('"type":"label"');
    expect(document.dataSources).toEqual([
      expect.objectContaining({
        adapter: "mock",
        options: expect.objectContaining({ scenario: "multi-status-cycle" }),
      }),
    ]);
    expect(document).not.toHaveProperty("rooms");
    expect(JSON.stringify(document)).not.toContain("currentValue");
    expect(validateSceneDocument(document)).toEqual(expect.objectContaining({ ok: true }));
  });

  it("pins the tracked presentation-shell CC0 declaration", async () => {
    await expect(validatePresentationShellLicense()).resolves.toBeUndefined();
  });

  it("keeps unlicensed local output under /home/cc/tmp", () => {
    expect(() =>
      assertOutputPolicy("/home/cc/tmp/smart-home-test", "local-validation"),
    ).not.toThrow();
    expect(() =>
      assertOutputPolicy(
        "/home/cc/code1/web-3d-data-scene-platform/apps/studio/public/starter",
        "local-validation",
      ),
    ).toThrow(/must stay below/);
    expect(() => assertOutputPolicy("relative/output", "local-validation")).toThrow(/absolute/);
  });

  it("requires a hash-bound full redistribution authorization", async () => {
    await expect(validateLicenseAuthorization("relative-authorization.json")).rejects.toThrow(
      /must be absolute/,
    );
    const directory = await mkdtemp(resolve(tmpdir(), "smart-home-license-test-"));
    const licenseText = "Test-only redistribution terms. This is not an asset license.";
    const licenseTextPath = resolve(directory, "LICENSE.txt");
    await writeFile(licenseTextPath, licenseText);
    const recordPath = resolve(directory, "authorization.json");
    const record = {
      schemaVersion: "1.0.0",
      redistributionAuthorized: true,
      copyrightOwner: "TEST FIXTURE ONLY",
      licenseId: "LicenseRef-Test-Only",
      licenseTextPath: "LICENSE.txt",
      licenseTextSha256: sha256(licenseText),
      coveredAssetSha256: SHIP_ASSET_ALLOWLIST.map((asset) => asset.sha256),
    };
    expect(record.coveredAssetSha256).toHaveLength(38);
    expect(record.coveredAssetSha256).not.toContain(PRESENTATION_SHELL_SHA256);
    await writeFile(recordPath, JSON.stringify(record));
    await expect(validateLicenseAuthorization(recordPath)).resolves.toEqual(
      expect.objectContaining({ status: "authorized", copyrightOwner: "TEST FIXTURE ONLY" }),
    );

    await writeFile(
      recordPath,
      JSON.stringify({ ...record, coveredAssetSha256: record.coveredAssetSha256.slice(1) }),
    );
    await expect(validateLicenseAuthorization(recordPath)).rejects.toThrow(
      /license-covered asset hashes mismatch/,
    );
  });
});

describe.skipIf(!hasOwnerSource)("owner smart-home source integration", () => {
  it("generates a byte-frozen CC0 Y-up shell from the hash-bound owner floorplan", async () => {
    const floorplanBytes = await readFile(resolve(sourceRoot, "00_specs/floorplan.json"));
    const first = buildPresentationShellAsset(floorplanBytes);
    const second = buildPresentationShellAsset(floorplanBytes);
    expect(first.sha256).toBe(PRESENTATION_SHELL_SHA256);
    expect(first.byteLength).toBe(13_908);
    expect(Buffer.compare(Buffer.from(first.bytes), Buffer.from(second.bytes))).toBe(0);
    expect(first.provenance).toEqual(
      expect.objectContaining({
        floorplanPath: "00_specs/floorplan.json",
        coordinateSystem: expect.stringContaining("glTF Y-up"),
        roomFloorCount: 8,
        wallSegmentCount: 27,
        floorThicknessM: 0.04,
        exteriorWallHeightM: 0.28,
        interiorWallHeightM: 0.22,
        licenseId: "CC0-1.0",
      }),
    );
    const inspection = await inspectGltf(
      "presentation-shell.glb",
      first.bytes.buffer.slice(
        first.bytes.byteOffset,
        first.bytes.byteOffset + first.bytes.byteLength,
      ),
    );
    expect(inspection.sha256).toBe(PRESENTATION_SHELL_SHA256);
    expect(inspection.stats).toEqual({
      nodeCount: 36,
      meshCount: 35,
      materialCount: 10,
      triangleCount: 420,
    });
    expect(inspection.warnings).toEqual([]);
  });

  it("hard-validates every frozen manifest and GLB", async () => {
    const audit = await auditSmartHomeSource(sourceRoot);
    expect(audit.assets).toHaveLength(38);
    expect(audit.totalAssetBytes).toBe(13_495_168);
    expect(audit.totalUniqueTriangles).toBe(282_094);
    expect(audit.presentationShell).toEqual(
      expect.objectContaining({ sha256: PRESENTATION_SHELL_SHA256, byteLength: 13_908 }),
    );
    expect(audit.assets.every((asset) => asset.nodeCount > 0 && asset.meshCount > 0)).toBe(true);
  }, 60_000);

  it("rejects a stale manifest contract before accepting asset bytes", async () => {
    await expect(
      auditAssetAgainstAllowlist(sourceRoot, {
        ...SHIP_ASSET_ALLOWLIST[0],
        triangles: SHIP_ASSET_ALLOWLIST[0].triangles + 1,
      }),
    ).rejects.toThrow(/manifest triangles mismatch/);
  });

  it("exports byte-identical archives and round-trips all assets", async () => {
    const audit = await auditSmartHomeSource(sourceRoot);
    const document = buildSmartHomeDocument(audit);
    const assets = new Map(
      [...audit.assets, audit.presentationShell].map((asset) => [asset.sha256, asset.bytes]),
    );
    const first = await exportSceneArchive({
      document,
      createdAt: ARCHIVE_CREATED_AT,
      resolveAssetBytes: assets,
    });
    const second = await exportSceneArchive({
      document,
      createdAt: ARCHIVE_CREATED_AT,
      resolveAssetBytes: assets,
    });
    expect(second.byteLength).toBe(first.byteLength);
    expect(sha256(second)).toBe(sha256(first));
    expect(Buffer.compare(Buffer.from(second), Buffer.from(first))).toBe(0);
    const imported = await importSceneArchive(first);
    expect(imported.document.id).toBe("smart-home-90sqm");
    expect(imported.assets).toHaveLength(39);
    const importedEntities = new Map(
      imported.document.entities.map((entity) => [entity.id, entity]),
    );
    expect(importedEntities.get(PRESENTATION_SHELL_ENTITY_ID)).toEqual(
      expect.objectContaining({ visible: true, locked: true }),
    );
    expect(importedEntities.get("home-shell")).toEqual(
      expect.objectContaining({ visible: false, locked: true }),
    );
    for (const item of SMART_HOME_INSTANCES) {
      const entity = importedEntities.get(item.id);
      if (entity === undefined) throw new Error(`Missing imported entity ${item.id}.`);
      const hidden =
        item.id === "home-shell" || PRESENTATION_DEFAULT_HIDDEN_ASSET_IDS.includes(item.assetId);
      expect(entity.visible, item.id).toBe(!hidden);
    }
    expect(sha256(first)).toMatch(/^[a-f0-9]{64}$/);
  }, 90_000);
});

function syntheticAudit() {
  return {
    assets: SHIP_ASSET_ALLOWLIST.map((asset) => ({
      ...asset,
      nodeCount: 200,
      meshCount: 1,
      materialCount: 1,
      nodeNames: [],
      bytes: new Uint8Array([0]),
    })),
    presentationShell: {
      id: PRESENTATION_SHELL_ASSET_ID,
      name: "Presentation Shell",
      sha256: PRESENTATION_SHELL_SHA256,
      byteLength: 13_908,
      nodeCount: 36,
      meshCount: 35,
      materialCount: 10,
      triangles: 420,
      provenance: {
        generator: "scripts/smart-home/presentation-shell.mjs",
        floorplanPath: "00_specs/floorplan.json",
        floorplanSha256: "11acb6ad855f243f62211ef58b9c7b99f64a08ac09bb9a797159d272e41f8f9d",
        licenseId: "CC0-1.0",
      },
    },
  };
}

function requireInstance(id) {
  const value = SMART_HOME_INSTANCES.find((item) => item.id === id);
  if (value === undefined) throw new Error(`Smart-home layout fixture ${id} is missing.`);
  return value;
}

function separation(left, right) {
  return Math.abs(left - right);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function readPointer(value, pointer) {
  return pointer
    .slice(1)
    .split("/")
    .reduce((current, segment) => current?.[segment], value);
}
