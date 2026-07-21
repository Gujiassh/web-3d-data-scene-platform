import { importSceneArchive } from "@web3d/document";

import { studioAppErrors } from "../errors";
import type { StudioProjectSnapshot } from "../project";

export const DEFAULT_STARTER_DESCRIPTOR_PATH =
  import.meta.env["VITE_STARTER_DESCRIPTOR_PATH"] ?? "/starter/descriptor.json";

export interface StarterDescriptor {
  readonly schemaVersion: "1.0.0";
  readonly projectId: string;
  readonly archiveUrl: string;
  readonly archiveSha256: string;
  readonly archiveByteLength: number;
}

export interface StarterBootstrapOptions {
  readonly descriptorUrl: string;
  readonly signal: AbortSignal;
  readonly fetch?: typeof globalThis.fetch;
  readonly now?: () => Date;
}

export async function bootstrapStarterProject(
  options: StarterBootstrapOptions,
): Promise<StudioProjectSnapshot> {
  const fetchResource = options.fetch ?? globalThis.fetch;
  if (typeof fetchResource !== "function") {
    throw bootstrapError("fetch-unavailable", "Fetch is unavailable.");
  }

  assertActive(options.signal);
  const descriptorResponse = await fetchResource(options.descriptorUrl, {
    cache: "no-store",
    signal: options.signal,
  });
  if (!descriptorResponse.ok) {
    throw bootstrapError(
      "descriptor-fetch",
      `Descriptor request returned HTTP ${descriptorResponse.status}.`,
    );
  }
  const descriptor = parseStarterDescriptor(await descriptorResponse.json());
  assertActive(options.signal);

  const archiveUrl = resolveArchiveUrl(descriptor.archiveUrl, options.descriptorUrl);
  const archiveResponse = await fetchResource(archiveUrl, {
    cache: "no-store",
    signal: options.signal,
  });
  if (!archiveResponse.ok) {
    throw bootstrapError(
      "archive-fetch",
      `Archive request returned HTTP ${archiveResponse.status}.`,
    );
  }
  const archiveBytes = new Uint8Array(await archiveResponse.arrayBuffer());
  assertActive(options.signal);
  if (archiveBytes.byteLength !== descriptor.archiveByteLength) {
    throw bootstrapError(
      "archive-length",
      `Archive length mismatch: expected ${descriptor.archiveByteLength}, received ${archiveBytes.byteLength}.`,
    );
  }
  const receivedSha256 = await sha256Hex(archiveBytes);
  if (receivedSha256 !== descriptor.archiveSha256) {
    throw bootstrapError(
      "archive-hash",
      `Archive SHA-256 mismatch: expected ${descriptor.archiveSha256}, received ${receivedSha256}.`,
    );
  }

  const imported = await importSceneArchive(archiveBytes);
  assertActive(options.signal);
  if (imported.document.id !== descriptor.projectId) {
    throw bootstrapError(
      "project-id",
      `Starter project ID mismatch: expected ${descriptor.projectId}, received ${imported.document.id}.`,
    );
  }

  const timestamp = (options.now ?? (() => new Date()))().toISOString();
  return {
    record: {
      id: descriptor.projectId,
      name: imported.document.name,
      createdAt: timestamp,
      updatedAt: timestamp,
      lastOpenedAt: timestamp,
      lastSavedRevision: imported.document.revision,
      lastExportedRevision: null,
    },
    document: imported.document,
    assets: imported.assets.map((asset) => ({
      sha256: asset.sha256,
      mediaType: asset.mediaType,
      blob: new Blob([ownedArrayBuffer(asset.bytes)], { type: asset.mediaType }),
    })),
  };
}

export function parseStarterDescriptor(value: unknown): StarterDescriptor {
  const descriptor = requireRecord(value);
  if (descriptor["schemaVersion"] !== "1.0.0") {
    throw bootstrapError("descriptor-schema", "Descriptor schemaVersion must be 1.0.0.");
  }
  const projectId = requireString(descriptor, "projectId");
  const archiveUrl = requireString(descriptor, "archiveUrl");
  const archiveSha256 = requireString(descriptor, "archiveSha256");
  const archiveByteLength = descriptor["archiveByteLength"];
  if (!/^[A-Za-z][A-Za-z0-9._:-]*$/u.test(projectId)) {
    throw bootstrapError("descriptor-project-id", "Descriptor projectId is invalid.");
  }
  if (!/^[a-f0-9]{64}$/u.test(archiveSha256)) {
    throw bootstrapError("descriptor-hash", "Descriptor archiveSha256 is invalid.");
  }
  if (!Number.isSafeInteger(archiveByteLength) || (archiveByteLength as number) <= 0) {
    throw bootstrapError(
      "descriptor-length",
      "Descriptor archiveByteLength must be a positive safe integer.",
    );
  }
  return {
    schemaVersion: "1.0.0",
    projectId,
    archiveUrl,
    archiveSha256,
    archiveByteLength: archiveByteLength as number,
  };
}

function requireRecord(value: unknown): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw bootstrapError("descriptor-shape", "Starter descriptor must be an object.");
  }
  const keys = Object.keys(value).sort();
  const expected = [
    "archiveByteLength",
    "archiveSha256",
    "archiveUrl",
    "projectId",
    "schemaVersion",
  ];
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    throw bootstrapError("descriptor-fields", "Starter descriptor contains unsupported fields.");
  }
  return value as Readonly<Record<string, unknown>>;
}

function requireString(record: Readonly<Record<string, unknown>>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw bootstrapError("descriptor-field", `Descriptor ${key} must be a non-empty string.`);
  }
  return value;
}

function resolveArchiveUrl(value: string, descriptorUrl: string): string {
  try {
    return new URL(value, descriptorUrl).href;
  } catch {
    throw bootstrapError("archive-url", "Descriptor archiveUrl is invalid.");
  }
}

function assertActive(signal: AbortSignal): void {
  if (!signal.aborted) return;
  throw signal.reason instanceof Error
    ? signal.reason
    : new DOMException("Starter bootstrap was aborted.", "AbortError");
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", ownedArrayBuffer(bytes));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function ownedArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function bootstrapError(code: string, message: string): Error {
  return studioAppErrors.starterBootstrapFailed(code, message);
}
