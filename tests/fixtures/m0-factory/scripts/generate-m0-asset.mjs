import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const outputDirectory = resolve(scriptDirectory, "../public");

const positions = new Float32Array([
  -0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5, 0.5, 0.5, -0.5, 0.5, 0.5, -0.5, -0.5, -0.5, 0.5, -0.5, -0.5,
  0.5, 0.5, -0.5, -0.5, 0.5, -0.5,
]);

const indices = new Uint16Array([
  0, 1, 2, 0, 2, 3, 1, 5, 6, 1, 6, 2, 5, 4, 7, 5, 7, 6, 4, 0, 3, 4, 3, 7, 3, 2, 6, 3, 6, 7, 4, 5, 1,
  4, 1, 0,
]);

const binaryChunk = Buffer.concat([Buffer.from(positions.buffer), Buffer.from(indices.buffer)]);

const gltf = {
  asset: {
    generator: "web-3d-data-scene-platform M0 fixture generator",
    version: "2.0",
  },
  extensionsUsed: ["KHR_materials_unlit"],
  scene: 0,
  scenes: [{ name: "M0 Factory Cell", nodes: [0, 1] }],
  nodes: [
    {
      name: "PressStation",
      mesh: 0,
      translation: [-1.6, 0.75, 0],
      scale: [1.25, 1.5, 1.15],
    },
    {
      name: "Conveyor",
      mesh: 0,
      translation: [1.25, 0.3, 0],
      scale: [2.8, 0.6, 0.9],
    },
  ],
  meshes: [
    {
      name: "ModuleBox",
      primitives: [
        {
          attributes: { POSITION: 0 },
          indices: 1,
          material: 0,
        },
      ],
    },
  ],
  materials: [
    {
      name: "M0 Neutral",
      pbrMetallicRoughness: {
        baseColorFactor: [0.61, 0.66, 0.63, 1],
        metallicFactor: 0,
        roughnessFactor: 0.85,
      },
      extensions: {
        KHR_materials_unlit: {},
      },
    },
  ],
  buffers: [{ byteLength: binaryChunk.byteLength }],
  bufferViews: [
    {
      buffer: 0,
      byteLength: positions.byteLength,
      byteOffset: 0,
      target: 34962,
    },
    {
      buffer: 0,
      byteLength: indices.byteLength,
      byteOffset: positions.byteLength,
      target: 34963,
    },
  ],
  accessors: [
    {
      bufferView: 0,
      componentType: 5126,
      count: 8,
      max: [0.5, 0.5, 0.5],
      min: [-0.5, -0.5, -0.5],
      type: "VEC3",
    },
    {
      bufferView: 1,
      componentType: 5123,
      count: indices.length,
      max: [7],
      min: [0],
      type: "SCALAR",
    },
  ],
};

function padToFourBytes(buffer, fillByte) {
  const paddingLength = (4 - (buffer.byteLength % 4)) % 4;
  return paddingLength === 0
    ? buffer
    : Buffer.concat([buffer, Buffer.alloc(paddingLength, fillByte)]);
}

function createGlb(json, binary) {
  const jsonChunk = padToFourBytes(Buffer.from(JSON.stringify(json)), 0x20);
  const binaryChunkPadded = padToFourBytes(binary, 0x00);
  const totalLength = 12 + 8 + jsonChunk.byteLength + 8 + binaryChunkPadded.byteLength;
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(totalLength, 8);
  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(jsonChunk.byteLength, 0);
  jsonHeader.writeUInt32LE(0x4e4f534a, 4);
  const binaryHeader = Buffer.alloc(8);
  binaryHeader.writeUInt32LE(binaryChunkPadded.byteLength, 0);
  binaryHeader.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, jsonHeader, jsonChunk, binaryHeader, binaryChunkPadded]);
}

const glb = createGlb(gltf, binaryChunk);
const sha256 = createHash("sha256").update(glb).digest("hex");
const manifest = {
  assetPath: "/m0-factory-cell.glb",
  byteLength: glb.byteLength,
  mediaType: "model/gltf-binary",
  nodeTargets: [
    { businessId: "PRESS-01", nodeIndex: 0, targetId: "press-01" },
    { businessId: "CONVEYOR-01", nodeIndex: 1, targetId: "conveyor-01" },
  ],
  sceneCount: 1,
  sha256,
};

const sceneDocument = {
  schemaVersion: "1.2.0",
  id: "m0-factory-cell",
  name: "M0 Factory Cell",
  revision: 1,
  assets: [
    {
      id: "factory-cell-asset",
      name: "M0 Factory Cell",
      uri: "/m0-factory-cell.glb",
      mediaType: "model/gltf-binary",
      sha256,
      byteLength: glb.byteLength,
      stats: {
        nodeCount: 2,
        meshCount: 1,
        materialCount: 1,
        triangleCount: 12,
      },
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
      metadata: { area: "m0" },
    },
  ],
  targets: manifest.nodeTargets.map((target) => ({
    id: target.targetId,
    entityId: "factory-cell",
    name: target.businessId === "PRESS-01" ? "Press 01" : "Conveyor 01",
    businessId: target.businessId,
    assetHash: sha256,
    nodeIndex: target.nodeIndex,
    metadata: {
      equipmentType: target.businessId === "PRESS-01" ? "press" : "conveyor",
    },
  })),
  dataSources: [
    {
      id: "factory-telemetry",
      name: "Factory Telemetry",
      adapter: "mock",
      staleAfterMs: 5000,
      offlineAfterMs: 15000,
      options: {
        scenario: "m0-normal-with-fault",
        seed: 17,
        defaultSpeed: 1,
      },
    },
  ],
  bindings: manifest.nodeTargets.map((target) => ({
    id: `${target.targetId}-status-binding`,
    targetId: target.targetId,
    sourceId: "factory-telemetry",
    pointer: `/machines/${target.businessId}/status`,
    ruleSetId: "equipment-status",
    writes: ["color", "alarm"],
    enabled: true,
  })),
  ruleSets: [
    {
      id: "equipment-status",
      name: "Equipment Status",
      rules: [
        {
          id: "status-offline",
          priority: 300,
          when: { fact: "connection", operator: "eq", expected: "offline" },
          effects: [
            { type: "color", value: "#5B6762" },
            { type: "alarm", level: "warning", message: "Telemetry offline" },
          ],
        },
        {
          id: "status-fault",
          priority: 200,
          when: { fact: "value", operator: "eq", expected: "fault" },
          effects: [
            { type: "color", value: "#B93632" },
            { type: "alarm", level: "critical", message: "Equipment fault" },
          ],
        },
        {
          id: "status-running",
          priority: 100,
          when: { fact: "value", operator: "eq", expected: "running" },
          effects: [
            { type: "color", value: "#2E7D4D" },
            { type: "alarm", level: "none", message: "" },
          ],
        },
      ],
      fallback: [
        { type: "color", value: "#A96800" },
        { type: "alarm", level: "info", message: "Unknown equipment state" },
      ],
    },
  ],
  annotations: [],
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
    backgroundMode: "custom",
    background: "#F4F6F5",
    grid: true,
    unit: "m",
    upAxis: "Y",
    lighting: {
      fill: {
        skyColor: "#FFFFFF",
        groundColor: "#65706A",
        intensity: 1.8,
      },
      key: {
        color: "#FFFFFF",
        intensity: 2.2,
        directionToLight: [0.37904902178945177, 0.7580980435789035, 0.5306686305052324],
      },
    },
  },
};

await mkdir(outputDirectory, { recursive: true });
await writeFile(resolve(outputDirectory, "m0-factory-cell.glb"), glb);
await writeFile(
  resolve(outputDirectory, "m0-factory-cell.manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
await writeFile(
  resolve(outputDirectory, "m0-scene.json"),
  `${JSON.stringify(sceneDocument, null, 2)}\n`,
);

process.stdout.write(`${JSON.stringify(manifest)}\n`);
