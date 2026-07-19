import { readFile } from "node:fs/promises";

import type { SceneAsset } from "@web3d/document";
import { BoxGeometry, Group, Light, Mesh, MeshBasicMaterial, type Object3D } from "three";
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

  it("expands formal node identity across primitive meshes and nested formal nodes", async () => {
    const bytes = Uint8Array.from([4, 3, 2, 1]);
    const scene = new Group();
    const parentNode = new Group();
    const firstPrimitive = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
    const secondPrimitive = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
    const runtimeAttachment = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
    const childNode = new Group();
    const childPrimitive = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
    const formalMeshNode = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
    const unrelated = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
    parentNode.add(firstPrimitive, secondPrimitive, runtimeAttachment, childNode);
    childNode.add(childPrimitive);
    scene.add(parentNode, formalMeshNode, unrelated);
    const associations = new Map<Object3D, Record<string, number>>([
      [parentNode, { meshes: 4, nodes: 7 }],
      [firstPrimitive, { meshes: 4, primitives: 0 }],
      [secondPrimitive, { meshes: 4, primitives: 1 }],
      [childNode, { nodes: 8 }],
      [childPrimitive, { meshes: 5, primitives: 0 }],
      [formalMeshNode, { nodes: 9 }],
      [unrelated, { meshes: 9, primitives: 0 }],
    ]);
    const parse = vi.spyOn(GLTFLoader.prototype, "parseAsync").mockResolvedValue({
      parser: { associations },
      scene,
      scenes: [scene],
    } as unknown as GLTF);
    const asset: SceneAsset = {
      id: "multi-primitive",
      name: "Multi primitive",
      uri: "/multi-primitive.glb",
      mediaType: "model/gltf-binary",
      sha256: await sha256Hex(bytes.buffer),
      byteLength: bytes.byteLength,
    };

    try {
      const loaded = await loadGltfAsset(
        asset,
        { resolve: () => Promise.resolve(new Blob([bytes])) },
        new AbortController().signal,
      );

      expect(loaded.nodesByIndex).toEqual(
        new Map<number, Object3D>([
          [7, parentNode],
          [8, childNode],
          [9, formalMeshNode],
        ]),
      );
      expect(loaded.nodeIndexByObject.get(firstPrimitive)).toBe(7);
      expect(loaded.nodeIndexByObject.get(secondPrimitive)).toBe(7);
      expect(loaded.nodeIndexByObject.get(childPrimitive)).toBe(8);
      expect(loaded.nodeIndexByObject.get(formalMeshNode)).toBe(9);
      expect(loaded.nodeIndexByObject.has(runtimeAttachment)).toBe(false);
      expect(loaded.nodeIndexByObject.has(unrelated)).toBe(false);
    } finally {
      parse.mockRestore();
    }
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
      const directionalReplacement = loaded.nodesByIndex.get(0);
      const pointReplacement = loaded.nodesByIndex.get(1);
      const spotReplacement = loaded.nodesByIndex.get(2);
      const retainedChild = loaded.nodesByIndex.get(3);
      const beforeSibling = loaded.nodesByIndex.get(4);
      const afterSibling = loaded.nodesByIndex.get(5);
      expect(directionalReplacement).toBeDefined();
      expect(directionalReplacement).not.toBeInstanceOf(Light);
      expect(directionalReplacement?.parent).toBe(loaded.root);
      expect(directionalReplacement?.position.toArray()).toEqual([1, 2, 3]);
      expect(directionalReplacement?.userData).toMatchObject({ marker: "point-node" });
      expect(pointReplacement?.children).toHaveLength(0);
      expect(directionalReplacement?.children).toHaveLength(2);
      const directionalTarget = directionalReplacement?.children.find(
        (child) => child !== retainedChild,
      );
      expect(directionalTarget?.parent).toBe(directionalReplacement);
      expect(directionalTarget?.position.toArray()).toEqual([0, 0, -1]);
      expect(spotReplacement?.children).toHaveLength(1);
      expect(spotReplacement?.children[0]?.parent).toBe(spotReplacement);
      expect(spotReplacement?.children[0]?.position.toArray()).toEqual([0, 0, -1]);
      expect(retainedChild?.parent).toBe(directionalReplacement);
      expect(retainedChild?.position.toArray()).toEqual([4, 5, 6]);
      expect(loaded.gltf.parser.associations.get(directionalReplacement!)?.nodes).toBe(0);
      expect(loaded.gltf.parser.associations.has(retainedChild!)).toBe(true);
      expect(loaded.root.children.indexOf(directionalReplacement!)).toBe(
        loaded.root.children.indexOf(beforeSibling!) + 1,
      );
      expect(loaded.root.children.indexOf(afterSibling!)).toBe(
        loaded.root.children.indexOf(directionalReplacement!) + 1,
      );
      expect([...loaded.nodesByIndex.keys()].sort((left, right) => left - right)).toEqual([
        0, 1, 2, 3, 4, 5,
      ]);
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
    scenes: [{ nodes: [4, 0, 5, 1, 2] }],
    scene: 0,
    nodes: [
      {
        name: "Point light node",
        translation: [1, 2, 3],
        extras: { marker: "point-node" },
        children: [3],
        extensions: { KHR_lights_punctual: { light: 0 } },
      },
      { extensions: { KHR_lights_punctual: { light: 1 } } },
      { extensions: { KHR_lights_punctual: { light: 2 } } },
      { name: "Retained child", translation: [4, 5, 6] },
      { name: "Before sibling" },
      { name: "After sibling" },
    ],
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
