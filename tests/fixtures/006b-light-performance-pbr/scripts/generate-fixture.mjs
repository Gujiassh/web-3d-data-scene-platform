import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { format } from "prettier";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const outputDirectory = resolve(scriptDirectory, "../public");
const assetFileName = "006b-light-performance-pbr.glb";

const positions = new Float32Array([
  -0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5, 0.5, 0.5, -0.5, 0.5, 0.5, 0.5, -0.5, -0.5, -0.5, -0.5, -0.5,
  -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, -0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, -0.5, -0.5, 0.5, -0.5,
  -0.5, -0.5, -0.5, 0.5, -0.5, -0.5, 0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5, -0.5,
  -0.5, 0.5, 0.5, -0.5, 0.5, 0.5, 0.5, -0.5, -0.5, -0.5, -0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5,
  -0.5,
]);

const normals = new Float32Array([
  0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 1, 0, 0, 1, 0, 0,
  1, 0, 0, 1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, -1, 0,
  0, -1, 0, 0, -1, 0, 0, -1, 0, 0,
]);

const indices = new Uint16Array([
  0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7, 8, 9, 10, 8, 10, 11, 12, 13, 14, 12, 14, 15, 16, 17, 18, 16,
  18, 19, 20, 21, 22, 20, 22, 23,
]);

const binaryChunk = Buffer.concat([
  Buffer.from(positions.buffer),
  Buffer.from(normals.buffer),
  Buffer.from(indices.buffer),
]);

const materials = [
  pbrMaterial("Rough neutral", [0.34, 0.48, 0.4, 1], 0.05, 0.82),
  pbrMaterial("Brushed blue", [0.18, 0.38, 0.56, 1], 0.35, 0.42),
  pbrMaterial("Safety yellow", [0.82, 0.55, 0.08, 1], 0.15, 0.55),
  pbrMaterial("Ceramic red", [0.62, 0.18, 0.15, 1], 0, 0.68),
];

const boxNodes = [
  node("PBR Box 01", 1, [-2.4, 0.75, -1.6], [1, 1.5, 1]),
  node("PBR Box 02", 2, [0, 1.1, -1.6], [1.1, 2.2, 1.1]),
  node("PBR Box 03", 3, [2.4, 0.6, -1.6], [0.9, 1.2, 0.9]),
  node("PBR Box 04", 2, [-2.4, 0.55, 0], [1.2, 1.1, 1.2]),
  node("PBR Box 05", 3, [0, 0.8, 0], [1.4, 1.6, 1.4]),
  node("PBR Box 06", 1, [2.4, 0.9, 0], [1, 1.8, 1]),
  node("PBR Box 07", 3, [-2.4, 0.65, 1.6], [0.8, 1.3, 0.8]),
  node("PBR Box 08", 1, [0, 0.6, 1.6], [1, 1.2, 1]),
  node("PBR Box 09", 2, [2.4, 0.75, 1.6], [1.3, 1.5, 1.3]),
];

const gltf = {
  asset: {
    generator: "web-3d-data-scene-platform 006B deterministic PBR fixture",
    version: "2.0",
  },
  scene: 0,
  scenes: [{ name: "006B PBR performance scene", nodes: [0, ...boxNodes.map((_, i) => i + 1)] }],
  nodes: [node("PBR Floor", 0, [0, -0.1, 0], [8, 0.1, 6]), ...boxNodes],
  meshes: materials.map((_, material) => ({
    name: `Shared cube material ${material}`,
    primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material }],
  })),
  materials,
  buffers: [{ byteLength: binaryChunk.byteLength }],
  bufferViews: [
    { buffer: 0, byteLength: positions.byteLength, byteOffset: 0, target: 34962 },
    {
      buffer: 0,
      byteLength: normals.byteLength,
      byteOffset: positions.byteLength,
      target: 34962,
    },
    {
      buffer: 0,
      byteLength: indices.byteLength,
      byteOffset: positions.byteLength + normals.byteLength,
      target: 34963,
    },
  ],
  accessors: [
    {
      bufferView: 0,
      componentType: 5126,
      count: 24,
      max: [0.5, 0.5, 0.5],
      min: [-0.5, -0.5, -0.5],
      type: "VEC3",
    },
    {
      bufferView: 1,
      componentType: 5126,
      count: 24,
      max: [1, 1, 1],
      min: [-1, -1, -1],
      type: "VEC3",
    },
    {
      bufferView: 2,
      componentType: 5123,
      count: indices.length,
      max: [23],
      min: [0],
      type: "SCALAR",
    },
  ],
};

const glb = createGlb(gltf, binaryChunk);
const sha256 = createHash("sha256").update(glb).digest("hex");
const manifest = {
  fixtureVersion: 1,
  assetPath: `/${assetFileName}`,
  byteLength: glb.byteLength,
  mediaType: "model/gltf-binary",
  sha256,
  sceneCount: 1,
  nodeCount: 10,
  meshCount: 4,
  materialCount: 4,
  declaredTriangleCount: 48,
  renderedInstanceTriangleCount: 120,
  camera: { position: [7.5, 5.5, 8.5], target: [0, 0.75, 0], fov: 42 },
  sceneBounds: { min: [-4, -0.15, -3], max: [4, 2.2, 3] },
  performanceStates: [
    { id: "zero", pointCount: 0, spotCount: 0 },
    { id: "point-25", pointCount: 1, spotCount: 0, intensity: 25 },
    { id: "spot-10", pointCount: 0, spotCount: 1, intensity: 10 },
    { id: "eight-4-plus-4", pointCount: 4, spotCount: 4 },
  ],
};

const sceneDocument = {
  schemaVersion: "1.3.0",
  id: "feature-006b-light-performance-pbr",
  name: "Feature 006B Light Performance PBR",
  revision: 1,
  assets: [
    {
      id: "pbr-fixture-asset",
      name: "006B PBR shader-cost asset",
      uri: `/${assetFileName}`,
      mediaType: "model/gltf-binary",
      sha256,
      byteLength: glb.byteLength,
      stats: { nodeCount: 10, meshCount: 4, materialCount: 4, triangleCount: 48 },
    },
  ],
  entities: [
    {
      id: "pbr-fixture-scene",
      type: "asset",
      parentId: null,
      name: "PBR shader-cost scene",
      visible: true,
      locked: false,
      transform: {
        position: [0, 0, 0],
        rotation: [0, 0, 0, 1],
        scale: [1, 1, 1],
      },
      assetId: "pbr-fixture-asset",
      metadata: { fixtureRole: "shader-cost" },
    },
  ],
  targets: [],
  dataSources: [],
  bindings: [],
  ruleSets: [],
  annotations: [],
  views: [
    {
      id: "pbr-fixture-overview",
      name: "006B PBR Overview",
      position: manifest.camera.position,
      target: manifest.camera.target,
      fov: manifest.camera.fov,
    },
  ],
  environment: {
    backgroundMode: "custom",
    background: "#F4F6F5",
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

await mkdir(outputDirectory, { recursive: true });
const [manifestJson, sceneJson] = await Promise.all([
  format(JSON.stringify(manifest), { parser: "json", printWidth: 100 }),
  format(JSON.stringify(sceneDocument), { parser: "json", printWidth: 100 }),
]);
await Promise.all([
  writeFile(resolve(outputDirectory, assetFileName), glb),
  writeFile(resolve(outputDirectory, "006b-light-performance-pbr.manifest.json"), manifestJson),
  writeFile(resolve(outputDirectory, "006b-light-performance-pbr.scene.json"), sceneJson),
]);

function pbrMaterial(name, baseColorFactor, metallicFactor, roughnessFactor) {
  return {
    name,
    pbrMetallicRoughness: { baseColorFactor, metallicFactor, roughnessFactor },
  };
}

function node(name, mesh, translation, scale) {
  return { name, mesh, translation, scale };
}

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
