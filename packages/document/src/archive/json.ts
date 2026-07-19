import { serializeSceneDocument } from "../serialize.js";
import { parseSceneDocument, validateSceneDocument } from "../validate.js";
import type { SceneDocument } from "../types.js";
import type { SceneSchemaVersion } from "./types.js";

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

export function readCanonicalSceneSchemaVersion(bytes: Uint8Array): SceneSchemaVersion {
  let value: unknown;
  try {
    value = JSON.parse(decoder.decode(bytes));
  } catch {
    throw new Error("SceneDocument parse failed: JSON_PARSE_ERROR");
  }
  const version =
    value !== null && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)["schemaVersion"]
      : undefined;
  if (
    version !== "1.0.0" &&
    version !== "1.1.0" &&
    version !== "1.2.0" &&
    version !== "1.3.0" &&
    version !== "1.4.0"
  ) {
    throw new Error("SceneDocument schemaVersion must be 1.0.0, 1.1.0, 1.2.0, 1.3.0 or 1.4.0.");
  }
  return version;
}
