import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { parseSceneDocument } from "../../packages/document/src/index.ts";

import { generatePerformanceFixture } from "./generate-fixture.mts";

const temporaryDirectories: string[] = [];

describe("Feature 009 performance fixture", () => {
  afterAll(async () => {
    await Promise.all(temporaryDirectories.map((directory) => rm(directory, { recursive: true })));
  });

  it("is byte deterministic and satisfies the frozen document/asset contract", async () => {
    const firstDirectory = await temporaryDirectory();
    const secondDirectory = await temporaryDirectory();
    const first = await generatePerformanceFixture(firstDirectory);
    const second = await generatePerformanceFixture(secondDirectory);

    expect(second.sceneSha256).toBe(first.sceneSha256);
    expect(second.assetSha256).toBe(first.assetSha256);
    expect(second.assetByteLength).toBe(first.assetByteLength);
    expect(await readFile(second.manifestPath)).toEqual(await readFile(first.manifestPath));
    expect(await readFile(second.scenePath)).toEqual(await readFile(first.scenePath));

    const parsed = parseSceneDocument(await readFile(first.scenePath, "utf8"));
    if (!parsed.ok)
      throw new Error(`Generated document is invalid: ${parsed.diagnostics[0]?.message}`);
    expect(parsed.value.entities).toHaveLength(300);
    expect(parsed.value.targets).toHaveLength(150);
    expect(parsed.value.bindings.filter((binding) => binding.enabled)).toHaveLength(100);
    expect(new Set(parsed.value.targets.map((target) => target.nodeIndex)).size).toBe(150);
    expect(parsed.value.targets.map((target) => target.nodeIndex)).toEqual(
      Array.from({ length: 150 }, (_, index) => index + 1),
    );
    expect(parsed.value.assets[0]).toMatchObject({
      sha256: first.assetSha256,
      byteLength: first.assetByteLength,
      stats: { nodeCount: 151, meshCount: 100, materialCount: 1, triangleCount: 190_000 },
    });
    expect(first.assetByteLength).toBeGreaterThanOrEqual(12_000_000);
    expect(first.assetByteLength).toBeLessThanOrEqual(15_000_000);

    const gltf = parseGlbJson(await readFile(first.assetPath));
    expect(gltf["scene"]).toBe(0);
    expect(gltf["scenes"]).toHaveLength(1);
    expect(gltf["nodes"]).toHaveLength(151);
    expect(gltf["meshes"]).toHaveLength(100);
    expect(gltf["materials"]).toHaveLength(1);
    expect(gltf["textures"]).toHaveLength(1);
    expect(gltf["images"]).toHaveLength(1);
  });
});

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "web3d-feature009-performance-"));
  temporaryDirectories.push(directory);
  return directory;
}

function parseGlbJson(bytes: Buffer): Record<string, unknown> {
  expect(bytes.readUInt32LE(0)).toBe(0x46546c67);
  expect(bytes.readUInt32LE(4)).toBe(2);
  expect(bytes.readUInt32LE(8)).toBe(bytes.byteLength);
  const jsonLength = bytes.readUInt32LE(12);
  expect(bytes.readUInt32LE(16)).toBe(0x4e4f534a);
  return JSON.parse(bytes.subarray(20, 20 + jsonLength).toString("utf8")) as Record<
    string,
    unknown
  >;
}
