import type { SceneAsset } from "../types.js";
import {
  ARCHIVE_VERSION,
  LOCAL_ASSET_URI_PREFIX,
  MANIFEST_PATH,
  MAX_ARCHIVE_FILES,
  MAX_FILE_BYTES,
  MAX_TOTAL_BYTES,
  SCENE_ENTRY_PATH,
  type ArchiveAsset,
  type ArchiveManifest,
  type ArchiveManifestFile,
  type AssetMediaType,
  type SceneSchemaVersion,
} from "./types.js";

const CREATED_AT_PATTERN = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?Z$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const SAFE_PATH_PATTERN = /^[A-Za-z0-9._-][A-Za-z0-9._/-]*$/;

export function buildArchiveManifest(options: {
  readonly createdAt: string;
  readonly sceneBytes: Uint8Array;
  readonly sceneSha256: string;
  readonly sceneSchemaVersion: SceneSchemaVersion;
  readonly assets: readonly ArchiveAsset[];
}): ArchiveManifest {
  assertCreatedAt(options.createdAt);
  assertSceneSchemaVersion(options.sceneSchemaVersion);
  assertFileBudget(options.assets.length + 2);

  const sceneFile: ArchiveManifestFile = {
    path: SCENE_ENTRY_PATH,
    sha256: options.sceneSha256,
    byteLength: options.sceneBytes.byteLength,
    mediaType: "application/json",
  };
  const assetFiles: ArchiveManifestFile[] = options.assets.map((asset) => ({
    path: asset.path,
    sha256: asset.sha256,
    byteLength: asset.byteLength,
    mediaType: asset.mediaType,
  }));
  const files = [sceneFile, ...assetFiles].sort(compareFilePath);

  validateManifestFiles(files);

  return {
    archiveVersion: ARCHIVE_VERSION,
    createdAt: options.createdAt,
    entry: SCENE_ENTRY_PATH,
    sceneSchemaVersion: options.sceneSchemaVersion,
    files,
  };
}

export function parseArchiveManifest(value: unknown): ArchiveManifest {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Archive manifest must be an object.");
  }

  const record = value as Record<string, unknown>;
  const allowedKeys = new Set([
    "archiveVersion",
    "createdAt",
    "entry",
    "sceneSchemaVersion",
    "files",
  ]);
  for (const key of Object.keys(record)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`Archive manifest contains unsupported property '${key}'.`);
    }
  }

  if (record["archiveVersion"] !== ARCHIVE_VERSION) {
    throw new Error("Archive version must be 1.0.0.");
  }
  if (record["entry"] !== SCENE_ENTRY_PATH) {
    throw new Error("Archive entry must be scene.json.");
  }
  assertSceneSchemaVersion(record["sceneSchemaVersion"]);
  assertCreatedAt(record["createdAt"]);

  if (!Array.isArray(record["files"])) {
    throw new Error("Archive manifest files must be an array.");
  }

  const files = record["files"].map(parseArchiveManifestFile);
  validateManifestFiles(files);

  return {
    archiveVersion: ARCHIVE_VERSION,
    createdAt: record["createdAt"] as string,
    entry: SCENE_ENTRY_PATH,
    sceneSchemaVersion: record["sceneSchemaVersion"],
    files,
  };
}

export function normalizeAssetUriToArchivePath(asset: SceneAsset): string {
  const expectedLocal = `${LOCAL_ASSET_URI_PREFIX}${asset.sha256}`;
  const expectedArchive = assetPathFromSha(asset.sha256, asset.mediaType);
  if (asset.uri === expectedLocal || asset.uri === expectedArchive) {
    return expectedArchive;
  }
  throw new Error(`Asset ${asset.id} URI must be ${expectedLocal} or ${expectedArchive}.`);
}

export function normalizeAssetUriToLocal(
  uri: string,
  sha256: string,
  mediaType: AssetMediaType,
): string {
  const archivePath = assetPathFromSha(sha256, mediaType);
  if (uri !== archivePath) {
    throw new Error(`Archive asset URI must be ${archivePath}.`);
  }
  return `${LOCAL_ASSET_URI_PREFIX}${sha256}`;
}

export function assetPathFromSha(sha256: string, mediaType: AssetMediaType): string {
  assertSha256(sha256);
  return `assets/${sha256}.${extensionForMediaType(mediaType)}`;
}

export function extensionForMediaType(mediaType: AssetMediaType): string {
  if (mediaType === "model/gltf-binary") return "glb";
  if (mediaType === "model/gltf+json") return "gltf";
  throw new Error(`Unsupported asset media type '${mediaType}'.`);
}

export function validateArchiveAssetBytes(asset: {
  readonly path: string;
  readonly sha256: string;
  readonly byteLength: number;
  readonly mediaType: AssetMediaType;
  readonly bytes: Uint8Array;
}): void {
  assertSafeArchivePath(asset.path);
  assertSha256(asset.sha256);
  assertByteLength(asset.byteLength);
  if (asset.byteLength !== asset.bytes.byteLength) {
    throw new Error(`Archive file ${asset.path} length mismatch.`);
  }
  if (asset.path !== assetPathFromSha(asset.sha256, asset.mediaType)) {
    throw new Error(`Archive file ${asset.path} does not match asset hash and media type.`);
  }
}

export function validateManifestFiles(files: readonly ArchiveManifestFile[]): void {
  if (files.length === 0) {
    throw new Error("Archive manifest must list at least one payload file.");
  }

  assertFileBudget(files.length + 1);

  let totalBytes = 0;
  const seen = new Set<string>();
  let hasScene = false;
  for (const file of files) {
    if (file.path === MANIFEST_PATH) {
      throw new Error("Archive manifest must not list manifest.json.");
    }
    assertSafeArchivePath(file.path);
    assertSha256(file.sha256);
    assertByteLength(file.byteLength);
    if (!isArchiveMediaType(file.mediaType)) {
      throw new Error(`Archive file ${file.path} has unsupported media type.`);
    }
    if (seen.has(file.path)) {
      throw new Error(`Archive manifest contains duplicate path ${file.path}.`);
    }
    seen.add(file.path);
    totalBytes += file.byteLength;
    if (totalBytes > MAX_TOTAL_BYTES) {
      throw new Error("Archive payload exceeds total size limit.");
    }
    if (file.path === SCENE_ENTRY_PATH) {
      hasScene = true;
      if (file.mediaType !== "application/json") {
        throw new Error("scene.json must use application/json media type.");
      }
    }
  }

  if (!hasScene) {
    throw new Error("Archive manifest must contain scene.json.");
  }
}

export function assertSafeArchivePath(path: string): void {
  if (!SAFE_PATH_PATTERN.test(path)) {
    throw new Error(`Archive path ${path} is not safe.`);
  }
  if (path.includes("\\")) {
    throw new Error(`Archive path ${path} uses unsupported separators.`);
  }
  const segments = path.split("/");
  if (segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")) {
    throw new Error(`Archive path ${path} is not safe.`);
  }
  if (path.startsWith("/")) {
    throw new Error(`Archive path ${path} is absolute.`);
  }
}

export function assertCreatedAt(value: unknown): asserts value is string {
  if (typeof value !== "string" || !CREATED_AT_PATTERN.test(value)) {
    throw new Error("createdAt must be an RFC3339 UTC timestamp.");
  }
}

export function assertSha256(value: unknown): asserts value is string {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    throw new Error("sha256 must be a lowercase 64-character hex digest.");
  }
}

export function assertByteLength(value: unknown): asserts value is number {
  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > MAX_FILE_BYTES) {
    throw new Error(`byteLength must be an integer between 1 and ${MAX_FILE_BYTES}.`);
  }
}

export function assertSceneSchemaVersion(value: unknown): asserts value is SceneSchemaVersion {
  if (value !== "1.0.0" && value !== "1.1.0" && value !== "1.2.0" && value !== "1.3.0") {
    throw new Error("SceneDocument schemaVersion must be 1.0.0, 1.1.0, 1.2.0 or 1.3.0.");
  }
}

function assertFileBudget(count: number): void {
  if (count > MAX_ARCHIVE_FILES) {
    throw new Error(`Archive exceeds file count limit of ${MAX_ARCHIVE_FILES}.`);
  }
}

function compareFilePath(left: ArchiveManifestFile, right: ArchiveManifestFile): number {
  return left.path < right.path ? -1 : left.path > right.path ? 1 : 0;
}

function isArchiveMediaType(value: unknown): value is ArchiveManifestFile["mediaType"] {
  return (
    value === "application/json" || value === "model/gltf-binary" || value === "model/gltf+json"
  );
}

function parseArchiveManifestFile(value: unknown): ArchiveManifestFile {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Archive manifest file entry must be an object.");
  }
  const record = value as Record<string, unknown>;
  const allowedKeys = new Set(["path", "sha256", "byteLength", "mediaType"]);
  for (const key of Object.keys(record)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`Archive manifest file contains unsupported property '${key}'.`);
    }
  }

  const path = record["path"];
  const sha256 = record["sha256"];
  const byteLength = record["byteLength"];
  const mediaType = record["mediaType"];

  if (typeof path !== "string") {
    throw new Error("Archive manifest file path must be a string.");
  }
  assertSafeArchivePath(path);
  assertSha256(sha256);
  assertByteLength(byteLength);
  if (!isArchiveMediaType(mediaType)) {
    throw new Error(`Archive file ${path} has unsupported media type.`);
  }

  return { path, sha256, byteLength, mediaType };
}
