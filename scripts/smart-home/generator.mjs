import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, realpath, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import { TextDecoder } from "node:util";

import {
  EXCLUDED_ASSETS,
  SEMANTIC_NODE_INDEX,
  SHIP_ASSET_ALLOWLIST,
  SOURCE_SNAPSHOT,
} from "./allowlist.mjs";
import { DEVICE_TARGETS, ROOM_GROUPS, SMART_HOME_INSTANCES, SMART_HOME_VIEWS } from "./layout.mjs";
import {
  buildPresentationShellAsset,
  PRESENTATION_DEFAULT_HIDDEN_ASSET_IDS,
  PRESENTATION_SHELL_ENTITY_ID,
  presentationShellReport,
  validatePresentationShellLicense,
} from "./presentation-shell.mjs";

export const PROJECT_ID = "smart-home-90sqm";
export const ARCHIVE_FILE_NAME = "smart-home-90sqm.web3d.zip";
export const DESCRIPTOR_FILE_NAME = "descriptor.json";
export const REPORT_FILE_NAME = "generation-report.json";
export const ARCHIVE_CREATED_AT = "2026-07-20T00:00:00.000Z";
export const DEFAULT_ARCHIVE_URL = `/starter/${ARCHIVE_FILE_NAME}`;
export const LOCAL_VALIDATION_ROOT = "/home/cc/tmp";

export async function auditSmartHomeSource(sourceRoot) {
  if (!isAbsolute(sourceRoot)) {
    throw new Error("Smart-home source root must be an absolute path.");
  }

  await assertSourceSnapshot(sourceRoot);
  await validatePresentationShellLicense();
  assertLayoutContract();

  const allowedManifestPaths = new Set(SHIP_ASSET_ALLOWLIST.map((asset) => asset.manifestPath));
  const excludedManifestPaths = new Set(EXCLUDED_ASSETS.map((asset) => asset.manifestPath));
  const discoveredManifestPaths = await findManifestPaths(sourceRoot);
  const expectedManifestPaths = [...allowedManifestPaths, ...excludedManifestPaths].sort(compare);
  assertEqualLists(discoveredManifestPaths, expectedManifestPaths, "source manifest paths");

  for (const excluded of EXCLUDED_ASSETS) {
    const manifest = await readJson(resolveInside(sourceRoot, excluded.manifestPath));
    const file = requireSingleFile(manifest, excluded.id);
    assertEqual(manifest.assetId, excluded.id, `${excluded.id} manifest assetId`);
    assertEqual(manifest.qa?.verdict, "NO-SHIP", `${excluded.id} manifest verdict`);
    assertEqual(file.sha256, excluded.sha256, `${excluded.id} excluded hash`);
  }

  const assets = [];
  for (const expected of SHIP_ASSET_ALLOWLIST) {
    assets.push(await auditAssetAgainstAllowlist(sourceRoot, expected));
  }
  assertSemanticNodeMap(assets);
  const floorplanBytes = await readFile(resolveInside(sourceRoot, SOURCE_SNAPSHOT.floorplan.path));
  const presentationShell = buildPresentationShellAsset(floorplanBytes);

  return Object.freeze({
    sourceRoot,
    assets: Object.freeze(assets),
    totalAssetBytes: assets.reduce((total, asset) => total + asset.byteLength, 0),
    totalUniqueTriangles: assets.reduce((total, asset) => total + asset.triangles, 0),
    presentationShell,
  });
}

export function buildSmartHomeDocument(audit) {
  const presentationShell = audit.presentationShell;
  if (presentationShell === undefined) {
    throw new Error("Smart-home audit must include the generated presentation shell.");
  }
  const allAssets = [...audit.assets, presentationShell];
  const assetsById = new Map(allAssets.map((asset) => [asset.id, asset]));
  const entitiesById = new Map(SMART_HOME_INSTANCES.map((item) => [item.id, item]));
  const roomEntityIdBySlug = new Map(ROOM_GROUPS.map(([id, , slug]) => [slug, id]));

  const roomEntities = ROOM_GROUPS.map(([id, name, slug]) => ({
    id,
    type: "group",
    parentId: null,
    name,
    visible: true,
    locked: false,
    transform: identityTransform(),
    metadata: { room: slug },
  }));

  const instanceEntities = SMART_HOME_INSTANCES.map((item) => {
    const asset = requireMapValue(assetsById, item.assetId, `layout asset ${item.assetId}`);
    return {
      id: item.id,
      type: "asset",
      parentId: roomEntityIdBySlug.get(item.room) ?? null,
      name: item.name,
      visible:
        item.id !== "home-shell" && !PRESENTATION_DEFAULT_HIDDEN_ASSET_IDS.includes(item.assetId),
      locked: item.id === "home-shell",
      transform: {
        position: item.position,
        rotation: item.rotation,
        scale: item.scale,
      },
      assetId: asset.id,
      metadata: {
        room: item.room,
        fixtureRole: item.id === "home-shell" ? "architecture" : "smart-home-instance",
      },
    };
  });

  const presentationEntity = {
    id: PRESENTATION_SHELL_ENTITY_ID,
    type: "asset",
    parentId: null,
    name: "Presentation Shell",
    visible: true,
    locked: true,
    transform: identityTransform(),
    assetId: presentationShell.id,
    metadata: {
      fixtureRole: "presentation-shell",
      provenance: presentationShell.provenance.generator,
      sourceFloorplanSha256: presentationShell.provenance.floorplanSha256,
      licenseId: presentationShell.provenance.licenseId,
      assetSha256: presentationShell.sha256,
    },
  };

  const targets = DEVICE_TARGETS.map((target) => {
    const entity = requireMapValue(
      entitiesById,
      target.entityId,
      `target entity ${target.entityId}`,
    );
    const asset = requireMapValue(assetsById, entity.assetId, `target asset ${entity.assetId}`);
    const mappedNode = resolveSemanticNode(asset.sha256, target.semanticTargetId);
    return {
      id: target.id,
      entityId: target.entityId,
      name: target.name,
      businessId: target.businessId,
      assetHash: asset.sha256,
      nodeIndex: mappedNode.nodeIndex,
      metadata: {
        semanticTargetId: target.semanticTargetId,
        storyState: target.storyState,
      },
    };
  });

  return {
    schemaVersion: "1.4.0",
    id: PROJECT_ID,
    name: "90 m2 Smart Home",
    revision: 1,
    assets: allAssets.map((asset) => ({
      id: asset.id,
      name: asset.name,
      uri: `asset://${asset.sha256}`,
      mediaType: "model/gltf-binary",
      sha256: asset.sha256,
      byteLength: asset.byteLength,
      stats: {
        nodeCount: asset.nodeCount,
        meshCount: asset.meshCount,
        materialCount: asset.materialCount,
        triangleCount: asset.triangles,
      },
    })),
    entities: [presentationEntity, ...roomEntities, ...instanceEntities],
    targets,
    dataSources: [
      {
        id: "smart-home-demo-source",
        name: "Smart Home Demo Source",
        adapter: "mock",
        staleAfterMs: 30_000,
        offlineAfterMs: 60_000,
        options: { scenario: "multi-status-cycle", seed: 90, defaultSpeed: 1 },
      },
    ],
    bindings: DEVICE_TARGETS.map((target) => ({
      id: `${target.id}-binding`,
      targetId: target.id,
      sourceId: "smart-home-demo-source",
      pointer: target.pointer,
      ruleSetId: "device-status",
      writes: ["color", "alarm"],
      enabled: true,
    })),
    ruleSets: [
      {
        id: "device-status",
        name: "Device Status",
        rules: [
          {
            id: "device-alarm",
            priority: 300,
            when: { fact: "value", operator: "eq", expected: "alarm" },
            effects: [
              { type: "color", value: "#C6352B" },
              { type: "alarm", level: "critical", message: "Device alarm" },
            ],
          },
          {
            id: "device-application-offline",
            priority: 200,
            when: { fact: "value", operator: "eq", expected: "offline" },
            effects: [
              { type: "color", value: "#66736D" },
              { type: "alarm", level: "warning", message: "Device offline" },
            ],
          },
          {
            id: "device-ready",
            priority: 100,
            when: { fact: "value", operator: "eq", expected: "ready" },
            effects: [
              { type: "color", value: "#21866F" },
              { type: "alarm", level: "none", message: "" },
            ],
          },
        ],
        fallback: [
          { type: "color", value: "#A96800" },
          { type: "alarm", level: "info", message: "Status unavailable" },
        ],
      },
    ],
    annotations: [],
    views: SMART_HOME_VIEWS,
    environment: {
      backgroundMode: "custom",
      background: "#E7EBE8",
      grid: false,
      unit: "m",
      upAxis: "Y",
      lighting: {
        fill: { skyColor: "#F8FAF8", groundColor: "#788078", intensity: 1.6 },
        key: {
          color: "#FFF4DE",
          intensity: 2.2,
          directionToLight: [0.4082482904638631, 0.8164965809277261, 0.4082482904638631],
        },
      },
    },
  };
}

export async function generateSmartHomeStarter(options) {
  const mode = options.mode ?? "local-validation";
  const archiveUrl = options.archiveUrl ?? DEFAULT_ARCHIVE_URL;
  assertOutputPolicy(options.outputDirectory, mode);

  const audit = await auditSmartHomeSource(options.sourceRoot);
  const licenseGate = options.licenseRecordPath
    ? await validateLicenseAuthorization(options.licenseRecordPath)
    : Object.freeze({ status: "blocked", reason: "No redistribution authorization record." });
  if (mode === "public" && licenseGate.status !== "authorized") {
    throw new Error(`Public starter generation blocked: ${licenseGate.reason}`);
  }

  const document = buildSmartHomeDocument(audit);
  const bytesByHash = new Map(
    [...audit.assets, audit.presentationShell].map((asset) => [asset.sha256, asset.bytes]),
  );
  const archiveBytes = await options.exportSceneArchive({
    document,
    createdAt: ARCHIVE_CREATED_AT,
    resolveAssetBytes: bytesByHash,
  });
  const archiveSha256 = sha256(archiveBytes);
  const descriptor = Object.freeze({
    schemaVersion: "1.0.0",
    projectId: PROJECT_ID,
    archiveUrl,
    archiveSha256,
    archiveByteLength: archiveBytes.byteLength,
  });

  if (options.importSceneArchive) {
    const imported = await options.importSceneArchive(archiveBytes);
    assertEqual(imported.document.id, PROJECT_ID, "archive round-trip project id");
    assertEqual(imported.assets.length, SHIP_ASSET_ALLOWLIST.length + 1, "archive asset count");
  }

  const outputDirectory = resolve(options.outputDirectory);
  await mkdir(outputDirectory, { recursive: true });
  await assertResolvedOutputPolicy(outputDirectory, mode);
  await Promise.all([
    writeFile(resolve(outputDirectory, ARCHIVE_FILE_NAME), archiveBytes),
    writeJson(resolve(outputDirectory, DESCRIPTOR_FILE_NAME), descriptor),
  ]);

  const report = {
    schemaVersion: "1.0.0",
    projectId: PROJECT_ID,
    distributionMode: mode,
    licenseGate,
    sourceSnapshot: SOURCE_SNAPSHOT,
    excludedAssets: EXCLUDED_ASSETS,
    assetCount: audit.assets.length + 1,
    externalAssetCount: audit.assets.length,
    instanceCount: SMART_HOME_INSTANCES.length + 1,
    externalInstanceCount: SMART_HOME_INSTANCES.length,
    targetCount: DEVICE_TARGETS.length,
    totalAssetBytes: audit.totalAssetBytes + audit.presentationShell.byteLength,
    externalAssetBytes: audit.totalAssetBytes,
    totalUniqueTriangles: audit.totalUniqueTriangles + audit.presentationShell.triangles,
    externalUniqueTriangles: audit.totalUniqueTriangles,
    presentationShell: presentationShellReport(audit.presentationShell),
    archive: {
      path: ARCHIVE_FILE_NAME,
      sha256: archiveSha256,
      byteLength: archiveBytes.byteLength,
    },
    descriptor,
  };
  await writeJson(resolve(outputDirectory, REPORT_FILE_NAME), report);
  return Object.freeze({ audit, document, archiveBytes, descriptor, report });
}

export async function validateLicenseAuthorization(recordPath) {
  if (!isAbsolute(recordPath)) {
    throw new Error("License authorization record path must be absolute.");
  }
  const record = await readJson(recordPath);
  if (record.schemaVersion !== "1.0.0") {
    throw new Error("License authorization schemaVersion must be 1.0.0.");
  }
  if (record.redistributionAuthorized !== true) {
    throw new Error("License authorization must explicitly allow public redistribution.");
  }
  requireNonEmptyString(record.copyrightOwner, "license copyrightOwner");
  requireNonEmptyString(record.licenseId, "license licenseId");
  requireNonEmptyString(record.licenseTextPath, "license licenseTextPath");
  requireSha256(record.licenseTextSha256, "license licenseTextSha256");

  const expectedHashes = SHIP_ASSET_ALLOWLIST.map((asset) => asset.sha256).sort(compare);
  if (!Array.isArray(record.coveredAssetSha256)) {
    throw new Error("License authorization coveredAssetSha256 must be an array.");
  }
  const coveredHashes = [...record.coveredAssetSha256].sort(compare);
  assertEqualLists(coveredHashes, expectedHashes, "license-covered asset hashes");

  const licenseTextPath = resolveInside(dirname(resolve(recordPath)), record.licenseTextPath);
  const licenseText = await readFile(licenseTextPath);
  if (licenseText.byteLength < 20) {
    throw new Error("License text must contain the complete redistribution terms.");
  }
  assertEqual(sha256(licenseText), record.licenseTextSha256, "license text hash");

  return Object.freeze({
    status: "authorized",
    copyrightOwner: record.copyrightOwner,
    licenseId: record.licenseId,
    licenseTextSha256: record.licenseTextSha256,
  });
}

export function assertLayoutContract() {
  const allowlistIds = SHIP_ASSET_ALLOWLIST.map((asset) => asset.id).sort(compare);
  const placedIds = [...new Set(SMART_HOME_INSTANCES.map((item) => item.assetId))].sort(compare);
  assertEqualLists(placedIds, allowlistIds, "placed allowlist asset ids");

  const excludedIds = new Set(EXCLUDED_ASSETS.map((asset) => asset.id));
  for (const item of SMART_HOME_INSTANCES) {
    if (excludedIds.has(item.assetId)) {
      throw new Error(`Excluded asset ${item.assetId} appears in the layout.`);
    }
  }
  assertUnique(
    SMART_HOME_INSTANCES.map((item) => item.id),
    "instance ids",
  );
  assertUnique(
    DEVICE_TARGETS.map((target) => target.id),
    "target ids",
  );
  assertUnique(
    SMART_HOME_VIEWS.map((view) => view.id),
    "view ids",
  );
  assertUnique(
    SEMANTIC_NODE_INDEX.map((target) => `${target.assetHash}:${target.semanticTargetId}`),
    "semantic node keys",
  );
}

export function assertOutputPolicy(outputDirectory, mode) {
  if (!isAbsolute(outputDirectory)) {
    throw new Error("Starter output directory must be an absolute path.");
  }
  if (mode !== "local-validation" && mode !== "public") {
    throw new Error(`Unknown starter generation mode ${mode}.`);
  }
  if (mode === "local-validation") {
    const output = resolve(outputDirectory);
    const relativePath = relative(LOCAL_VALIDATION_ROOT, output);
    if (relativePath === "" || relativePath.startsWith("..") || isAbsolute(relativePath)) {
      throw new Error(
        `Unlicensed local validation output must stay below ${LOCAL_VALIDATION_ROOT}.`,
      );
    }
  }
}

async function assertResolvedOutputPolicy(outputDirectory, mode) {
  if (mode !== "local-validation") return;
  const resolvedOutput = await realpath(outputDirectory);
  const resolvedLocalRoot = await realpath(LOCAL_VALIDATION_ROOT);
  const relativePath = relative(resolvedLocalRoot, resolvedOutput);
  if (relativePath === "" || relativePath.startsWith("..") || isAbsolute(relativePath)) {
    throw new Error(
      `Unlicensed local validation output resolves outside ${LOCAL_VALIDATION_ROOT}.`,
    );
  }
}

async function assertSourceSnapshot(sourceRoot) {
  for (const item of Object.values(SOURCE_SNAPSHOT)) {
    const bytes = await readFile(resolveInside(sourceRoot, item.path));
    assertEqual(sha256(bytes), item.sha256, `source snapshot ${item.path}`);
  }

  const registry = await readJson(resolveInside(sourceRoot, SOURCE_SNAPSHOT.registry.path));
  assertEqual(registry.project_id, "smart_home_90sqm", "source registry project_id");
  assertEqual(registry.asset_family_count, 55, "source registry asset family count");
  assertEqual(registry.assets?.length, 55, "source registry asset entry count");
}

export async function auditAssetAgainstAllowlist(sourceRoot, expected) {
  const manifest = await readJson(resolveInside(sourceRoot, expected.manifestPath));
  const file = requireSingleFile(manifest, expected.id);
  assertEqual(manifest.assetId, expected.id, `${expected.id} manifest assetId`);
  assertEqual(manifest.qa?.verdict, "SHIP", `${expected.id} manifest verdict`);
  assertEqual(manifest.validation?.gltfValidatorErrors, 0, `${expected.id} validator errors`);
  assertEqual(manifest.validation?.threeJsLoad, "PASS", `${expected.id} Three.js load gate`);
  assertEqual(file.path, basename(expected.glbPath), `${expected.id} manifest GLB path`);
  assertEqual(file.sha256, expected.sha256, `${expected.id} manifest hash`);
  assertEqual(file.byteLength, expected.byteLength, `${expected.id} manifest byteLength`);
  assertEqual(file.triangles, expected.triangles, `${expected.id} manifest triangles`);

  const bytes = new Uint8Array(await readFile(resolveInside(sourceRoot, expected.glbPath)));
  assertEqual(bytes.byteLength, expected.byteLength, `${expected.id} GLB byteLength`);
  assertEqual(sha256(bytes), expected.sha256, `${expected.id} GLB hash`);
  const gltf = parseGlbJson(bytes, expected.id);
  assertEqual(gltf.nodes?.length ?? 0, file.nodeCount, `${expected.id} GLB node count`);
  assertEqual(gltf.materials?.length ?? 0, file.materialCount, `${expected.id} GLB material count`);

  return Object.freeze({
    ...expected,
    nodeCount: file.nodeCount,
    meshCount: gltf.meshes?.length ?? 0,
    materialCount: file.materialCount,
    nodeNames: Object.freeze((gltf.nodes ?? []).map((node) => node.name ?? null)),
    bytes,
  });
}

function assertSemanticNodeMap(assets) {
  const assetsByHash = new Map(assets.map((asset) => [asset.sha256, asset]));
  for (const mappedNode of SEMANTIC_NODE_INDEX) {
    const asset = requireMapValue(
      assetsByHash,
      mappedNode.assetHash,
      `semantic map asset ${mappedNode.assetHash}`,
    );
    assertEqual(
      asset.nodeNames[mappedNode.nodeIndex],
      mappedNode.expectedNodeName,
      `${asset.id} node-name assertion at fixed index ${mappedNode.nodeIndex}`,
    );
  }
}

function resolveSemanticNode(assetHash, semanticTargetId) {
  const mappedNode = SEMANTIC_NODE_INDEX.find(
    (item) => item.assetHash === assetHash && item.semanticTargetId === semanticTargetId,
  );
  if (!mappedNode) {
    throw new Error(`Missing semantic node index for ${assetHash}:${semanticTargetId}.`);
  }
  return mappedNode;
}

function parseGlbJson(bytes, assetId) {
  if (bytes.byteLength < 20) throw new Error(`${assetId} GLB is truncated.`);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  assertEqual(view.getUint32(0, true), 0x46546c67, `${assetId} GLB magic`);
  assertEqual(view.getUint32(4, true), 2, `${assetId} GLB version`);
  assertEqual(view.getUint32(8, true), bytes.byteLength, `${assetId} GLB declared length`);
  const jsonLength = view.getUint32(12, true);
  assertEqual(view.getUint32(16, true), 0x4e4f534a, `${assetId} GLB JSON chunk`);
  if (20 + jsonLength > bytes.byteLength) throw new Error(`${assetId} GLB JSON is truncated.`);
  const jsonBytes = bytes.subarray(20, 20 + jsonLength);
  return JSON.parse(new TextDecoder().decode(jsonBytes).trimEnd());
}

async function findManifestPaths(sourceRoot) {
  const paths = [];
  const visit = async (directory, prefix) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      const childPrefix = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) {
        await visit(resolve(directory, entry.name), childPrefix);
      } else if (entry.isFile() && entry.name === "manifest.json") {
        paths.push(childPrefix);
      }
    }
  };
  await visit(sourceRoot, "");
  return paths.sort(compare);
}

function requireSingleFile(manifest, assetId) {
  if (!Array.isArray(manifest.files) || manifest.files.length !== 1) {
    throw new Error(`${assetId} manifest must contain exactly one deliverable file.`);
  }
  return manifest.files[0];
}

function identityTransform() {
  return { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] };
}

function resolveInside(root, childPath) {
  const resolvedRoot = resolve(root);
  const resolvedPath = resolve(resolvedRoot, childPath);
  const relativePath = relative(resolvedRoot, resolvedPath);
  if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
    throw new Error(`Path escapes its root: ${childPath}.`);
  }
  return resolvedPath;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function requireMapValue(map, key, label) {
  const value = map.get(key);
  if (value === undefined) throw new Error(`Missing ${label}.`);
  return value;
}

function requireNonEmptyString(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a non-empty string.`);
  }
}

function requireSha256(value, label) {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) {
    throw new Error(`${label} must be a lowercase SHA-256 value.`);
  }
}

function assertUnique(values, label) {
  if (new Set(values).size !== values.length) throw new Error(`${label} must be unique.`);
}

function assertEqualLists(actual, expected, label) {
  if (
    actual.length !== expected.length ||
    actual.some((value, index) => value !== expected[index])
  ) {
    throw new Error(`${label} mismatch.`);
  }
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label} mismatch: expected ${String(expected)}, received ${String(actual)}.`);
  }
}

function compare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
