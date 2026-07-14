import { serializeSceneDocument } from "../serialize.js";
import { parseSceneDocument, validateSceneDocument } from "../validate.js";
import type { SceneDocument } from "../types.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

export function exportCanonicalSceneJson(document: SceneDocument): Uint8Array {
  const validation = validateSceneDocument(document);
  if (!validation.ok) {
    throw new Error(
      `SceneDocument validation failed: ${validation.diagnostics[0]?.code ?? "UNKNOWN"}`,
    );
  }
  return encoder.encode(serializeSceneDocument(validation.value));
}

export function importCanonicalSceneJson(bytes: Uint8Array): SceneDocument {
  const parsed = parseSceneDocument(decoder.decode(bytes));
  if (!parsed.ok) {
    throw new Error(`SceneDocument parse failed: ${parsed.diagnostics[0]?.code ?? "UNKNOWN"}`);
  }
  return parsed.value;
}
