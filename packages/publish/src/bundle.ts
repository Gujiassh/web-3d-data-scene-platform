import { MAX_TOTAL_BYTES, serializeSceneDocument, validateSceneDocument } from "@web3d/document";
import { zipSync, type Zippable } from "fflate";

import { ownedBytes, sha256Hex } from "./hash.js";
import { buildPublishManifest, serializePublishManifest } from "./manifest.js";
import { requireReadyPublishSnapshot } from "./ready-snapshot.js";
import {
  PUBLISH_MANIFEST_PATH,
  PUBLISH_SCENE_PATH,
  type PublishBundle,
  type PublishFile,
  type ReadyPublishSnapshot,
} from "./types.js";

const encoder = new TextEncoder();
const ZIP_MTIME = new Date("1980-01-01T00:00:00.000Z");

export async function createPublishBundle(ready: ReadyPublishSnapshot): Promise<PublishBundle> {
  const snapshot = requireReadyPublishSnapshot(ready);
  const validation = validateSceneDocument(snapshot.document);
  if (!validation.ok) throw new Error("Ready publish document is no longer valid.");

  const sceneBytes = encoder.encode(`${serializeSceneDocument(validation.value)}\n`);
  const files = new Map<string, Uint8Array>();
  const manifestFiles: PublishFile[] = [
    {
      path: PUBLISH_SCENE_PATH,
      sha256: await sha256Hex(sceneBytes),
      byteLength: sceneBytes.byteLength,
      mediaType: "application/json",
    },
  ];
  files.set(PUBLISH_SCENE_PATH, sceneBytes);

  let totalBytes = sceneBytes.byteLength;
  for (const asset of [...snapshot.assets].sort((left, right) => compare(left.path, right.path))) {
    if (files.has(asset.path)) throw new Error(`Duplicate ready asset path ${asset.path}.`);
    if (
      asset.bytes.byteLength !== asset.byteLength ||
      (await sha256Hex(asset.bytes)) !== asset.sha256
    ) {
      throw new Error(`Ready asset ${asset.assetId} no longer matches its declaration.`);
    }
    totalBytes += asset.bytes.byteLength;
    if (totalBytes > MAX_TOTAL_BYTES) throw new Error("Publish payload exceeds total size limit.");
    files.set(asset.path, ownedBytes(asset.bytes));
    manifestFiles.push({
      path: asset.path,
      sha256: asset.sha256,
      byteLength: asset.byteLength,
      mediaType: asset.mediaType,
    });
  }

  const manifest = buildPublishManifest({
    documentId: validation.value.id,
    revision: validation.value.revision,
    files: manifestFiles,
    requirements: snapshot.requirements,
  });
  files.set(PUBLISH_MANIFEST_PATH, serializePublishManifest(manifest));
  const orderedFiles = new Map([...files].sort(([left], [right]) => compare(left, right)));
  return {
    manifest,
    files: orderedFiles,
    zipBytes: encodeDeterministicZip(orderedFiles),
  };
}

function encodeDeterministicZip(files: ReadonlyMap<string, Uint8Array>): Uint8Array {
  const input: Zippable = {};
  for (const [path, bytes] of files) {
    input[path] = [ownedBytes(bytes), { level: 0, mtime: ZIP_MTIME }];
  }
  return zipSync(input, { level: 0, mtime: ZIP_MTIME });
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
