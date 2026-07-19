import { MAX_ARCHIVE_FILES, MAX_FILE_BYTES, MAX_TOTAL_BYTES } from "@web3d/document";

import {
  PUBLISH_SCENE_PATH,
  PUBLISH_VERSION,
  type PublishDataSourceRequirement,
  type PublishFile,
  type PublishManifest,
  type PublishMediaType,
  type PublishRequirements,
} from "./types.js";

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const SAFE_PATH_PATTERN = /^[A-Za-z0-9._-][A-Za-z0-9._/-]*$/;
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

export function buildPublishManifest(options: {
  readonly documentId: string;
  readonly revision: number;
  readonly files: readonly PublishFile[];
  readonly requirements: PublishRequirements;
}): PublishManifest {
  const manifest: PublishManifest = {
    publishVersion: PUBLISH_VERSION,
    sceneSchemaVersion: "1.4.0",
    documentId: options.documentId,
    revision: options.revision,
    entry: PUBLISH_SCENE_PATH,
    files: [...options.files].sort(compareFile),
    requirements: {
      dataSources: [...options.requirements.dataSources].sort(compareDataSource),
      trustedContentKeys: [...options.requirements.trustedContentKeys].sort(compare),
    },
  };
  validatePublishManifest(manifest);
  return manifest;
}

export function parsePublishManifest(value: unknown): PublishManifest {
  const root = requireRecord(value, "Publish manifest");
  assertExactKeys(root, [
    "publishVersion",
    "sceneSchemaVersion",
    "documentId",
    "revision",
    "entry",
    "files",
    "requirements",
  ]);
  if (root["publishVersion"] !== PUBLISH_VERSION) {
    throw new Error(`publishVersion must be ${PUBLISH_VERSION}.`);
  }
  if (root["sceneSchemaVersion"] !== "1.4.0") {
    throw new Error("sceneSchemaVersion must be 1.4.0.");
  }
  if (root["entry"] !== PUBLISH_SCENE_PATH) {
    throw new Error(`entry must be ${PUBLISH_SCENE_PATH}.`);
  }
  const documentId = requireNonEmptyString(root["documentId"], "documentId");
  const revision = requireNonNegativeInteger(root["revision"], "revision");
  if (!Array.isArray(root["files"])) throw new Error("files must be an array.");
  const files = root["files"].map(parsePublishFile);
  const requirements = parseRequirements(root["requirements"]);
  const manifest: PublishManifest = {
    publishVersion: PUBLISH_VERSION,
    sceneSchemaVersion: "1.4.0",
    documentId,
    revision,
    entry: PUBLISH_SCENE_PATH,
    files,
    requirements,
  };
  validatePublishManifest(manifest);
  return manifest;
}

export function decodePublishManifest(bytes: Uint8Array): PublishManifest {
  let value: unknown;
  try {
    value = JSON.parse(decoder.decode(bytes));
  } catch {
    throw new Error("Publish manifest must be valid UTF-8 JSON.");
  }
  const manifest = parsePublishManifest(value);
  if (!equalBytes(bytes, serializePublishManifest(manifest))) {
    throw new Error("Publish manifest must use canonical encoding.");
  }
  return manifest;
}

export function serializePublishManifest(manifest: PublishManifest): Uint8Array {
  validatePublishManifest(manifest);
  const canonical = {
    publishVersion: manifest.publishVersion,
    sceneSchemaVersion: manifest.sceneSchemaVersion,
    documentId: manifest.documentId,
    revision: manifest.revision,
    entry: manifest.entry,
    files: manifest.files.map((file) => ({
      path: file.path,
      sha256: file.sha256,
      byteLength: file.byteLength,
      mediaType: file.mediaType,
    })),
    requirements: {
      dataSources: manifest.requirements.dataSources.map((source) => ({
        sourceId: source.sourceId,
        adapter: source.adapter,
      })),
      trustedContentKeys: [...manifest.requirements.trustedContentKeys],
    },
  };
  return encoder.encode(`${JSON.stringify(canonical, null, 2)}\n`);
}

export function validatePublishManifest(manifest: PublishManifest): void {
  if (manifest.publishVersion !== PUBLISH_VERSION) {
    throw new Error(`publishVersion must be ${PUBLISH_VERSION}.`);
  }
  if (manifest.sceneSchemaVersion !== "1.4.0") {
    throw new Error("sceneSchemaVersion must be 1.4.0.");
  }
  requireNonEmptyString(manifest.documentId, "documentId");
  requireNonNegativeInteger(manifest.revision, "revision");
  if (manifest.entry !== PUBLISH_SCENE_PATH)
    throw new Error(`entry must be ${PUBLISH_SCENE_PATH}.`);
  if (manifest.files.length + 1 > MAX_ARCHIVE_FILES) {
    throw new Error(`Publish bundle exceeds file count limit of ${MAX_ARCHIVE_FILES}.`);
  }

  let sceneCount = 0;
  let totalBytes = 0;
  let previousPath: string | null = null;
  const paths = new Set<string>();
  for (const file of manifest.files) {
    validatePublishFile(file);
    if (paths.has(file.path))
      throw new Error(`Publish manifest contains duplicate path ${file.path}.`);
    paths.add(file.path);
    if (previousPath !== null && compare(previousPath, file.path) >= 0) {
      throw new Error("Publish manifest files must be sorted by path.");
    }
    previousPath = file.path;
    totalBytes += file.byteLength;
    if (totalBytes > MAX_TOTAL_BYTES) throw new Error("Publish payload exceeds total size limit.");
    if (file.path === PUBLISH_SCENE_PATH) {
      sceneCount += 1;
      if (file.mediaType !== "application/json") {
        throw new Error("scene.json must use application/json media type.");
      }
    }
  }
  if (sceneCount !== 1)
    throw new Error("Publish manifest must contain exactly one scene.json file.");
  validateRequirements(manifest.requirements);
}

export function assertSafePublishPath(path: string): void {
  if (!SAFE_PATH_PATTERN.test(path) || path.includes("\\") || path.startsWith("/")) {
    throw new Error(`Publish path ${path} is not safe.`);
  }
  const segments = path.split("/");
  if (segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")) {
    throw new Error(`Publish path ${path} is not safe.`);
  }
}

function parsePublishFile(value: unknown): PublishFile {
  const record = requireRecord(value, "Publish file");
  assertExactKeys(record, ["path", "sha256", "byteLength", "mediaType"]);
  const file: PublishFile = {
    path: requireNonEmptyString(record["path"], "file.path"),
    sha256: requireNonEmptyString(record["sha256"], "file.sha256"),
    byteLength: requireNonNegativeInteger(record["byteLength"], "file.byteLength"),
    mediaType: requireMediaType(record["mediaType"]),
  };
  validatePublishFile(file);
  return file;
}

function validatePublishFile(file: PublishFile): void {
  assertSafePublishPath(file.path);
  if (!SHA256_PATTERN.test(file.sha256))
    throw new Error(`Publish file ${file.path} SHA-256 is invalid.`);
  if (
    !Number.isInteger(file.byteLength) ||
    file.byteLength < 1 ||
    file.byteLength > MAX_FILE_BYTES
  ) {
    throw new Error(`Publish file ${file.path} violates the per-file size limit.`);
  }
  requireMediaType(file.mediaType);
}

function parseRequirements(value: unknown): PublishRequirements {
  const record = requireRecord(value, "requirements");
  assertExactKeys(record, ["dataSources", "trustedContentKeys"]);
  if (!Array.isArray(record["dataSources"]))
    throw new Error("requirements.dataSources must be an array.");
  if (!Array.isArray(record["trustedContentKeys"])) {
    throw new Error("requirements.trustedContentKeys must be an array.");
  }
  return {
    dataSources: record["dataSources"].map(parseDataSourceRequirement),
    trustedContentKeys: record["trustedContentKeys"].map((item) =>
      requireNonEmptyString(item, "trustedContentKey"),
    ),
  };
}

function parseDataSourceRequirement(value: unknown): PublishDataSourceRequirement {
  const record = requireRecord(value, "dataSource requirement");
  assertExactKeys(record, ["sourceId", "adapter"]);
  const adapter = record["adapter"];
  if (adapter !== "mock" && adapter !== "websocket") {
    throw new Error("Data source adapter must be mock or websocket.");
  }
  return {
    sourceId: requireNonEmptyString(record["sourceId"], "sourceId"),
    adapter,
  };
}

function validateRequirements(requirements: PublishRequirements): void {
  let previousSourceId: string | null = null;
  const sources = new Set<string>();
  for (const source of requirements.dataSources) {
    requireNonEmptyString(source.sourceId, "sourceId");
    if (source.adapter !== "mock" && source.adapter !== "websocket") {
      throw new Error("Data source adapter must be mock or websocket.");
    }
    if (sources.has(source.sourceId)) throw new Error(`Duplicate data source ${source.sourceId}.`);
    if (previousSourceId !== null && compare(previousSourceId, source.sourceId) >= 0) {
      throw new Error("Data source requirements must be sorted by sourceId.");
    }
    sources.add(source.sourceId);
    previousSourceId = source.sourceId;
  }

  let previousKey: string | null = null;
  const keys = new Set<string>();
  for (const key of requirements.trustedContentKeys) {
    requireNonEmptyString(key, "trustedContentKey");
    if (keys.has(key)) throw new Error(`Duplicate trusted content key ${key}.`);
    if (previousKey !== null && compare(previousKey, key) >= 0) {
      throw new Error("Trusted content keys must be sorted.");
    }
    keys.add(key);
    previousKey = key;
  }
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function assertExactKeys(record: Record<string, unknown>, expected: readonly string[]): void {
  const keys = Object.keys(record).sort(compare);
  const wanted = [...expected].sort(compare);
  if (keys.length !== wanted.length || keys.some((key, index) => key !== wanted[index])) {
    throw new Error(
      `Unsupported properties: ${keys.filter((key) => !wanted.includes(key)).join(", ") || "missing required property"}.`,
    );
  }
}

function requireNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0)
    throw new Error(`${label} must be a non-empty string.`);
  return value;
}

function requireNonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
  return value as number;
}

function requireMediaType(value: unknown): PublishMediaType {
  if (
    value !== "application/json" &&
    value !== "model/gltf-binary" &&
    value !== "model/gltf+json"
  ) {
    throw new Error("Publish file mediaType is unsupported.");
  }
  return value;
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  return left.every((byte, index) => byte === right[index]);
}

function compareFile(left: PublishFile, right: PublishFile): number {
  return compare(left.path, right.path);
}

function compareDataSource(
  left: PublishDataSourceRequirement,
  right: PublishDataSourceRequirement,
): number {
  return compare(left.sourceId, right.sourceId);
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
