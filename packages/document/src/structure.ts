import validateSchema from "./generated/scene-document.validator.js";
import validateSchema1_0 from "./generated/scene-document-1.0.validator.js";
import validateSchema1_1 from "./generated/scene-document-1.1.validator.js";
import validateSchema1_2 from "./generated/scene-document-1.2.validator.js";
import validateSchema1_3 from "./generated/scene-document-1.3.validator.js";
import {
  sortDiagnostics,
  type DocumentDiagnostic,
  type DocumentValidationResult,
} from "./diagnostics.js";
import type { SceneDocument } from "./types.js";

export type SceneDocument1_0ValidationResult =
  | { readonly ok: true; readonly value: unknown; readonly diagnostics: readonly [] }
  | { readonly ok: false; readonly diagnostics: readonly DocumentDiagnostic[] };

export type SceneDocument1_1ValidationResult = SceneDocument1_0ValidationResult;
export type SceneDocument1_2ValidationResult = SceneDocument1_0ValidationResult;
export type SceneDocument1_3ValidationResult = SceneDocument1_0ValidationResult;

export function validateSceneDocumentStructure(value: unknown): DocumentValidationResult {
  if (validateSchema(value)) {
    return { ok: true, value: value as SceneDocument, diagnostics: [] };
  }

  const diagnostics = (validateSchema.errors ?? []).map(toDiagnostic);
  return { ok: false, diagnostics: sortDiagnostics(diagnostics) };
}

export function validateSceneDocument1_0Structure(
  value: unknown,
): SceneDocument1_0ValidationResult {
  if (validateSchema1_0(value)) {
    return { ok: true, value, diagnostics: [] };
  }

  return {
    ok: false,
    diagnostics: sortDiagnostics((validateSchema1_0.errors ?? []).map(toDiagnostic)),
  };
}

export function validateSceneDocument1_1Structure(
  value: unknown,
): SceneDocument1_1ValidationResult {
  if (validateSchema1_1(value)) {
    return { ok: true, value, diagnostics: [] };
  }

  return {
    ok: false,
    diagnostics: sortDiagnostics((validateSchema1_1.errors ?? []).map(toDiagnostic)),
  };
}

export function validateSceneDocument1_2Structure(
  value: unknown,
): SceneDocument1_2ValidationResult {
  if (validateSchema1_2(value)) {
    return { ok: true, value, diagnostics: [] };
  }

  return {
    ok: false,
    diagnostics: sortDiagnostics((validateSchema1_2.errors ?? []).map(toDiagnostic)),
  };
}

export function validateSceneDocument1_3Structure(
  value: unknown,
): SceneDocument1_3ValidationResult {
  if (validateSchema1_3(value)) {
    return { ok: true, value, diagnostics: [] };
  }

  return {
    ok: false,
    diagnostics: sortDiagnostics((validateSchema1_3.errors ?? []).map(toDiagnostic)),
  };
}

function toDiagnostic(error: {
  readonly instancePath: string;
  readonly keyword: string;
  readonly params: Readonly<Record<string, unknown>>;
}): DocumentDiagnostic {
  if (error.keyword === "required") {
    const property = String(error.params["missingProperty"] ?? "");
    return {
      code: "SCHEMA_REQUIRED",
      path: appendPointer(error.instancePath, property),
      message: "Required property is missing.",
    };
  }

  if (error.keyword === "additionalProperties") {
    const property = String(error.params["additionalProperty"] ?? "");
    return {
      code: "SCHEMA_ADDITIONAL_PROPERTY",
      path: appendPointer(error.instancePath, property),
      message: "Unknown property is not allowed.",
    };
  }

  return {
    code: "SCHEMA_VALIDATION_FAILED",
    path: error.instancePath,
    message: `Value violates schema rule '${error.keyword}'.`,
  };
}

function appendPointer(base: string, token: string): string {
  const escaped = token.replaceAll("~", "~0").replaceAll("/", "~1");
  return `${base}/${escaped}`;
}
