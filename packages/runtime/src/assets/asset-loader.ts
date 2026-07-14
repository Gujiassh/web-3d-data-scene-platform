import type { SceneAsset } from "@web3d/document";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import { Group, type Object3D } from "three";

import { disposeObject3D } from "./dispose-object";
import { diagnostic, diagnosticError } from "../diagnostics";
import type { AssetResolver } from "../types";

export interface LoadedGltfAsset {
  readonly gltf: GLTF;
  readonly root: Object3D;
  readonly nodesByIndex: ReadonlyMap<number, Object3D>;
}

export const defaultAssetResolver: AssetResolver = {
  resolve(asset) {
    return Promise.resolve(asset.uri);
  },
};

export async function loadGltfAsset(
  asset: SceneAsset,
  resolver: AssetResolver,
  signal: AbortSignal,
): Promise<LoadedGltfAsset> {
  if (asset.mediaType !== "model/gltf-binary" && asset.mediaType !== "model/gltf+json") {
    throw diagnosticError(
      diagnostic(
        "ASSET_MEDIA_TYPE_UNSUPPORTED",
        "asset",
        "error",
        `Asset media type ${asset.mediaType} is not supported.`,
        { assetId: asset.id },
      ),
    );
  }

  const resolved = await resolver.resolve(asset, signal);
  signal.throwIfAborted();
  const bytes = await readAssetBytes(resolved, signal);
  signal.throwIfAborted();

  if (bytes.byteLength !== asset.byteLength) {
    throw diagnosticError(
      diagnostic(
        "ASSET_BYTE_LENGTH_MISMATCH",
        "asset",
        "error",
        `Asset byte length ${bytes.byteLength} does not match ${asset.byteLength}.`,
        { assetId: asset.id },
      ),
    );
  }

  const actualHash = await sha256Hex(bytes);
  signal.throwIfAborted();
  if (actualHash !== asset.sha256) {
    throw diagnosticError(
      diagnostic(
        "ASSET_HASH_MISMATCH",
        "asset",
        "error",
        `Asset SHA-256 ${actualHash} does not match the SceneDocument.`,
        { assetId: asset.id },
      ),
    );
  }

  let gltf: GLTF;
  try {
    gltf = await new GLTFLoader().parseAsync(bytes, basePath(resolved));
  } catch (error) {
    throw diagnosticError(
      diagnostic("ASSET_LOAD_FAILED", "asset", "error", "GLTFLoader could not parse the asset.", {
        assetId: asset.id,
      }),
      error,
    );
  }
  try {
    signal.throwIfAborted();

    if (gltf.scenes.length !== 1) {
      throw diagnosticError(
        diagnostic(
          "ASSET_MULTISCENE_UNSUPPORTED",
          "asset",
          "error",
          `M0 requires one glTF scene; asset contains ${gltf.scenes.length}.`,
          { assetId: asset.id },
        ),
      );
    }

    const nodesByIndex = new Map<number, Object3D>();
    gltf.scene.traverse((object) => {
      const nodeIndex = gltf.parser.associations.get(object)?.nodes;
      if (nodeIndex !== undefined) nodesByIndex.set(nodeIndex, object);
    });

    return { gltf, root: gltf.scene, nodesByIndex };
  } catch (error) {
    const cleanupRoot = new Group();
    gltf.scenes.forEach((scene) => cleanupRoot.add(scene));
    disposeObject3D(cleanupRoot);
    throw error;
  }
}

export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function readAssetBytes(resolved: string | Blob, signal: AbortSignal): Promise<ArrayBuffer> {
  if (resolved instanceof Blob) return resolved.arrayBuffer();
  const response = await fetch(resolved, { signal });
  if (!response.ok) {
    throw new Error(`Asset request failed with ${response.status}.`);
  }
  return response.arrayBuffer();
}

function basePath(resolved: string | Blob): string {
  if (resolved instanceof Blob) return "";
  try {
    const base = typeof location === "undefined" ? undefined : location.href;
    const assetUrl = base === undefined ? new URL(resolved) : new URL(resolved, base);
    return new URL(".", assetUrl).href;
  } catch {
    return "";
  }
}
