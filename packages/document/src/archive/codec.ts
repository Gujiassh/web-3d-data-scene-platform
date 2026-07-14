import { validateSceneDocument } from "../validate.js";
import { serializeSceneDocument } from "../serialize.js";
import type { SceneAsset, SceneDocument } from "../types.js";
import { sha256Hex } from "./hash.js";
import { importCanonicalSceneJson } from "./json.js";
import {
  assetPathFromSha,
  buildArchiveManifest,
  normalizeAssetUriToArchivePath,
  normalizeAssetUriToLocal,
  parseArchiveManifest,
  validateArchiveAssetBytes,
} from "./manifest.js";
import {
  MANIFEST_PATH,
  SCENE_ENTRY_PATH,
  type ArchiveAsset,
  type ExportSceneArchiveOptions,
  type ImportedSceneArchive,
} from "./types.js";
import { decodeArchiveZip, encodeDeterministicZip, listPayloadPaths } from "./zip.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

export async function exportSceneArchive(options: ExportSceneArchiveOptions): Promise<Uint8Array> {
  const validation = validateSceneDocument(options.document);
  if (!validation.ok) {
    throw new Error(
      `SceneDocument validation failed: ${validation.diagnostics[0]?.code ?? "UNKNOWN"}`,
    );
  }

  const uniqueAssets = collectUniqueAssetRecords(validation.value.assets, false);
  const assets = await resolveArchiveAssets(uniqueAssets, options.resolveAssetBytes);
  const archiveDocument = toArchiveDocument(validation.value);
  const sceneJson = serializeSceneDocument(archiveDocument);
  const sceneBytes = encoder.encode(sceneJson);
  const sceneSha256 = await sha256Hex(sceneBytes);
  const manifest = buildArchiveManifest({
    createdAt: options.createdAt,
    sceneBytes,
    sceneSha256,
    sceneSchemaVersion: archiveDocument.schemaVersion,
    assets,
  });
  const manifestBytes = encoder.encode(JSON.stringify(manifest, null, 2));

  const files = new Map<string, Uint8Array>();
  files.set(MANIFEST_PATH, manifestBytes);
  files.set(SCENE_ENTRY_PATH, sceneBytes);
  for (const asset of assets) {
    files.set(asset.path, asset.bytes);
  }

  return encodeDeterministicZip(files);
}

export async function importSceneArchive(bytes: Uint8Array): Promise<ImportedSceneArchive> {
  const files = decodeArchiveZip(bytes);
  const manifest = parseArchiveManifest(
    JSON.parse(decoder.decode(requireFile(files, MANIFEST_PATH))),
  );

  const payloadPaths = listPayloadPaths(files);
  const manifestPaths = [...manifest.files].map((file) => file.path).sort();
  if (payloadPaths.length !== manifestPaths.length) {
    throw new Error("Archive manifest payload count does not match ZIP payload.");
  }
  for (let index = 0; index < payloadPaths.length; index += 1) {
    if (payloadPaths[index] !== manifestPaths[index]) {
      throw new Error(
        `Archive payload mismatch at ${payloadPaths[index] ?? manifestPaths[index]}.`,
      );
    }
  }

  const sceneFile = manifest.files.find((file) => file.path === SCENE_ENTRY_PATH);
  if (!sceneFile) {
    throw new Error("Archive manifest must contain scene.json.");
  }
  const sceneBytes = requireFile(files, SCENE_ENTRY_PATH);
  if (sceneFile.mediaType !== "application/json") {
    throw new Error("scene.json media type mismatch.");
  }
  if (sceneFile.byteLength !== sceneBytes.byteLength) {
    throw new Error("scene.json length mismatch.");
  }
  if ((await sha256Hex(sceneBytes)) !== sceneFile.sha256) {
    throw new Error("scene.json hash mismatch.");
  }

  const archiveDocument = importCanonicalSceneJson(sceneBytes);
  const importedAssets = await validateImportedAssets(archiveDocument, manifest, files);
  const localDocument = toLocalDocument(archiveDocument);
  const localValidation = validateSceneDocument(localDocument);
  if (!localValidation.ok) {
    throw new Error(
      `Imported SceneDocument validation failed: ${localValidation.diagnostics[0]?.code ?? "UNKNOWN"}`,
    );
  }

  return {
    document: localValidation.value,
    manifest,
    assets: importedAssets,
  };
}

async function resolveArchiveAssets(
  assets: readonly SceneAsset[],
  source: ExportSceneArchiveOptions["resolveAssetBytes"],
): Promise<ArchiveAsset[]> {
  const output: ArchiveAsset[] = [];
  for (const asset of [...assets].sort((left, right) => compare(left.sha256, right.sha256))) {
    const bytes = await loadAssetBytes(source, asset.sha256);
    const path = normalizeAssetUriToArchivePath(asset);
    const archiveAsset: ArchiveAsset = {
      sha256: asset.sha256,
      path,
      mediaType: asset.mediaType,
      byteLength: asset.byteLength,
      bytes,
    };
    validateArchiveAssetBytes(archiveAsset);
    if ((await sha256Hex(bytes)) !== asset.sha256) {
      throw new Error(`Asset ${asset.id} hash mismatch.`);
    }
    output.push(archiveAsset);
  }
  return output;
}

async function validateImportedAssets(
  archiveDocument: SceneDocument,
  manifest: ImportedSceneArchive["manifest"],
  files: ReadonlyMap<string, Uint8Array>,
): Promise<ArchiveAsset[]> {
  const manifestByPath = new Map(manifest.files.map((file) => [file.path, file]));
  const uniqueAssets = collectUniqueAssetRecords(archiveDocument.assets, true);

  const assets: ArchiveAsset[] = [];
  for (const asset of uniqueAssets) {
    const expectedPath = assetPathFromSha(asset.sha256, asset.mediaType);
    const manifestFile = manifestByPath.get(expectedPath);
    if (!manifestFile) {
      throw new Error(`Archive manifest is missing asset ${expectedPath}.`);
    }
    if (asset.uri !== expectedPath) {
      throw new Error(`SceneDocument asset URI mismatch for ${asset.id}.`);
    }
    const bytes = requireFile(files, expectedPath);
    if (manifestFile.mediaType !== asset.mediaType) {
      throw new Error(`Archive manifest media type mismatch for ${expectedPath}.`);
    }
    if (manifestFile.byteLength !== asset.byteLength || bytes.byteLength !== asset.byteLength) {
      throw new Error(`Archive asset length mismatch for ${expectedPath}.`);
    }
    if (manifestFile.sha256 !== asset.sha256) {
      throw new Error(`Archive manifest hash mismatch for ${expectedPath}.`);
    }
    if ((await sha256Hex(bytes)) !== asset.sha256) {
      throw new Error(`Archive asset payload hash mismatch for ${expectedPath}.`);
    }
    const importedAsset: ArchiveAsset = {
      sha256: asset.sha256,
      path: expectedPath,
      mediaType: asset.mediaType,
      byteLength: asset.byteLength,
      bytes,
    };
    validateArchiveAssetBytes(importedAsset);
    assets.push(importedAsset);
  }

  const expectedPaths = new Set<string>([
    SCENE_ENTRY_PATH,
    ...uniqueAssets.map((asset) => assetPathFromSha(asset.sha256, asset.mediaType)),
  ]);
  for (const path of manifestByPath.keys()) {
    if (!expectedPaths.has(path)) {
      throw new Error(`Archive manifest contains extra payload ${path}.`);
    }
  }

  return assets;
}

function collectUniqueAssetRecords(
  assets: readonly SceneAsset[],
  requireArchiveUri: boolean,
): SceneAsset[] {
  const uniqueBySha = new Map<string, SceneAsset>();

  for (const asset of assets) {
    const archivePath = normalizeAssetUriToArchivePath(asset);
    if (requireArchiveUri && asset.uri !== archivePath) {
      throw new Error(`SceneDocument asset URI mismatch for ${asset.id}.`);
    }

    const existing = uniqueBySha.get(asset.sha256);
    if (!existing) {
      uniqueBySha.set(asset.sha256, asset);
      continue;
    }
    if (existing.mediaType !== asset.mediaType) {
      throw new Error(
        `SceneDocument assets sharing SHA ${asset.sha256} have conflicting media types.`,
      );
    }
    if (existing.byteLength !== asset.byteLength) {
      throw new Error(
        `SceneDocument assets sharing SHA ${asset.sha256} have conflicting byte lengths.`,
      );
    }
  }

  return [...uniqueBySha.values()].sort((left, right) => compare(left.sha256, right.sha256));
}

function toArchiveDocument(document: SceneDocument): SceneDocument {
  return {
    ...document,
    assets: document.assets.map((asset) => ({
      ...asset,
      uri: normalizeAssetUriToArchivePath(asset),
    })),
  };
}

function toLocalDocument(document: SceneDocument): SceneDocument {
  return {
    ...document,
    assets: document.assets.map((asset) => ({
      ...asset,
      uri: normalizeAssetUriToLocal(asset.uri, asset.sha256, asset.mediaType),
    })),
  };
}

async function loadAssetBytes(
  source: ExportSceneArchiveOptions["resolveAssetBytes"],
  sha256: string,
): Promise<Uint8Array> {
  const value = typeof source === "function" ? await source(sha256) : source.get(sha256);
  if (!(value instanceof Uint8Array)) {
    throw new Error(`Missing asset bytes for ${sha256}.`);
  }
  return value;
}

function requireFile(files: ReadonlyMap<string, Uint8Array>, path: string): Uint8Array {
  const file = files.get(path);
  if (!file) {
    throw new Error(`Archive file ${path} is missing.`);
  }
  return file;
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
