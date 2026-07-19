import type { SceneDocument } from "./types.js";

export type DocumentDiagnosticCode =
  | "JSON_PARSE_ERROR"
  | "SCHEMA_ADDITIONAL_PROPERTY"
  | "SCHEMA_REQUIRED"
  | "SCHEMA_VALIDATION_FAILED"
  | "DUPLICATE_ID"
  | "ENTITY_PARENT_NOT_FOUND"
  | "ENTITY_PARENT_LIGHT"
  | "ENTITY_CYCLE"
  | "ENTITY_ASSET_NOT_FOUND"
  | "LIGHT_ENTITY_LIMIT_EXCEEDED"
  | "LIGHT_POINT_ROTATION_NOT_IDENTITY"
  | "LIGHT_ROTATION_NOT_NORMALIZED"
  | "LIGHT_SCALE_NOT_IDENTITY"
  | "TARGET_ENTITY_NOT_FOUND"
  | "TARGET_ENTITY_NOT_ASSET"
  | "TARGET_ASSET_HASH_MISMATCH"
  | "TARGET_NODE_INDEX_OUT_OF_RANGE"
  | "DATA_SOURCE_THRESHOLD_ORDER"
  | "BINDING_TARGET_NOT_FOUND"
  | "BINDING_SOURCE_NOT_FOUND"
  | "BINDING_RULE_SET_NOT_FOUND"
  | "BINDING_WRITE_CONFLICT"
  | "BINDING_WRITES_MISMATCH"
  | "RULE_LABEL_TOKEN_INVALID"
  | "ANNOTATION_TARGET_NOT_FOUND"
  | "ANNOTATION_SURFACE_ENTITY_NOT_FOUND"
  | "ANNOTATION_SURFACE_ENTITY_NOT_ASSET"
  | "ANNOTATION_SURFACE_ASSET_NOT_FOUND"
  | "ANNOTATION_SURFACE_ASSET_HASH_MISMATCH"
  | "ANNOTATION_SURFACE_NORMAL_NOT_UNIT"
  | "ANNOTATION_ACTION_TARGET_NOT_FOUND"
  | "ANNOTATION_LINK_INVALID"
  | "LIGHTING_DIRECTION_NOT_UNIT";

export interface DocumentDiagnostic {
  readonly code: DocumentDiagnosticCode;
  readonly path: string;
  readonly message: string;
  readonly relatedPaths?: readonly string[];
}

export type DocumentValidationResult =
  | { readonly ok: true; readonly value: SceneDocument; readonly diagnostics: readonly [] }
  | { readonly ok: false; readonly diagnostics: readonly DocumentDiagnostic[] };

export function sortDiagnostics(
  diagnostics: readonly DocumentDiagnostic[],
): readonly DocumentDiagnostic[] {
  return [...diagnostics].sort(
    (left, right) =>
      compare(left.path, right.path) ||
      compare(left.code, right.code) ||
      compare(left.message, right.message),
  );
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
