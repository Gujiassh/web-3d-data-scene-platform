import { sortDiagnostics, type DocumentValidationResult } from "./diagnostics.js";
import { validateSceneDocumentSemantics } from "./semantics.js";
import { validateSceneDocumentStructure } from "./structure.js";

export function validateSceneDocument(value: unknown): DocumentValidationResult {
  const structural = validateSceneDocumentStructure(value);
  if (!structural.ok) {
    return structural;
  }

  const diagnostics = validateSceneDocumentSemantics(structural.value);
  return diagnostics.length === 0
    ? structural
    : { ok: false, diagnostics: sortDiagnostics(diagnostics) };
}

export function parseSceneDocument(json: string): DocumentValidationResult {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return {
      ok: false,
      diagnostics: [{ code: "JSON_PARSE_ERROR", path: "", message: "Input is not valid JSON." }],
    };
  }

  return validateSceneDocument(value);
}
