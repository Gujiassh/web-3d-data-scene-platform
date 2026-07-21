import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import { PNG } from "pngjs";

import validateSceneDocumentStructure from "../../packages/document/src/generated/scene-document.validator.js";
import type { SceneDocument } from "../../packages/document/src/types.ts";

import {
  FIXTURE_ACTIVE_ALARMS,
  FIXTURE_BINDING_COUNT,
  FIXTURE_ENTITY_COUNT,
  FIXTURE_MAX_ASSET_BYTES,
  FIXTURE_MIN_ASSET_BYTES,
  FIXTURE_PATCH_RATE_HZ,
  FIXTURE_RENDERABLE_NODE_COUNT,
  FIXTURE_TARGET_COUNT,
  FIXTURE_UNIQUE_TRIANGLES,
  fixtureBindingId,
  fixturePointer,
  fixtureTargetId,
} from "./fixture-contract.ts";

const MESH_COUNT = FIXTURE_RENDERABLE_NODE_COUNT;
const TEXTURE_SIZE = 1_640;
const DEFAULT_OUTPUT = resolve(import.meta.dirname, "generated");

export interface GeneratedPerformanceFixture {
  readonly outputDirectory: string;
  readonly scenePath: string;
  readonly assetPath: string;
  readonly manifestPath: string;
  readonly sceneSha256: string;
  readonly assetSha256: string;
  readonly assetByteLength: number;
}

export async function generatePerformanceFixture(
  outputDirectory = DEFAULT_OUTPUT,
): Promise<GeneratedPerformanceFixture> {
  const assetBytes = buildFixtureGlb();
  const assetSha256 = sha256(assetBytes);
  const document = buildSceneDocument(assetSha256, assetBytes.byteLength);
  assertFixture(document, assetBytes);

  const sceneJson = `${JSON.stringify(document, null, 2)}\n`;
  const sceneBytes = Buffer.from(sceneJson, "utf8");
  const sceneSha256 = sha256(sceneBytes);
  const generatorSha256 = sha256(await readFile(fileURLToPath(import.meta.url)));
  const manifest = {
    schemaVersion: "1.0.0",
    generatedAt: "2026-07-20T00:00:00.000Z",
    license: "CC0-1.0",
    generatorSha256,
    scene: {
      path: "fixture.scene.json",
      sha256: sceneSha256,
      byteLength: sceneBytes.byteLength,
    },
    asset: {
      path: "fixture.glb",
      sha256: assetSha256,
      byteLength: assetBytes.byteLength,
      uniqueTriangles: FIXTURE_UNIQUE_TRIANGLES,
      meshPrimitives: MESH_COUNT,
    },
    document: {
      entities: FIXTURE_ENTITY_COUNT,
      targets: FIXTURE_TARGET_COUNT,
      enabledBindings: document.bindings.filter((binding) => binding.enabled).length,
      initialActiveAlarms: FIXTURE_ACTIVE_ALARMS,
      patchRatePerSecond: FIXTURE_PATCH_RATE_HZ,
      pointerCount: FIXTURE_BINDING_COUNT,
    },
  } as const;

  await mkdir(outputDirectory, { recursive: true });
  const scenePath = resolve(outputDirectory, manifest.scene.path);
  const assetPath = resolve(outputDirectory, manifest.asset.path);
  const manifestPath = resolve(outputDirectory, "fixture.manifest.json");
  await Promise.all([
    writeFile(scenePath, sceneBytes),
    writeFile(assetPath, assetBytes),
    writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8"),
  ]);
  return {
    outputDirectory,
    scenePath,
    assetPath,
    manifestPath,
    sceneSha256,
    assetSha256,
    assetByteLength: assetBytes.byteLength,
  };
}

function buildSceneDocument(assetSha256: string, assetByteLength: number): SceneDocument {
  const identity = {
    position: [0, 0, 0] as const,
    rotation: [0, 0, 0, 1] as const,
    scale: [1, 1, 1] as const,
  };
  const entities: SceneDocument["entities"] = [
    {
      id: "benchmark-root",
      type: "group",
      parentId: null,
      name: "Benchmark Root",
      visible: true,
      locked: true,
      transform: identity,
      metadata: { fixtureRole: "root" },
    },
    {
      id: "benchmark-surface",
      type: "asset",
      parentId: "benchmark-root",
      name: "Benchmark Surface",
      visible: true,
      locked: false,
      transform: identity,
      assetId: "benchmark-asset",
      metadata: { fixtureRole: "render-load" },
    },
    ...Array.from({ length: FIXTURE_ENTITY_COUNT - 2 }, (_, index) => ({
      id: `benchmark-group-${pad(index)}`,
      type: "group" as const,
      parentId: "benchmark-root",
      name: `Benchmark Group ${pad(index)}`,
      visible: true,
      locked: false,
      transform: identity,
      metadata: { fixtureRole: "entity-load", ordinal: index },
    })),
  ];
  const targets: SceneDocument["targets"] = Array.from(
    { length: FIXTURE_TARGET_COUNT },
    (_, index) => ({
      id: fixtureTargetId(index),
      entityId: "benchmark-surface",
      name: `Benchmark Target ${pad(index)}`,
      businessId: `BENCH-${pad(index)}`,
      assetHash: assetSha256,
      nodeIndex: 1 + index,
      metadata: { channel: index % FIXTURE_BINDING_COUNT },
    }),
  );
  const bindings: SceneDocument["bindings"] = Array.from(
    { length: FIXTURE_BINDING_COUNT },
    (_, index) => ({
      id: fixtureBindingId(index),
      targetId: targets[index]!.id,
      sourceId: "benchmark-source",
      pointer: fixturePointer(index),
      ruleSetId: "benchmark-status",
      writes: ["color", "visibility", "alarm"] as const,
      enabled: true,
    }),
  );
  const views: SceneDocument["views"] = Array.from({ length: 120 }, (_, index) => {
    const angle = (index / 120) * Math.PI * 2;
    return {
      id: `benchmark-view-${pad(index)}`,
      name: `Benchmark View ${pad(index)}`,
      position: [Math.cos(angle) * 1.8, Math.sin(angle) * 1.2, 16] as const,
      target: [0, 0, 0] as const,
      fov: 42,
    };
  });
  const candidate: SceneDocument = {
    schemaVersion: "1.4.0",
    id: "feature-009-release-performance",
    name: "Feature 009 Release Performance",
    revision: 1,
    assets: [
      {
        id: "benchmark-asset",
        name: "Feature 009 Benchmark Surface",
        uri: `asset://${assetSha256}`,
        mediaType: "model/gltf-binary",
        sha256: assetSha256,
        byteLength: assetByteLength,
        stats: {
          nodeCount: FIXTURE_TARGET_COUNT + 1,
          meshCount: MESH_COUNT,
          materialCount: 1,
          triangleCount: FIXTURE_UNIQUE_TRIANGLES,
        },
      },
    ],
    entities,
    targets,
    dataSources: [
      {
        id: "benchmark-source",
        name: "Benchmark 200 Patch Stream",
        adapter: "mock",
        staleAfterMs: 5_000,
        offlineAfterMs: 15_000,
        options: { scenario: "benchmark-200-patch", seed: 9, defaultSpeed: 1 },
      },
    ],
    bindings,
    ruleSets: [
      {
        id: "benchmark-status",
        name: "Benchmark Status",
        rules: [
          {
            id: "benchmark-probe-hidden",
            priority: 200,
            when: { fact: "value", operator: "eq", expected: "probe-hidden" },
            effects: [
              { type: "color", value: "#D73A49" },
              { type: "visibility", value: false },
              { type: "alarm", level: "critical", message: "Active benchmark probe" },
            ],
          },
          {
            id: "benchmark-alarm",
            priority: 100,
            when: { fact: "value", operator: "eq", expected: "alarm" },
            effects: [
              { type: "color", value: "#D73A49" },
              { type: "alarm", level: "critical", message: "Active benchmark alarm" },
            ],
          },
        ],
        fallback: [{ type: "color", value: "#2FA36B" }],
      },
    ],
    annotations: [],
    views,
    environment: {
      backgroundMode: "custom",
      background: "#E9EEEC",
      grid: false,
      unit: "m",
      upAxis: "Y",
      lighting: {
        fill: { skyColor: "#FFFFFF", groundColor: "#52605B", intensity: 1.6 },
        key: {
          color: "#FFF4D6",
          intensity: 2.4,
          directionToLight: [0.37904902178945177, 0.7580980435789035, 0.5306686305052324],
        },
      },
    },
  };
  if (!validateSceneDocumentStructure(candidate)) {
    const error = validateSceneDocumentStructure.errors?.[0];
    throw new Error(
      `Generated benchmark document is invalid: ${error?.instancePath ?? "/"} ${error?.keyword ?? "schema validation failed"}`,
    );
  }
  return candidate;
}

function buildFixtureGlb(): Buffer {
  const buffer = new BinaryBuffer();
  const bufferViews: Array<Record<string, number>> = [];
  const accessors: Array<Record<string, unknown>> = [];
  const meshes: Array<Record<string, unknown>> = [];
  const nodes: Array<Record<string, unknown>> = [
    {
      name: "benchmark-root",
      children: Array.from({ length: FIXTURE_TARGET_COUNT }, (_, index) => index + 1),
    },
  ];

  for (let meshIndex = 0; meshIndex < MESH_COUNT; meshIndex += 1) {
    const geometry = gridGeometry(meshIndex);
    const positionAccessor = addAccessor(buffer, bufferViews, accessors, geometry.positions, {
      componentType: 5126,
      count: geometry.positions.length / 3,
      type: "VEC3",
      min: [-0.5, -0.19, -0.015],
      max: [0.5, 0.19, 0.015],
      target: 34962,
    });
    const normalAccessor = addAccessor(buffer, bufferViews, accessors, geometry.normals, {
      componentType: 5126,
      count: geometry.normals.length / 3,
      type: "VEC3",
      target: 34962,
    });
    const uvAccessor = addAccessor(buffer, bufferViews, accessors, geometry.uvs, {
      componentType: 5126,
      count: geometry.uvs.length / 2,
      type: "VEC2",
      target: 34962,
    });
    const indexAccessor = addAccessor(buffer, bufferViews, accessors, geometry.indices, {
      componentType: 5123,
      count: geometry.indices.length,
      type: "SCALAR",
      min: [0],
      max: [geometry.positions.length / 3 - 1],
      target: 34963,
    });
    meshes.push({
      name: `benchmark-mesh-${pad(meshIndex)}`,
      primitives: [
        {
          attributes: {
            POSITION: positionAccessor,
            NORMAL: normalAccessor,
            TEXCOORD_0: uvAccessor,
          },
          indices: indexAccessor,
          material: 0,
        },
      ],
    });
    const column = meshIndex % 10;
    const row = Math.floor(meshIndex / 10);
    nodes.push({
      name: `benchmark-surface-${pad(meshIndex)}`,
      mesh: meshIndex,
      translation: [(column - 4.5) * 1.04, (4.5 - row) * 0.43, 0],
    });
  }

  for (let index = MESH_COUNT; index < FIXTURE_TARGET_COUNT; index += 1) {
    nodes.push({ name: `benchmark-semantic-${pad(index)}`, translation: [0, 0, -100 - index] });
  }

  const textureBytes = generateTexturePng();
  const imageOffset = buffer.append(textureBytes);
  bufferViews.push({ buffer: 0, byteOffset: imageOffset, byteLength: textureBytes.byteLength });
  const imageBufferView = bufferViews.length - 1;
  const binary = buffer.bytes();
  const gltf = {
    asset: { version: "2.0", generator: "web3d-feature-009-deterministic-fixture" },
    scene: 0,
    scenes: [{ name: "Feature 009 Benchmark", nodes: [0] }],
    nodes,
    meshes,
    materials: [
      {
        name: "benchmark-material",
        pbrMetallicRoughness: {
          baseColorTexture: { index: 0 },
          metallicFactor: 0.05,
          roughnessFactor: 0.72,
        },
        doubleSided: true,
      },
    ],
    textures: [{ sampler: 0, source: 0 }],
    samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }],
    images: [
      { name: "benchmark-visible-noise", mimeType: "image/png", bufferView: imageBufferView },
    ],
    accessors,
    bufferViews,
    buffers: [{ byteLength: binary.byteLength }],
  };
  return encodeGlb(gltf, binary);
}

function gridGeometry(seed: number) {
  const columns = 50;
  const rows = 19;
  const positions = new Float32Array((columns + 1) * (rows + 1) * 3);
  const normals = new Float32Array((columns + 1) * (rows + 1) * 3);
  const uvs = new Float32Array((columns + 1) * (rows + 1) * 2);
  let vertex = 0;
  for (let row = 0; row <= rows; row += 1) {
    for (let column = 0; column <= columns; column += 1) {
      const u = column / columns;
      const v = row / rows;
      positions[vertex * 3] = u - 0.5;
      positions[vertex * 3 + 1] = (v - 0.5) * 0.38;
      positions[vertex * 3 + 2] =
        Math.sin((column + seed) * 0.31) * Math.cos((row - seed) * 0.27) * 0.015;
      normals[vertex * 3 + 2] = 1;
      uvs[vertex * 2] = u;
      uvs[vertex * 2 + 1] = v;
      vertex += 1;
    }
  }
  const indices = new Uint16Array(columns * rows * 6);
  let offset = 0;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const a = row * (columns + 1) + column;
      const b = a + 1;
      const c = a + columns + 1;
      const d = c + 1;
      indices.set([a, c, b, b, c, d], offset);
      offset += 6;
    }
  }
  return { positions, normals, uvs, indices };
}

function generateTexturePng(): Buffer {
  const png = new PNG({ width: TEXTURE_SIZE, height: TEXTURE_SIZE });
  let state = 0x0095_1eaf;
  for (let index = 0; index < TEXTURE_SIZE * TEXTURE_SIZE; index += 1) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    const value = state >>> 0;
    const offset = index * 4;
    png.data[offset] = 48 + (value & 0x9f);
    png.data[offset + 1] = 76 + ((value >>> 8) & 0x7f);
    png.data[offset + 2] = 92 + ((value >>> 16) & 0x7f);
    png.data[offset + 3] = 255;
  }
  return PNG.sync.write(png, {
    colorType: 2,
    inputColorType: 6,
    inputHasAlpha: true,
    deflateLevel: 9,
    deflateStrategy: 3,
  });
}

function addAccessor(
  buffer: BinaryBuffer,
  bufferViews: Array<Record<string, number>>,
  accessors: Array<Record<string, unknown>>,
  values: Float32Array | Uint16Array,
  definition: Record<string, unknown> & { readonly target: number },
): number {
  const bytes = new Uint8Array(values.buffer, values.byteOffset, values.byteLength);
  const byteOffset = buffer.append(bytes);
  bufferViews.push({
    buffer: 0,
    byteOffset,
    byteLength: bytes.byteLength,
    target: definition.target,
  });
  const accessor: Record<string, unknown> = { ...definition };
  delete accessor["target"];
  accessors.push({ bufferView: bufferViews.length - 1, byteOffset: 0, ...accessor });
  return accessors.length - 1;
}

class BinaryBuffer {
  readonly #chunks: Buffer[] = [];
  #byteLength = 0;

  append(bytes: Uint8Array): number {
    this.#align();
    const offset = this.#byteLength;
    const chunk = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.#chunks.push(chunk);
    this.#byteLength += chunk.byteLength;
    return offset;
  }

  bytes(): Buffer {
    this.#align();
    return Buffer.concat(this.#chunks, this.#byteLength);
  }

  #align(): void {
    const padding = (4 - (this.#byteLength % 4)) % 4;
    if (padding === 0) return;
    this.#chunks.push(Buffer.alloc(padding));
    this.#byteLength += padding;
  }
}

function encodeGlb(gltf: unknown, binary: Buffer): Buffer {
  const rawJson = Buffer.from(JSON.stringify(gltf), "utf8");
  const jsonPadding = (4 - (rawJson.byteLength % 4)) % 4;
  const json = Buffer.concat([rawJson, Buffer.alloc(jsonPadding, 0x20)]);
  const binPadding = (4 - (binary.byteLength % 4)) % 4;
  const bin = Buffer.concat([binary, Buffer.alloc(binPadding)]);
  const totalLength = 12 + 8 + json.byteLength + 8 + bin.byteLength;
  const output = Buffer.allocUnsafe(totalLength);
  output.writeUInt32LE(0x46546c67, 0);
  output.writeUInt32LE(2, 4);
  output.writeUInt32LE(totalLength, 8);
  output.writeUInt32LE(json.byteLength, 12);
  output.writeUInt32LE(0x4e4f534a, 16);
  json.copy(output, 20);
  const binHeader = 20 + json.byteLength;
  output.writeUInt32LE(bin.byteLength, binHeader);
  output.writeUInt32LE(0x004e4942, binHeader + 4);
  bin.copy(output, binHeader + 8);
  return output;
}

function assertFixture(document: SceneDocument, assetBytes: Uint8Array): void {
  const asset = document.assets[0];
  const enabledBindings = document.bindings.filter((binding) => binding.enabled).length;
  const failures = [
    document.entities.length === FIXTURE_ENTITY_COUNT
      ? null
      : `entities=${document.entities.length}`,
    document.targets.length === FIXTURE_TARGET_COUNT ? null : `targets=${document.targets.length}`,
    enabledBindings === FIXTURE_BINDING_COUNT ? null : `bindings=${enabledBindings}`,
    asset?.stats?.triangleCount === FIXTURE_UNIQUE_TRIANGLES
      ? null
      : `triangles=${asset?.stats?.triangleCount}`,
    asset?.stats?.meshCount === MESH_COUNT ? null : `drawCalls=${asset?.stats?.meshCount}`,
    assetBytes.byteLength >= FIXTURE_MIN_ASSET_BYTES &&
    assetBytes.byteLength <= FIXTURE_MAX_ASSET_BYTES
      ? null
      : `assetBytes=${assetBytes.byteLength}`,
  ].filter((value): value is string => value !== null);
  if (failures.length > 0)
    throw new Error(`Feature 009 fixture contract failed: ${failures.join(" ")}`);
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function pad(value: number): string {
  return value.toString().padStart(3, "0");
}

function outputArgument(): string {
  const index = process.argv.indexOf("--output");
  return index === -1 ? DEFAULT_OUTPUT : resolve(process.argv[index + 1] ?? "");
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const generated = await generatePerformanceFixture(outputArgument());
  process.stdout.write(
    `feature009-fixture sceneSha256=${generated.sceneSha256} assetSha256=${generated.assetSha256} assetBytes=${generated.assetByteLength} output=${generated.outputDirectory}\n`,
  );
}
