import {
  MAX_FILE_BYTES,
  parseSceneDocument,
  serializeSceneDocument,
  validateSceneDocument,
  type SceneAsset,
} from "@web3d/document";

import { sha256Hex } from "./hash.js";
import { decodePublishManifest } from "./manifest.js";
import {
  PUBLISH_MANIFEST_PATH,
  PUBLISH_SCENE_PATH,
  type LoadPublishedSceneOptions,
  type LoadedPublishedScene,
  type PublishFile,
  type PublishLoadErrorCode,
} from "./types.js";

const decoder = new TextDecoder("utf-8", { fatal: true });
const encoder = new TextEncoder();

export class PublishLoadError extends Error {
  readonly code: PublishLoadErrorCode;
  readonly path: string | undefined;

  constructor(code: PublishLoadErrorCode, message: string, path?: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "PublishLoadError";
    this.code = code;
    this.path = path;
  }
}

export async function loadPublishedScene(
  options: LoadPublishedSceneOptions,
): Promise<LoadedPublishedScene> {
  options.signal?.throwIfAborted();
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const fetchValue = options.fetch ?? globalThis.fetch;
  if (typeof fetchValue !== "function") {
    throw new PublishLoadError("PUBLISH_FETCH_FAILED", "No fetch implementation is available.");
  }

  const manifestBytes = await fetchBytes(
    fetchValue,
    new URL(PUBLISH_MANIFEST_PATH, baseUrl),
    options.signal,
    PUBLISH_MANIFEST_PATH,
  );
  let manifest;
  try {
    manifest = decodePublishManifest(manifestBytes);
  } catch (error) {
    throw new PublishLoadError(
      "PUBLISH_MANIFEST_INVALID",
      errorMessage(error),
      PUBLISH_MANIFEST_PATH,
      { cause: error },
    );
  }

  const sceneFile = manifest.files.find((file) => file.path === PUBLISH_SCENE_PATH)!;
  const sceneBytes = await fetchVerifiedFile(fetchValue, baseUrl, sceneFile, options.signal);
  let document;
  try {
    const text = decoder.decode(sceneBytes);
    const raw = JSON.parse(text) as unknown;
    if (
      raw === null ||
      typeof raw !== "object" ||
      Array.isArray(raw) ||
      (raw as Record<string, unknown>)["schemaVersion"] !== "1.4.0"
    ) {
      throw new Error("Published scene.json must declare schemaVersion 1.4.0.");
    }
    const parsed = parseSceneDocument(text);
    if (!parsed.ok)
      throw new Error(parsed.diagnostics[0]?.message ?? "SceneDocument parse failed.");
    const validation = validateSceneDocument(parsed.value);
    if (!validation.ok) {
      throw new Error(validation.diagnostics[0]?.message ?? "SceneDocument validation failed.");
    }
    const canonical = encoder.encode(`${serializeSceneDocument(validation.value)}\n`);
    if (!equalBytes(sceneBytes, canonical))
      throw new Error("Published scene.json must use canonical encoding.");
    if (
      validation.value.id !== manifest.documentId ||
      validation.value.revision !== manifest.revision
    ) {
      throw new Error("Published scene identity does not match the manifest.");
    }
    document = validation.value;
  } catch (error) {
    throw new PublishLoadError("PUBLISH_SCENE_INVALID", errorMessage(error), PUBLISH_SCENE_PATH, {
      cause: error,
    });
  }

  const filesByPath = new Map(manifest.files.map((file) => [file.path, file]));
  return {
    document,
    manifest,
    assetResolver: {
      async resolve(asset: SceneAsset, signal: AbortSignal) {
        signal.throwIfAborted();
        const path = assetPath(asset);
        const file = filesByPath.get(path);
        if (
          file === undefined ||
          file.sha256 !== asset.sha256 ||
          file.byteLength !== asset.byteLength ||
          file.mediaType !== asset.mediaType
        ) {
          throw new PublishLoadError(
            "PUBLISH_ASSET_NOT_DECLARED",
            `Asset ${asset.id} is not declared by the publish manifest.`,
            path,
          );
        }
        const bytes = await fetchVerifiedFile(fetchValue, baseUrl, file, signal);
        return new Blob([ownedArrayBuffer(bytes)], { type: asset.mediaType });
      },
    },
  };
}

function normalizeBaseUrl(value: string | URL): URL {
  let url: URL;
  try {
    const fallback =
      typeof globalThis.location === "undefined" ? undefined : globalThis.location.href;
    url = value instanceof URL ? new URL(value.href) : new URL(value, fallback);
  } catch (error) {
    throw new PublishLoadError(
      "PUBLISH_BASE_URL_INVALID",
      "Published scene base URL is invalid.",
      undefined,
      {
        cause: error,
      },
    );
  }
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username !== "" ||
    url.password !== "" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new PublishLoadError(
      "PUBLISH_BASE_URL_INVALID",
      "Published scene base URL must be an HTTP(S) directory URL without credentials, query or fragment.",
    );
  }
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  return url;
}

async function fetchVerifiedFile(
  fetchValue: typeof globalThis.fetch,
  baseUrl: URL,
  file: PublishFile,
  signal: AbortSignal | undefined,
): Promise<Uint8Array> {
  const bytes = await fetchBytes(fetchValue, new URL(file.path, baseUrl), signal, file.path);
  if (bytes.byteLength !== file.byteLength) {
    throw new PublishLoadError(
      "PUBLISH_FILE_LENGTH_MISMATCH",
      `Published file ${file.path} length does not match the manifest.`,
      file.path,
    );
  }
  if ((await sha256Hex(bytes)) !== file.sha256) {
    throw new PublishLoadError(
      "PUBLISH_FILE_HASH_MISMATCH",
      `Published file ${file.path} hash does not match the manifest.`,
      file.path,
    );
  }
  return bytes;
}

async function fetchBytes(
  fetchValue: typeof globalThis.fetch,
  url: URL,
  signal: AbortSignal | undefined,
  path: string,
): Promise<Uint8Array> {
  signal?.throwIfAborted();
  let response: Response;
  try {
    response = await fetchValue(url, {
      credentials: "omit",
      ...(signal === undefined ? {} : { signal }),
    });
  } catch (error) {
    signal?.throwIfAborted();
    throw new PublishLoadError(
      "PUBLISH_FETCH_FAILED",
      `Failed to fetch published file ${path}.`,
      path,
      { cause: error },
    );
  }
  if (!response.ok) {
    throw new PublishLoadError(
      "PUBLISH_FETCH_FAILED",
      `Published file ${path} returned HTTP ${response.status}.`,
      path,
    );
  }
  const declaredLength = response.headers.get("content-length");
  if (declaredLength !== null && Number(declaredLength) > MAX_FILE_BYTES) {
    throw new PublishLoadError(
      "PUBLISH_FILE_LENGTH_MISMATCH",
      `Published file ${path} exceeds the per-file size limit.`,
      path,
    );
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength < 1 || bytes.byteLength > MAX_FILE_BYTES) {
    throw new PublishLoadError(
      "PUBLISH_FILE_LENGTH_MISMATCH",
      `Published file ${path} violates the per-file size limit.`,
      path,
    );
  }
  return bytes;
}

function assetPath(asset: Pick<SceneAsset, "sha256" | "mediaType">): string {
  const extension = asset.mediaType === "model/gltf-binary" ? "glb" : "gltf";
  return `assets/${asset.sha256}.${extension}`;
}

function ownedArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const output = new Uint8Array(bytes.byteLength);
  output.set(bytes);
  return output.buffer;
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  return left.every((byte, index) => byte === right[index]);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
