import { unzipSync, zipSync, type Zippable } from "fflate";

import { assertSafeArchivePath } from "./manifest.js";
import { MANIFEST_PATH, MAX_ARCHIVE_FILES, MAX_FILE_BYTES, MAX_TOTAL_BYTES } from "./types.js";

const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
const CENTRAL_DIRECTORY_FIXED_LENGTH = 46;
const END_OF_CENTRAL_DIRECTORY_LENGTH = 22;
const ZIP64_SENTINEL_16 = 0xffff;
const ZIP64_SENTINEL_32 = 0xffffffff;
const UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });
const ZIP_MTIME = new Date("1980-01-01T00:00:00.000Z");

export interface ZipEntryMetadata {
  readonly path: string;
  readonly compressedSize: number;
  readonly byteLength: number;
  readonly compression: number;
  readonly externalAttributes: number;
  readonly versionMadeBy: number;
}

export function encodeDeterministicZip(files: ReadonlyMap<string, Uint8Array>): Uint8Array {
  const input: Zippable = {};
  for (const path of [...files.keys()].sort()) {
    input[path] = [files.get(path)!, { level: 0, mtime: ZIP_MTIME }];
  }
  return zipSync(input, { level: 0, mtime: ZIP_MTIME });
}

export function decodeArchiveZip(bytes: Uint8Array): ReadonlyMap<string, Uint8Array> {
  const metadata = inspectZipMetadata(bytes);
  if (metadata.length === 0) {
    throw new Error("Archive ZIP is empty.");
  }
  if (metadata.length > MAX_ARCHIVE_FILES) {
    throw new Error(`Archive exceeds file count limit of ${MAX_ARCHIVE_FILES}.`);
  }

  let totalBytes = 0;
  for (const entry of metadata) {
    assertSafeArchivePath(entry.path);
    if (entry.byteLength < 1 || entry.byteLength > MAX_FILE_BYTES) {
      throw new Error(`Archive file ${entry.path} violates per-file size limit.`);
    }
    totalBytes += entry.byteLength;
    if (totalBytes > MAX_TOTAL_BYTES) {
      throw new Error("Archive payload exceeds total size limit.");
    }
    if (isUnsupportedUnixMode(entry.versionMadeBy, entry.externalAttributes)) {
      throw new Error(`Archive entry ${entry.path} uses an unsupported file type.`);
    }
  }

  const files = unzipSync(bytes);
  const output = new Map<string, Uint8Array>();
  for (const entry of metadata) {
    const file = files[entry.path];
    if (!file) {
      throw new Error(`Archive file ${entry.path} is missing from ZIP payload.`);
    }
    if (file.byteLength !== entry.byteLength) {
      throw new Error(`Archive file ${entry.path} length mismatch.`);
    }
    output.set(entry.path, file);
  }

  if (!output.has(MANIFEST_PATH)) {
    throw new Error("Archive ZIP must contain manifest.json.");
  }
  return output;
}

export function listPayloadPaths(files: ReadonlyMap<string, Uint8Array>): string[] {
  return [...files.keys()].filter((path) => path !== MANIFEST_PATH).sort();
}

function inspectZipMetadata(bytes: Uint8Array): ZipEntryMetadata[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocdOffset = findEndOfCentralDirectory(view);
  const entryCount = view.getUint16(eocdOffset + 10, true);
  const centralDirectorySize = view.getUint32(eocdOffset + 12, true);
  const centralDirectoryOffset = view.getUint32(eocdOffset + 16, true);

  if (
    entryCount === ZIP64_SENTINEL_16 ||
    centralDirectorySize === ZIP64_SENTINEL_32 ||
    centralDirectoryOffset === ZIP64_SENTINEL_32
  ) {
    throw new Error("ZIP64 archives are not supported.");
  }

  const entries: ZipEntryMetadata[] = [];
  const seen = new Set<string>();
  let offset = centralDirectoryOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + CENTRAL_DIRECTORY_FIXED_LENGTH > bytes.byteLength) {
      throw new Error("Archive central directory is truncated.");
    }
    if (view.getUint32(offset, true) !== CENTRAL_DIRECTORY_SIGNATURE) {
      throw new Error("Archive central directory is invalid.");
    }

    const versionMadeBy = view.getUint16(offset + 4, true);
    const compression = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const byteLength = view.getUint32(offset + 24, true);
    const fileNameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const externalAttributes = view.getUint32(offset + 38, true);
    const nameOffset = offset + CENTRAL_DIRECTORY_FIXED_LENGTH;
    const nameBytes = bytes.subarray(nameOffset, nameOffset + fileNameLength);
    const path = UTF8_DECODER.decode(nameBytes);

    if (seen.has(path)) {
      throw new Error(`Archive ZIP contains duplicate path ${path}.`);
    }
    seen.add(path);

    entries.push({
      path,
      compressedSize,
      byteLength,
      compression,
      externalAttributes,
      versionMadeBy,
    });

    offset += CENTRAL_DIRECTORY_FIXED_LENGTH + fileNameLength + extraLength + commentLength;
  }

  if (offset !== centralDirectoryOffset + centralDirectorySize) {
    throw new Error("Archive central directory size mismatch.");
  }

  return entries;
}

function findEndOfCentralDirectory(view: DataView): number {
  const minOffset = Math.max(0, view.byteLength - 0xffff - END_OF_CENTRAL_DIRECTORY_LENGTH);
  for (
    let offset = view.byteLength - END_OF_CENTRAL_DIRECTORY_LENGTH;
    offset >= minOffset;
    offset -= 1
  ) {
    if (view.getUint32(offset, true) === END_OF_CENTRAL_DIRECTORY_SIGNATURE) {
      return offset;
    }
  }
  throw new Error("Archive ZIP end-of-central-directory record not found.");
}

function isUnsupportedUnixMode(versionMadeBy: number, externalAttributes: number): boolean {
  const platform = versionMadeBy >> 8;
  if (platform !== 3) return false;
  const mode = (externalAttributes >>> 16) & 0o170000;
  return mode === 0o120000 || mode === 0o060000 || mode === 0o020000;
}
