import type { SceneDocument } from "../types.js";

export const ARCHIVE_VERSION = "1.0.0";
export const SCENE_ENTRY_PATH = "scene.json";
export const MANIFEST_PATH = "manifest.json";
export const LOCAL_ASSET_URI_PREFIX = "asset://";
export const MAX_ARCHIVE_FILES = 128;
export const MAX_FILE_BYTES = 50 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 150 * 1024 * 1024;

export type SceneSchemaVersion = "1.0.0" | "1.1.0" | "1.2.0" | "1.3.0" | "1.4.0";

export type ArchiveMediaType = "application/json" | "model/gltf-binary" | "model/gltf+json";
export type AssetMediaType = Exclude<ArchiveMediaType, "application/json">;

export interface ArchiveManifestFile {
  readonly path: string;
  readonly sha256: string;
  readonly byteLength: number;
  readonly mediaType: ArchiveMediaType;
}

export interface ArchiveManifest {
  readonly archiveVersion: "1.0.0";
  readonly createdAt: string;
  readonly entry: "scene.json";
  readonly sceneSchemaVersion: SceneSchemaVersion;
  readonly files: readonly ArchiveManifestFile[];
}

export interface ArchiveAsset {
  readonly sha256: string;
  readonly path: string;
  readonly mediaType: AssetMediaType;
  readonly byteLength: number;
  readonly bytes: Uint8Array;
}

export interface ImportedSceneArchive {
  readonly document: SceneDocument;
  readonly manifest: ArchiveManifest;
  readonly assets: readonly ArchiveAsset[];
}

export interface ExportSceneArchiveOptions {
  readonly document: SceneDocument;
  readonly createdAt: string;
  readonly resolveAssetBytes:
    ((sha256: string) => Uint8Array | Promise<Uint8Array>) | ReadonlyMap<string, Uint8Array>;
}
