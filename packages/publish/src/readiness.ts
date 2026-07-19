import {
  MAX_ARCHIVE_FILES,
  MAX_FILE_BYTES,
  MAX_TOTAL_BYTES,
  validateSceneDocument,
  type SceneAsset,
} from "@web3d/document";

import { ownedBytes, sha256Hex } from "./hash.js";
import { createReadyPublishSnapshot } from "./ready-snapshot.js";
import {
  type InspectPublishReadinessOptions,
  type PublishBlocker,
  type PublishReadinessResult,
  type PublishRequirements,
  type PublishSurfaceEvidence,
  type ReadyPublishAsset,
} from "./types.js";

const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export async function inspectPublishReadiness(
  options: InspectPublishReadinessOptions,
): Promise<PublishReadinessResult> {
  options.signal?.throwIfAborted();
  const validation = validateSceneDocument(options.document);
  if (!validation.ok) {
    const first = validation.diagnostics[0];
    return rejected({
      code: "PUBLISH_DOCUMENT_INVALID",
      message: first?.message ?? "SceneDocument validation failed.",
      ...(first?.path === undefined ? {} : { path: first.path }),
    });
  }
  if (validation.value.schemaVersion !== "1.4.0") {
    return rejected({
      code: "PUBLISH_DOCUMENT_VERSION_UNSUPPORTED",
      message: "Publish requires current SceneDocument 1.4.0.",
    });
  }

  const blockers = inspectAnnotations(validation.value, options.surfaceEvidence);
  if (blockers.length > 0) return { ok: false, blockers };
  const assets = await inspectAssets(validation.value.assets, options, blockers);
  if (blockers.length > 0) return { ok: false, blockers };

  const requirements: PublishRequirements = {
    dataSources: validation.value.dataSources
      .map((source) => ({ sourceId: source.id, adapter: source.adapter }))
      .sort((left, right) => compare(left.sourceId, right.sourceId)),
    trustedContentKeys: [
      ...new Set(
        validation.value.annotations.flatMap((annotation) =>
          annotation.content.kind === "host-content" ? [annotation.content.key] : [],
        ),
      ),
    ].sort(compare),
  };
  return {
    ok: true,
    value: createReadyPublishSnapshot({
      document: validation.value,
      assets,
      requirements,
    }),
  };
}

function inspectAnnotations(
  document: InspectPublishReadinessOptions["document"],
  evidence: readonly PublishSurfaceEvidence[],
): PublishBlocker[] {
  const blockers: PublishBlocker[] = [];
  const byAnnotation = new Map<string, PublishSurfaceEvidence>();
  const surfaceAnnotationIds = new Set(
    document.annotations.flatMap((annotation) =>
      annotation.anchor.kind === "surface" ? [annotation.id] : [],
    ),
  );
  for (const item of evidence) {
    if (!surfaceAnnotationIds.has(item.annotationId)) {
      blockers.push({
        code: "PUBLISH_SURFACE_EVIDENCE_UNKNOWN",
        annotationId: item.annotationId,
        message: `Surface evidence references unknown hotspot ${item.annotationId}.`,
      });
    } else if (byAnnotation.has(item.annotationId)) {
      blockers.push({
        code: "PUBLISH_SURFACE_EVIDENCE_DUPLICATE",
        annotationId: item.annotationId,
        message: `Hotspot ${item.annotationId} has duplicate surface evidence.`,
      });
    } else {
      byAnnotation.set(item.annotationId, item);
    }
  }

  for (const annotation of document.annotations) {
    if (annotation.anchor.kind === "legacy") {
      blockers.push({
        code: "PUBLISH_LEGACY_HOTSPOT",
        annotationId: annotation.id,
        message: `Hotspot ${annotation.id} must be repositioned to a Surface anchor before publish.`,
      });
      continue;
    }
    const item = byAnnotation.get(annotation.id);
    if (item === undefined) {
      blockers.push({
        code: "PUBLISH_SURFACE_EVIDENCE_MISSING",
        annotationId: annotation.id,
        message: `Hotspot ${annotation.id} is missing Runtime surface resolution evidence.`,
      });
      continue;
    }
    if (item.documentId !== document.id || item.documentRevision !== document.revision) {
      blockers.push({
        code: "PUBLISH_SURFACE_EVIDENCE_STALE",
        annotationId: annotation.id,
        message: `Hotspot ${annotation.id} surface evidence does not match the current document revision.`,
      });
      continue;
    }
    if (item.resolution !== "resolved") {
      blockers.push({
        code: "PUBLISH_SURFACE_UNRESOLVED",
        annotationId: annotation.id,
        message: `Hotspot ${annotation.id} is unresolved and cannot be published.`,
      });
    }
  }
  return blockers;
}

async function inspectAssets(
  documentAssets: readonly SceneAsset[],
  options: InspectPublishReadinessOptions,
  blockers: PublishBlocker[],
): Promise<ReadyPublishAsset[]> {
  const unique = new Map<string, SceneAsset>();
  for (const asset of [...documentAssets].sort((left, right) => compare(left.id, right.id))) {
    const path = assetPath(asset);
    const existing = unique.get(path);
    if (
      existing !== undefined &&
      (existing.sha256 !== asset.sha256 ||
        existing.byteLength !== asset.byteLength ||
        existing.mediaType !== asset.mediaType)
    ) {
      blockers.push({
        code: "PUBLISH_ASSET_PATH_CONFLICT",
        assetId: asset.id,
        path,
        message: `Published asset path ${path} has conflicting declarations.`,
      });
      continue;
    }
    if (existing === undefined) unique.set(path, asset);
  }

  if (unique.size + 2 > MAX_ARCHIVE_FILES) {
    blockers.push({
      code: "PUBLISH_BUNDLE_LIMIT_EXCEEDED",
      message: `Publish bundle exceeds file count limit of ${MAX_ARCHIVE_FILES}.`,
    });
    return [];
  }

  const output: ReadyPublishAsset[] = [];
  let totalBytes = 0;
  for (const [path, asset] of [...unique].sort(([left], [right]) => compare(left, right))) {
    options.signal?.throwIfAborted();
    let bytes: Uint8Array;
    try {
      const value = await options.resolveAssetBytes(
        asset.sha256,
        options.signal ?? new AbortController().signal,
      );
      if (!(value instanceof Uint8Array)) throw new Error("Asset resolver returned no bytes.");
      bytes = ownedBytes(value);
    } catch {
      options.signal?.throwIfAborted();
      blockers.push({
        code: "PUBLISH_ASSET_MISSING",
        assetId: asset.id,
        path,
        message: `Asset ${asset.id} bytes are unavailable.`,
      });
      continue;
    }
    if (bytes.byteLength !== asset.byteLength) {
      blockers.push({
        code: "PUBLISH_ASSET_LENGTH_MISMATCH",
        assetId: asset.id,
        path,
        message: `Asset ${asset.id} byte length does not match SceneDocument.`,
      });
      continue;
    }
    if ((await sha256Hex(bytes)) !== asset.sha256) {
      blockers.push({
        code: "PUBLISH_ASSET_HASH_MISMATCH",
        assetId: asset.id,
        path,
        message: `Asset ${asset.id} hash does not match SceneDocument.`,
      });
      continue;
    }
    if (bytes.byteLength < 1 || bytes.byteLength > MAX_FILE_BYTES) {
      blockers.push({
        code: "PUBLISH_BUNDLE_LIMIT_EXCEEDED",
        assetId: asset.id,
        path,
        message: `Asset ${asset.id} violates the per-file publish size limit.`,
      });
      continue;
    }
    totalBytes += bytes.byteLength;
    if (totalBytes > MAX_TOTAL_BYTES) {
      blockers.push({
        code: "PUBLISH_BUNDLE_LIMIT_EXCEEDED",
        message: "Publish bundle exceeds the total payload size limit.",
      });
      return [];
    }
    output.push({
      assetId: asset.id,
      path,
      sha256: asset.sha256,
      byteLength: asset.byteLength,
      mediaType: asset.mediaType,
      bytes,
    });
  }
  return output;
}

export function assetPath(asset: Pick<SceneAsset, "sha256" | "mediaType">): string {
  if (!SHA256_PATTERN.test(asset.sha256)) throw new Error("Asset SHA-256 is invalid.");
  const extension = asset.mediaType === "model/gltf-binary" ? "glb" : "gltf";
  return `assets/${asset.sha256}.${extension}`;
}

function rejected(blocker: PublishBlocker): PublishReadinessResult {
  return { ok: false, blockers: [blocker] };
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
