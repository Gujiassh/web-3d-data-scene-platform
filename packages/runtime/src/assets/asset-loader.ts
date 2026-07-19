import type { SceneAsset } from "@web3d/document";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import { Group, Mesh, type Object3D } from "three";

import { disposeObject3D } from "./dispose-object";
import {
  describeImportedPunctualLights,
  replaceImportedPunctualLights,
} from "./imported-punctual-lights";
import { diagnostic, diagnosticError } from "../diagnostics";
import type { AssetResolver, Diagnostic } from "../types";

export interface LoadedGltfAsset {
  readonly gltf: GLTF;
  readonly root: Object3D;
  readonly nodesByIndex: ReadonlyMap<number, Object3D>;
  readonly nodeIndexByObject: ReadonlyMap<Object3D, number>;
  readonly diagnostics: readonly Diagnostic[];
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

    const punctualLights = replaceImportedPunctualLights(gltf);
    const nodesByIndex = new Map<number, Object3D>();
    const nodeIndexByObject = new Map<Object3D, number>();
    collectFormalNodeEvidence(
      gltf.scene,
      gltf.parser.associations,
      nodesByIndex,
      nodeIndexByObject,
    );
    const diagnostics =
      punctualLights.total === 0
        ? []
        : [
            diagnostic(
              "ASSET_PUNCTUAL_LIGHTS_REMOVED",
              "asset",
              "warning",
              `${describeImportedPunctualLights(punctualLights)} were removed from the runtime scene so only the authored scene lighting rig is active.`,
              { assetId: asset.id },
            ),
          ];

    return { gltf, root: gltf.scene, nodesByIndex, nodeIndexByObject, diagnostics };
  } catch (error) {
    const cleanupRoot = new Group();
    gltf.scenes.forEach((scene) => cleanupRoot.add(scene));
    disposeObject3D(cleanupRoot);
    throw error;
  }
}

function collectFormalNodeEvidence(
  object: Object3D,
  associations: GLTF["parser"]["associations"],
  nodesByIndex: Map<number, Object3D>,
  nodeIndexByObject: Map<Object3D, number>,
  inheritedNodeIndex?: number,
): void {
  const association = associations.get(object);
  const formalNodeIndex = association?.nodes;
  const nodeIndex = formalNodeIndex ?? inheritedNodeIndex;
  if (formalNodeIndex !== undefined) nodesByIndex.set(formalNodeIndex, object);
  if (
    nodeIndex !== undefined &&
    object instanceof Mesh &&
    (formalNodeIndex !== undefined || association?.meshes !== undefined)
  ) {
    nodeIndexByObject.set(object, nodeIndex);
  }
  for (const child of object.children) {
    collectFormalNodeEvidence(child, associations, nodesByIndex, nodeIndexByObject, nodeIndex);
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
