import { sortDiagnostics, type DocumentValidationResult } from "./diagnostics.js";
import {
  migrateSceneDocument1_0,
  migrateSceneDocument1_1,
  migrateSceneDocument1_2,
  migrateSceneDocument1_3,
} from "./migration.js";
import { validateSceneDocumentSemantics, type SceneDocumentSemanticsInput } from "./semantics.js";
import {
  validateSceneDocument1_0Structure,
  validateSceneDocument1_1Structure,
  validateSceneDocument1_2Structure,
  validateSceneDocument1_3Structure,
  validateSceneDocumentStructure,
  type SceneDocument1_0ValidationResult,
  type SceneDocument1_1ValidationResult,
  type SceneDocument1_2ValidationResult,
  type SceneDocument1_3ValidationResult,
} from "./structure.js";

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

export function validateSceneDocument1_0(value: unknown): SceneDocument1_0ValidationResult {
  const structural = validateSceneDocument1_0Structure(value);
  if (!structural.ok) {
    return structural;
  }

  const diagnostics = validateSceneDocumentSemantics(
    structural.value as SceneDocumentSemanticsInput,
  );
  return diagnostics.length === 0
    ? structural
    : { ok: false, diagnostics: sortDiagnostics(diagnostics) };
}

export function validateSceneDocument1_1(value: unknown): SceneDocument1_1ValidationResult {
  const structural = validateSceneDocument1_1Structure(value);
  if (!structural.ok) {
    return structural;
  }

  const diagnostics = validateSceneDocumentSemantics(
    structural.value as SceneDocumentSemanticsInput,
  );
  return diagnostics.length === 0
    ? structural
    : { ok: false, diagnostics: sortDiagnostics(diagnostics) };
}

export function validateSceneDocument1_2(value: unknown): SceneDocument1_2ValidationResult {
  const structural = validateSceneDocument1_2Structure(value);
  if (!structural.ok) {
    return structural;
  }

  const diagnostics = validateSceneDocumentSemantics(
    structural.value as SceneDocumentSemanticsInput,
  );
  return diagnostics.length === 0
    ? structural
    : { ok: false, diagnostics: sortDiagnostics(diagnostics) };
}

export function validateSceneDocument1_3(value: unknown): SceneDocument1_3ValidationResult {
  const structural = validateSceneDocument1_3Structure(value);
  if (!structural.ok) {
    return structural;
  }

  const diagnostics = validateSceneDocumentSemantics(
    structural.value as SceneDocumentSemanticsInput,
  );
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

  if (sceneSchemaVersion(value) === "1.0.0") {
    const legacy = validateSceneDocument1_0(value);
    if (!legacy.ok) return legacy;
    const intermediate1_1 = validateSceneDocument1_1(migrateSceneDocument1_0(legacy.value));
    if (!intermediate1_1.ok) return intermediate1_1;
    const intermediate1_2 = validateSceneDocument1_2(
      migrateSceneDocument1_1(intermediate1_1.value),
    );
    if (!intermediate1_2.ok) return intermediate1_2;
    const intermediate1_3 = validateSceneDocument1_3(
      migrateSceneDocument1_2(intermediate1_2.value),
    );
    if (!intermediate1_3.ok) return intermediate1_3;
    return validateSceneDocument(migrateSceneDocument1_3(intermediate1_3.value));
  }
  if (sceneSchemaVersion(value) === "1.1.0") {
    const legacy = validateSceneDocument1_1(value);
    if (!legacy.ok) return legacy;
    const intermediate1_2 = validateSceneDocument1_2(migrateSceneDocument1_1(legacy.value));
    if (!intermediate1_2.ok) return intermediate1_2;
    const intermediate1_3 = validateSceneDocument1_3(
      migrateSceneDocument1_2(intermediate1_2.value),
    );
    if (!intermediate1_3.ok) return intermediate1_3;
    return validateSceneDocument(migrateSceneDocument1_3(intermediate1_3.value));
  }
  if (sceneSchemaVersion(value) === "1.2.0") {
    const legacy = validateSceneDocument1_2(value);
    if (!legacy.ok) return legacy;
    const intermediate1_3 = validateSceneDocument1_3(migrateSceneDocument1_2(legacy.value));
    if (!intermediate1_3.ok) return intermediate1_3;
    return validateSceneDocument(migrateSceneDocument1_3(intermediate1_3.value));
  }
  if (sceneSchemaVersion(value) === "1.3.0") {
    const legacy = validateSceneDocument1_3(value);
    if (!legacy.ok) return legacy;
    return validateSceneDocument(migrateSceneDocument1_3(legacy.value));
  }
  return validateSceneDocument(value);
}

function sceneSchemaVersion(value: unknown): unknown {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)["schemaVersion"]
    : undefined;
}
