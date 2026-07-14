import type { SceneDocument } from "./types.js";

const ID_SORTED_TOP_LEVEL_ARRAYS = new Set([
  "assets",
  "entities",
  "targets",
  "dataSources",
  "bindings",
  "ruleSets",
  "annotations",
  "views",
]);

export function serializeSceneDocument(document: SceneDocument, space = 2): string {
  return JSON.stringify(canonicalize(document, true), null, space);
}

function canonicalize(value: unknown, isRoot = false): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalize(item));
  }

  if (value === null || typeof value !== "object") {
    return value;
  }

  const input = value as Readonly<Record<string, unknown>>;
  const output: Record<string, unknown> = {};
  for (const key of Object.keys(input).sort(compare)) {
    const child = input[key];
    if (isRoot && ID_SORTED_TOP_LEVEL_ARRAYS.has(key) && Array.isArray(child)) {
      output[key] = [...child]
        .sort((left, right) => compare(getId(left), getId(right)))
        .map((item) => canonicalize(item));
    } else {
      output[key] = canonicalize(child);
    }
  }
  return output;
}

function getId(value: unknown): string {
  if (value !== null && typeof value === "object" && "id" in value) {
    return String(value.id);
  }
  return "";
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
