import { readFile } from "node:fs/promises";

import type { SceneAsset } from "@web3d/document";
import { BoxGeometry, Group, Light, Mesh, MeshBasicMaterial } from "three";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import { describe, expect, it, vi } from "vitest";

import { loadGltfAsset, sha256Hex } from "./asset-loader";

const assetUrl = new URL(
  "../../../../tests/fixtures/m0-factory/public/m0-factory-cell.glb",
  import.meta.url,
);
const manifestUrl = new URL(
  "../../../../tests/fixtures/m0-factory/public/m0-factory-cell.manifest.json",
  import.meta.url,
);

describe("loadGltfAsset", () => {
  it("verifies the M0 asset and preserves glTF node indexes", async () => {
    const [file, manifest] = await Promise.all([
      readFile(assetUrl),
      readFile(manifestUrl, "utf8").then((value) => JSON.parse(value) as AssetManifest),
    ]);
    const asset = sceneAsset(manifest);
    const loaded = await loadGltfAsset(
      asset,
      { resolve: () => Promise.resolve(new Blob([file])) },
      new AbortController().signal,
    );

    expect(
      await sha256Hex(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength)),
    ).toBe(manifest.sha256);
    expect([...loaded.nodesByIndex.keys()].sort()).toEqual([0, 1]);
  });

  it("rejects a hash mismatch before parsing", async () => {
    const [file, manifest] = await Promise.all([
      readFile(assetUrl),
      readFile(manifestUrl, "utf8").then((value) => JSON.parse(value) as AssetManifest),
    ]);
    const asset = { ...sceneAsset(manifest), sha256: "0".repeat(64) };

    await expect(
      loadGltfAsset(
        asset,
        { resolve: () => Promise.resolve(new Blob([file])) },
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ diagnostic: { code: "ASSET_HASH_MISMATCH" } });
  });

  it("disposes a parsed scene when the load is aborted after parsing", async () => {
    const bytes = Uint8Array.from([1, 2, 3, 4]);
    const controller = new AbortController();
    const root = new Group();
    const geometry = new BoxGeometry();
    const dispose = vi.fn();
    geometry.addEventListener("dispose", dispose);
    root.add(new Mesh(geometry, new MeshBasicMaterial()));
    const parse = vi.spyOn(GLTFLoader.prototype, "parseAsync").mockImplementation(() => {
      controller.abort();
      return Promise.resolve({
        parser: { associations: new Map() },
        scene: root,
        scenes: [root],
      } as unknown as GLTF);
    });
    const asset: SceneAsset = {
      id: "abort-after-parse",
      name: "Abort after parse",
      uri: "/abort.glb",
      mediaType: "model/gltf-binary",
      sha256: await sha256Hex(bytes.buffer),
      byteLength: bytes.byteLength,
    };

    await expect(
      loadGltfAsset(
        asset,
        { resolve: () => Promise.resolve(new Blob([bytes])) },
        controller.signal,
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(dispose).toHaveBeenCalledOnce();
    parse.mockRestore();
  });

  it.each([
    ["glTF", "model/gltf+json" as const, () => gltfJsonBytes(punctualLightsGltf())],
    ["GLB", "model/gltf-binary" as const, () => glbBytes(punctualLightsGltf())],
  ])(
    "removes imported Three lights and reports an asset diagnostic for %s",
    async (_, mediaType, bytes) => {
      const contents = bytes();
      const asset: SceneAsset = {
        id: `punctual-${mediaType}`,
        name: "Punctual lights",
        uri: mediaType === "model/gltf-binary" ? "/lights.glb" : "/lights.gltf",
        mediaType,
        sha256: await sha256Hex(contents),
        byteLength: contents.byteLength,
      };

      const loaded = await loadGltfAsset(
        asset,
        { resolve: () => Promise.resolve(new Blob([contents])) },
        new AbortController().signal,
      );
      const importedLights: Light[] = [];
      loaded.root.traverse((object) => {
        if (object instanceof Light) importedLights.push(object);
      });

      expect(importedLights).toHaveLength(0);
      expect(loaded.diagnostics).toEqual([
        {
          code: "ASSET_PUNCTUAL_LIGHTS_REMOVED",
          source: "asset",
          severity: "warning",
          message:
            "3 imported punctual lights (1 directional, 1 point, 1 spot) were removed from the runtime scene so only the authored scene lighting rig is active.",
          assetId: asset.id,
        },
      ]);
    },
  );
});

interface AssetManifest {
  assetPath: string;
  byteLength: number;
  mediaType: SceneAsset["mediaType"];
  sha256: string;
}

function sceneAsset(manifest: AssetManifest): SceneAsset {
  return {
    id: "factory-cell-asset",
    name: "M0 Factory Cell",
    uri: manifest.assetPath,
    mediaType: manifest.mediaType,
    sha256: manifest.sha256,
    byteLength: manifest.byteLength,
  };
}

function punctualLightsGltf(): Record<string, unknown> {
  return {
    asset: { version: "2.0" },
    extensionsUsed: ["KHR_lights_punctual"],
    extensions: {
      KHR_lights_punctual: {
        lights: [{ type: "directional" }, { type: "point" }, { type: "spot" }],
      },
    },
    scenes: [{ nodes: [0, 1, 2] }],
    scene: 0,
    nodes: [0, 1, 2].map((light) => ({
      extensions: { KHR_lights_punctual: { light } },
    })),
  };
}

function gltfJsonBytes(value: unknown): ArrayBuffer {
  const encoded = new TextEncoder().encode(JSON.stringify(value));
  return encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength);
}

function glbBytes(value: unknown): ArrayBuffer {
  const encoded = new TextEncoder().encode(JSON.stringify(value));
  const jsonLength = Math.ceil(encoded.byteLength / 4) * 4;
  const bytes = new Uint8Array(12 + 8 + jsonLength);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, bytes.byteLength, true);
  view.setUint32(12, jsonLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  bytes.fill(0x20, 20);
  bytes.set(encoded, 20);
  return bytes.buffer;
}
