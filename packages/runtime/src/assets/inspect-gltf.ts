import type { AssetStats, SceneAsset } from "@web3d/document";
import { Group, Mesh } from "three";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";

import { disposeObject3D } from "./dispose-object";
import { sha256Hex } from "./asset-loader";

export const MAX_GLTF_INSPECTION_BYTES = 50 * 1024 * 1024;
const GLB_HEADER_BYTES = 12;
const GLB_MAGIC = 0x46546c67;
const GLB_VERSION = 2;
const NEAR_LIMIT_WARNING_BYTES = 45 * 1024 * 1024;

export interface GltfInspectionSummary {
  readonly name: string;
  readonly mediaType: SceneAsset["mediaType"];
  readonly byteLength: number;
  readonly sha256: string;
  readonly stats: AssetStats;
  readonly warnings: readonly string[];
}

export class InspectGltfError extends Error {
  readonly code: string;

  constructor(code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "InspectGltfError";
    this.code = code;
  }
}

export async function inspectGltf(
  name: string,
  bytes: ArrayBuffer,
): Promise<GltfInspectionSummary> {
  if (bytes.byteLength > MAX_GLTF_INSPECTION_BYTES) {
    throw new InspectGltfError(
      "INSPECT_GLTF_TOO_LARGE",
      `Model exceeds the 50 MiB limit: ${bytes.byteLength} bytes.`,
    );
  }

  const mediaType = detectMediaType(name, bytes);
  const parseInput =
    mediaType === "model/gltf-binary" ? validateGlb(bytes) : validateGltfJson(bytes);
  const sha256 = await sha256Hex(bytes);

  let gltf: GLTF | undefined;
  try {
    gltf = await new GLTFLoader().parseAsync(parseInput, "");
    assertSingleScene(gltf);

    const stats = collectStats(gltf);
    const warnings = collectWarnings(bytes.byteLength);
    return freezeSummary({
      name,
      mediaType,
      byteLength: bytes.byteLength,
      sha256,
      stats,
      warnings,
    });
  } catch (error) {
    if (error instanceof InspectGltfError) throw error;
    throw new InspectGltfError(
      "INSPECT_GLTF_PARSE_FAILED",
      "GLTFLoader could not parse the asset.",
      { cause: error },
    );
  } finally {
    if (gltf !== undefined) disposeParsedGltf(gltf);
  }
}

function detectMediaType(name: string, bytes: ArrayBuffer): SceneAsset["mediaType"] {
  const extension = fileExtension(name);
  if (extension === "glb") return "model/gltf-binary";
  if (extension === "gltf") return "model/gltf+json";
  if (hasGlbMagic(bytes)) return "model/gltf-binary";
  if (looksLikeJson(bytes)) return "model/gltf+json";
  throw new InspectGltfError(
    "INSPECT_GLTF_TYPE_UNSUPPORTED",
    `Model ${name} is not recognizable as GLB or glTF.`,
  );
}

function validateGlb(bytes: ArrayBuffer): ArrayBuffer {
  if (bytes.byteLength < GLB_HEADER_BYTES) {
    throw new InspectGltfError("INSPECT_GLB_HEADER_INVALID", "GLB header is incomplete.");
  }
  const header = new DataView(bytes, 0, GLB_HEADER_BYTES);
  if (header.getUint32(0, true) !== GLB_MAGIC) {
    throw new InspectGltfError("INSPECT_GLB_HEADER_INVALID", "GLB magic is invalid.");
  }
  if (header.getUint32(4, true) !== GLB_VERSION) {
    throw new InspectGltfError(
      "INSPECT_GLB_VERSION_UNSUPPORTED",
      `GLB version must be ${GLB_VERSION}.`,
    );
  }
  if (header.getUint32(8, true) !== bytes.byteLength) {
    throw new InspectGltfError(
      "INSPECT_GLB_LENGTH_MISMATCH",
      "GLB declared length does not match the file length.",
    );
  }
  return bytes;
}

function validateGltfJson(bytes: ArrayBuffer): string {
  const text = decodeUtf8(bytes);
  let document: GltfJsonDocument;
  try {
    document = JSON.parse(text) as GltfJsonDocument;
  } catch (error) {
    throw new InspectGltfError("INSPECT_GLTF_JSON_INVALID", "glTF JSON is invalid.", {
      cause: error,
    });
  }

  if (document === null || typeof document !== "object" || Array.isArray(document)) {
    throw new InspectGltfError("INSPECT_GLTF_JSON_INVALID", "glTF JSON must be an object.");
  }

  assertNoExternalUris(document.buffers, "buffer");
  assertNoExternalUris(document.images, "image");
  return text;
}

function assertNoExternalUris(
  items: readonly { readonly uri?: string }[] | undefined,
  kind: "buffer" | "image",
): void {
  for (const item of items ?? []) {
    if (item?.uri === undefined) continue;
    if (/^data:/i.test(item.uri)) continue;
    throw new InspectGltfError(
      "INSPECT_GLTF_EXTERNAL_URI_UNSUPPORTED",
      `glTF ${kind} uses unsupported external URI ${item.uri}.`,
    );
  }
}

function assertSingleScene(gltf: GLTF): void {
  if (gltf.scenes.length !== 1) {
    throw new InspectGltfError(
      "INSPECT_GLTF_MULTISCENE_UNSUPPORTED",
      `M1 requires one glTF scene; asset contains ${gltf.scenes.length}.`,
    );
  }
}

function collectStats(gltf: GLTF): AssetStats {
  const parser = gltf.parser as ParserLike;
  const associations = parser.associations ?? new Map<object, Association>();
  const nodes = new Set<number>();
  let triangles = 0;

  gltf.scene.traverse((object) => {
    const association = associations.get(object);
    if (association?.nodes !== undefined) nodes.add(association.nodes);
    if (object instanceof Mesh) triangles += triangleCount(object);
  });

  return Object.freeze({
    nodeCount: parser.json?.nodes?.length ?? nodes.size,
    meshCount: parser.json?.meshes?.length ?? 0,
    materialCount: parser.json?.materials?.length ?? 0,
    triangleCount: triangles,
  });
}

function triangleCount(mesh: Mesh): number {
  const { geometry } = mesh;
  if (geometry.index !== null) return Math.floor(geometry.index.count / 3);
  const positions = geometry.getAttribute("position");
  if (positions === undefined) return 0;
  return Math.floor(positions.count / 3);
}

function collectWarnings(byteLength: number): readonly string[] {
  if (byteLength >= NEAR_LIMIT_WARNING_BYTES) {
    return Object.freeze(["Model is close to the 50 MiB import limit."]);
  }
  return Object.freeze([]);
}

function freezeSummary(summary: GltfInspectionSummary): GltfInspectionSummary {
  return Object.freeze({
    ...summary,
    stats: Object.freeze({ ...summary.stats }),
    warnings: Object.freeze([...summary.warnings]),
  });
}

function disposeParsedGltf(gltf: GLTF): void {
  const cleanupRoot = new Group();
  for (const scene of gltf.scenes) cleanupRoot.add(scene);
  disposeObject3D(cleanupRoot);
}

function fileExtension(name: string): string | null {
  const normalized = name.trim().toLowerCase();
  const slash = Math.max(normalized.lastIndexOf("/"), normalized.lastIndexOf("\\"));
  const base = slash >= 0 ? normalized.slice(slash + 1) : normalized;
  const dot = base.lastIndexOf(".");
  return dot >= 0 ? base.slice(dot + 1) : null;
}

function hasGlbMagic(bytes: ArrayBuffer): boolean {
  if (bytes.byteLength < 4) return false;
  return new DataView(bytes, 0, 4).getUint32(0, true) === GLB_MAGIC;
}

function looksLikeJson(bytes: ArrayBuffer): boolean {
  const prefix = decodeUtf8(bytes.slice(0, Math.min(bytes.byteLength, 64))).trimStart();
  return prefix.startsWith("{");
}

function decodeUtf8(bytes: ArrayBuffer): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

interface Association {
  readonly nodes?: number;
}

interface GltfJsonDocument {
  readonly buffers?: readonly { readonly uri?: string }[];
  readonly images?: readonly { readonly uri?: string }[];
}

interface ParserLike {
  readonly associations?: ReadonlyMap<object, Association>;
  readonly json?: {
    readonly nodes?: readonly unknown[];
    readonly meshes?: readonly unknown[];
    readonly materials?: readonly unknown[];
  };
}
