import {
  parseSceneDocument,
  serializeSceneDocument,
  validateSceneDocument,
  type SceneDocument,
} from "@web3d/document";

const ASSET_URI_PREFIX = "asset://";

export function canonicalizeSceneDocument(document: SceneDocument): SceneDocument {
  const validation = validateSceneDocument(document);
  if (!validation.ok) {
    throw sceneDocumentValidationError(validation.diagnostics);
  }

  const canonical = parseSceneDocument(serializeSceneDocument(validation.value));
  if (!canonical.ok) {
    throw sceneDocumentValidationError(canonical.diagnostics);
  }
  return canonical.value;
}

export function validateProjectDocument(document: SceneDocument): SceneDocument {
  const canonical = canonicalizeSceneDocument(document);
  for (const asset of canonical.assets) {
    if (asset.uri !== `${ASSET_URI_PREFIX}${asset.sha256}`) {
      throw new Error(`Asset ${asset.id} must use asset://${asset.sha256}.`);
    }
  }
  return canonical;
}

export function serializeProjectDocument(document: SceneDocument): string {
  return serializeSceneDocument(validateProjectDocument(document));
}

function sceneDocumentValidationError(
  diagnostics: readonly {
    readonly code: string;
    readonly path: string;
    readonly message: string;
  }[],
): Error {
  const first = diagnostics[0];
  if (!first) {
    return new Error("SceneDocument validation failed.");
  }
  return new Error(
    `SceneDocument validation failed: ${first.code} at ${first.path || "/"}: ${first.message}`,
  );
}
