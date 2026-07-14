import { readFile } from "node:fs/promises";

import type { SceneAsset } from "@web3d/document";
import { BoxGeometry, Group, Mesh, MeshBasicMaterial } from "three";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import { describe, expect, it, vi } from "vitest";

import { loadGltfAsset, sha256Hex } from "./asset-loader";

const assetUrl = new URL("../../../../assets/factory/public/m0-factory-cell.glb", import.meta.url);
const manifestUrl = new URL(
  "../../../../assets/factory/public/m0-factory-cell.manifest.json",
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
