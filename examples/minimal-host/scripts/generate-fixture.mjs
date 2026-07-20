import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { createServer } from "vite";

const packageRoot = resolve(import.meta.dirname, "..");
const repoRoot = resolve(packageRoot, "../..");
const sourceAssetPath = resolve(repoRoot, "tests/fixtures/m0-factory/public/m0-factory-cell.glb");
const publicRoot = resolve(packageRoot, "public");
const publishedRoot = resolve(publicRoot, "published");
const sourceAsset = new Uint8Array(await readFile(sourceAssetPath));
const sourceAssetSha256 = sha256(sourceAsset);
const document = publishedDocument(sourceAssetSha256, sourceAsset.byteLength);
const evidence = [
  {
    annotationId: "press-inspection",
    documentId: document.id,
    documentRevision: document.revision,
    resolution: "resolved",
  },
];

const server = await createServer({
  root: repoRoot,
  appType: "custom",
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true },
});

try {
  const { createPublishBundle, inspectPublishReadiness } = await server.ssrLoadModule(
    "/packages/publish/src/index.ts",
  );
  const build = async () => {
    const readiness = await inspectPublishReadiness({
      document,
      surfaceEvidence: evidence,
      resolveAssetBytes(sha256Value) {
        if (sha256Value !== sourceAssetSha256) throw new Error("Unexpected fixture asset request.");
        return sourceAsset;
      },
    });
    if (!readiness.ok) {
      throw new Error(`Published fixture is blocked: ${readiness.blockers[0]?.code ?? "unknown"}.`);
    }
    return createPublishBundle(readiness.value);
  };

  const first = await build();
  const second = await build();
  assert.deepEqual([...first.files.keys()], [...second.files.keys()]);
  for (const [path, bytes] of first.files) assert.deepEqual(bytes, second.files.get(path));
  assert.deepEqual(first.zipBytes, second.zipBytes);

  await rm(publishedRoot, { force: true, recursive: true });
  await mkdir(publishedRoot, { recursive: true });
  await Promise.all(
    [...first.files].map(async ([path, bytes]) => {
      const output = resolve(publishedRoot, ...path.split("/"));
      await mkdir(dirname(output), { recursive: true });
      await writeFile(output, bytes);
    }),
  );
  await writeFile(resolve(publicRoot, "published-factory.web3d.zip"), first.zipBytes);
  await writeFile(
    resolve(publicRoot, "fixture-report.json"),
    `${JSON.stringify(
      {
        fixtureVersion: 1,
        documentId: first.manifest.documentId,
        revision: first.manifest.revision,
        sourceAsset: {
          path: "tests/fixtures/m0-factory/public/m0-factory-cell.glb",
          sha256: sourceAssetSha256,
          byteLength: sourceAsset.byteLength,
          license: "CC0-1.0",
        },
        files: [...first.files].map(([path, bytes]) => ({
          path,
          byteLength: bytes.byteLength,
          sha256: sha256(bytes),
        })),
        zip: {
          path: "published-factory.web3d.zip",
          byteLength: first.zipBytes.byteLength,
          sha256: sha256(first.zipBytes),
        },
      },
      null,
      2,
    )}\n`,
  );
  process.stdout.write(
    `minimal-host-fixture status=generated document=${first.manifest.documentId} revision=${first.manifest.revision} files=${first.files.size} zipSha256=${sha256(first.zipBytes)}\n`,
  );
} finally {
  await server.close();
}

function publishedDocument(assetSha256, byteLength) {
  return {
    schemaVersion: "1.4.0",
    id: "published-factory-scene",
    name: "Published Factory Scene",
    revision: 4,
    assets: [
      {
        id: "factory-cell-asset",
        name: "M0 Factory Cell",
        uri: `asset://${assetSha256}`,
        mediaType: "model/gltf-binary",
        sha256: assetSha256,
        byteLength,
        stats: { nodeCount: 2, meshCount: 1, materialCount: 1, triangleCount: 12 },
      },
    ],
    entities: [
      {
        id: "factory-cell",
        type: "asset",
        parentId: null,
        name: "Factory Cell",
        visible: true,
        locked: false,
        transform: {
          position: [0, 0, 0],
          rotation: [0, 0, 0, 1],
          scale: [1, 1, 1],
        },
        assetId: "factory-cell-asset",
        metadata: { fixtureRole: "published-host" },
      },
    ],
    targets: [
      target("press-01", "Press 01", "PRESS-01", 0, assetSha256),
      target("conveyor-01", "Conveyor 01", "CONVEYOR-01", 1, assetSha256),
    ],
    dataSources: [
      {
        id: "factory-telemetry",
        name: "Factory Telemetry",
        adapter: "mock",
        staleAfterMs: 30000,
        offlineAfterMs: 60000,
        options: { scenario: "status-cycle" },
      },
    ],
    bindings: [binding("press-01"), binding("conveyor-01")],
    ruleSets: [
      {
        id: "equipment-status",
        name: "Equipment Status",
        rules: [
          {
            id: "status-ready",
            priority: 100,
            when: { fact: "value", operator: "eq", expected: "ready" },
            effects: [
              { type: "color", value: "#1E8A68" },
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
    annotations: [
      {
        id: "press-inspection",
        title: "Press inspection",
        visible: true,
        locked: false,
        anchor: {
          kind: "surface",
          entityId: "factory-cell",
          assetHash: assetSha256,
          nodeIndex: 0,
          nodeLocalPosition: [0, 0.5, 0],
          nodeLocalNormal: [0, 1, 0],
        },
        content: { kind: "host-content", key: "inspection-card" },
        action: { type: "show-content" },
      },
    ],
    views: [
      {
        id: "factory-overview",
        name: "Factory Overview",
        position: [7.5, 5.5, 8.5],
        target: [0, 0.75, 0],
        fov: 42,
      },
    ],
    environment: {
      background: "#F3F6F4",
      backgroundMode: "custom",
      grid: true,
      unit: "m",
      upAxis: "Y",
      lighting: {
        fill: { skyColor: "#FFFFFF", groundColor: "#65706A", intensity: 1.8 },
        key: {
          color: "#FFFFFF",
          intensity: 2.2,
          directionToLight: [0.37904902178945177, 0.7580980435789035, 0.5306686305052324],
        },
      },
    },
  };
}

function target(id, name, businessId, nodeIndex, assetHash) {
  return {
    id,
    entityId: "factory-cell",
    name,
    businessId,
    assetHash,
    nodeIndex,
    metadata: { equipmentType: id.startsWith("press") ? "press" : "conveyor" },
  };
}

function binding(targetId) {
  return {
    id: `${targetId}-status-binding`,
    targetId,
    sourceId: "factory-telemetry",
    pointer: "/telemetry/status",
    ruleSetId: "equipment-status",
    writes: ["color", "alarm"],
    enabled: true,
  };
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}
