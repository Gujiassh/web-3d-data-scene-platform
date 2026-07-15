import { isStudioAppError } from "../errors";
import type { StudioCatalog } from "./catalog";

type StudioErrorCopy = StudioCatalog["errors"];

export function formatStudioError(error: unknown, copy: StudioErrorCopy): string {
  if (!isStudioAppError(error)) {
    return error instanceof Error ? error.message : String(error);
  }

  switch (error.code) {
    case "LOCAL_SAVE_FAILED":
      return copy.localSaveFailed;
    case "IMPORT_COMMITTING":
      return copy.importCommitting;
    case "PROJECT_REPOSITORY_NOT_READY":
      return copy.projectRepositoryNotReady;
    case "AUTOSAVE_NOT_READY":
      return copy.autosaveNotReady;
    case "PROJECT_NAME_REQUIRED":
      return copy.projectNameRequired;
    case "NEW_PROJECT_INVALID":
      return copy.newProjectInvalid;
    case "PROJECT_TIMESTAMP_INVALID":
      return copy.projectTimestampInvalid;
    case "DOCUMENT_COMMANDS_DISABLED_IN_RUN_MODE":
      return copy.documentCommandsDisabledInRunMode;
    case "DOCUMENT_REVISION_NOT_MONOTONIC":
      return copy.documentRevisionNotMonotonic(error.details);
    case "ASSET_HASH_AMBIGUOUS":
      return copy.assetHashAmbiguous(error.details);
    case "ASSET_HASH_CONFLICT":
      return copy.assetHashConflict(error.details);
    case "ENTITY_NOT_FOUND":
      return copy.entityNotFound(error.details);
    case "SCENE_DOCUMENT_VALIDATION_FAILED":
      return copy.sceneDocumentValidationFailed(error.details);
    case "ASSET_URI_MISMATCH":
      return copy.assetUriMismatch(error.details);
    case "INDEXEDDB_UNAVAILABLE":
      return copy.indexedDbUnavailable;
    case "ASSET_NOT_REFERENCED":
      return copy.assetNotReferenced(error.details);
    case "ASSET_BYTES_MISSING":
      return copy.assetBytesMissing(error.details);
    case "PROJECT_NOT_FOUND":
      return copy.projectNotFound(error.details);
    case "ASSET_NOT_FOUND":
      return copy.assetNotFound(error.details);
    case "PROJECT_REPOSITORY_CLOSED":
      return copy.projectRepositoryClosed;
    case "ASSET_SHA256_MISMATCH":
      return copy.assetSha256Mismatch(error.details);
    case "INSUFFICIENT_STORAGE_CAPACITY":
      return copy.insufficientStorageCapacity(error.details);
    case "STORED_PROJECT_INVALID":
      return copy.storedProjectInvalid(error.details);
    case "UNSUPPORTED_ASSET_URI":
      return copy.unsupportedAssetUri(error.details);
    case "INDEXEDDB_OPEN_FAILED":
      return copy.indexedDbOpenFailed;
    case "INDEXEDDB_REQUEST_FAILED":
      return copy.indexedDbRequestFailed;
    case "INDEXEDDB_TRANSACTION_ABORTED":
      return copy.indexedDbTransactionAborted;
    case "INDEXEDDB_TRANSACTION_FAILED":
      return copy.indexedDbTransactionFailed;
  }
}
