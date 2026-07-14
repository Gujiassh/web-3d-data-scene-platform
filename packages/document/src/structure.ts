import validateSchema from "./generated/scene-document.validator.js";
import {
  sortDiagnostics,
  type DocumentDiagnostic,
  type DocumentValidationResult,
} from "./diagnostics.js";
import type { SceneDocument } from "./types.js";

export function validateSceneDocumentStructure(value: unknown): DocumentValidationResult {
  if (validateSchema(value)) {
    return { ok: true, value: value as SceneDocument, diagnostics: [] };
  }

  const diagnostics = (validateSchema.errors ?? []).map(toDiagnostic);
  return { ok: false, diagnostics: sortDiagnostics(diagnostics) };
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
