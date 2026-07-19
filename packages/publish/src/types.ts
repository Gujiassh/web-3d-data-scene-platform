import type { SceneDocument } from "@web3d/document";
import type { AssetResolver } from "@web3d/runtime";

export const PUBLISH_VERSION = "1.0.0" as const;
export const PUBLISH_MANIFEST_PATH = "publish-manifest.json" as const;
export const PUBLISH_SCENE_PATH = "scene.json" as const;

export type PublishMediaType = "application/json" | "model/gltf-binary" | "model/gltf+json";

export interface PublishFile {
  readonly path: string;
  readonly sha256: string;
  readonly byteLength: number;
  readonly mediaType: PublishMediaType;
}

export interface PublishDataSourceRequirement {
  readonly sourceId: string;
  readonly adapter: "mock" | "websocket";
}

export interface PublishRequirements {
  readonly dataSources: readonly PublishDataSourceRequirement[];
  readonly trustedContentKeys: readonly string[];
}

export interface PublishManifest {
  readonly publishVersion: typeof PUBLISH_VERSION;
  readonly sceneSchemaVersion: "1.4.0";
  readonly documentId: string;
  readonly revision: number;
  readonly entry: typeof PUBLISH_SCENE_PATH;
  readonly files: readonly PublishFile[];
  readonly requirements: PublishRequirements;
}

export type PublishBlockerCode =
  | "PUBLISH_DOCUMENT_INVALID"
  | "PUBLISH_DOCUMENT_VERSION_UNSUPPORTED"
  | "PUBLISH_LEGACY_HOTSPOT"
  | "PUBLISH_SURFACE_EVIDENCE_MISSING"
  | "PUBLISH_SURFACE_EVIDENCE_DUPLICATE"
  | "PUBLISH_SURFACE_EVIDENCE_UNKNOWN"
  | "PUBLISH_SURFACE_EVIDENCE_STALE"
  | "PUBLISH_SURFACE_UNRESOLVED"
  | "PUBLISH_ASSET_MISSING"
  | "PUBLISH_ASSET_LENGTH_MISMATCH"
  | "PUBLISH_ASSET_HASH_MISMATCH"
  | "PUBLISH_ASSET_PATH_CONFLICT"
  | "PUBLISH_BUNDLE_LIMIT_EXCEEDED";

export interface PublishBlocker {
  readonly code: PublishBlockerCode;
  readonly message: string;
  readonly annotationId?: string;
  readonly assetId?: string;
  readonly path?: string;
}

export interface PublishSurfaceEvidence {
  readonly annotationId: string;
  readonly documentId: string;
  readonly documentRevision: number;
  readonly resolution: "resolved" | "unresolved";
}

export type PublishAssetBytesResolver = (
  sha256: string,
  signal: AbortSignal,
) => Uint8Array | Promise<Uint8Array>;

export interface InspectPublishReadinessOptions {
  readonly document: SceneDocument;
  readonly surfaceEvidence: readonly PublishSurfaceEvidence[];
  readonly resolveAssetBytes: PublishAssetBytesResolver;
  readonly signal?: AbortSignal;
}

export interface ReadyPublishAsset {
  readonly assetId: string;
  readonly path: string;
  readonly sha256: string;
  readonly byteLength: number;
  readonly mediaType: Exclude<PublishMediaType, "application/json">;
  readonly bytes: Uint8Array;
}

export interface ReadyPublishSnapshot {
  readonly document: SceneDocument;
  readonly assets: readonly ReadyPublishAsset[];
  readonly requirements: PublishRequirements;
}

export type PublishReadinessResult =
  | { readonly ok: true; readonly value: ReadyPublishSnapshot }
  | { readonly ok: false; readonly blockers: readonly PublishBlocker[] };

export interface PublishBundle {
  readonly manifest: PublishManifest;
  readonly files: ReadonlyMap<string, Uint8Array>;
  readonly zipBytes: Uint8Array;
}

export type PublishLoadErrorCode =
  | "PUBLISH_BASE_URL_INVALID"
  | "PUBLISH_FETCH_FAILED"
  | "PUBLISH_MANIFEST_INVALID"
  | "PUBLISH_SCENE_INVALID"
  | "PUBLISH_FILE_LENGTH_MISMATCH"
  | "PUBLISH_FILE_HASH_MISMATCH"
  | "PUBLISH_ASSET_NOT_DECLARED";

export interface LoadPublishedSceneOptions {
  readonly baseUrl: string | URL;
  readonly fetch?: typeof globalThis.fetch;
  readonly signal?: AbortSignal;
}

export interface LoadedPublishedScene {
  readonly document: SceneDocument;
  readonly manifest: PublishManifest;
  readonly assetResolver: AssetResolver;
}
