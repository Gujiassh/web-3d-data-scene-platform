type EmptyDetails = Readonly<Record<never, never>>;

export interface StudioErrorDiagnosticDetails {
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

export interface StudioAppErrorDetailsByCode {
  readonly LOCAL_SAVE_FAILED: EmptyDetails;
  readonly IMPORT_COMMITTING: EmptyDetails;
  readonly PROJECT_REPOSITORY_NOT_READY: EmptyDetails;
  readonly AUTOSAVE_NOT_READY: EmptyDetails;
  readonly PROJECT_NAME_REQUIRED: EmptyDetails;
  readonly NEW_PROJECT_INVALID: EmptyDetails;
  readonly PROJECT_TIMESTAMP_INVALID: EmptyDetails;
  readonly DOCUMENT_COMMANDS_DISABLED_IN_RUN_MODE: EmptyDetails;
  readonly DOCUMENT_REVISION_NOT_MONOTONIC: {
    readonly current: number;
    readonly next: number;
  };
  readonly ASSET_HASH_AMBIGUOUS: {
    readonly sha256: string;
    readonly count: number;
  };
  readonly ASSET_HASH_CONFLICT: {
    readonly sha256: string;
  };
  readonly ENTITY_NOT_FOUND: {
    readonly entityId: string;
  };
  readonly SCENE_DOCUMENT_VALIDATION_FAILED: {
    readonly diagnostic?: StudioErrorDiagnosticDetails;
  };
  readonly ASSET_URI_MISMATCH: {
    readonly assetId: string;
    readonly sha256: string;
  };
  readonly INDEXEDDB_UNAVAILABLE: EmptyDetails;
  readonly ASSET_NOT_REFERENCED: {
    readonly sha256: string;
  };
  readonly ASSET_BYTES_MISSING: {
    readonly sha256: string;
  };
  readonly PROJECT_NOT_FOUND: {
    readonly projectId: string;
  };
  readonly ASSET_NOT_FOUND: {
    readonly sha256: string;
  };
  readonly PROJECT_REPOSITORY_CLOSED: EmptyDetails;
  readonly ASSET_SHA256_MISMATCH: {
    readonly expectedSha256: string;
    readonly receivedSha256: string;
  };
  readonly INSUFFICIENT_STORAGE_CAPACITY: {
    readonly remainingBytes: number;
    readonly requiredBytes: number;
  };
  readonly STORED_PROJECT_INVALID: {
    readonly projectId: string;
  };
  readonly UNSUPPORTED_ASSET_URI: {
    readonly uri: string;
  };
  readonly INDEXEDDB_OPEN_FAILED: EmptyDetails;
  readonly INDEXEDDB_REQUEST_FAILED: EmptyDetails;
  readonly INDEXEDDB_TRANSACTION_ABORTED: EmptyDetails;
  readonly INDEXEDDB_TRANSACTION_FAILED: EmptyDetails;
  readonly STARTER_BOOTSTRAP_FAILED: {
    readonly stage: string;
    readonly diagnostic: string;
  };
}

export type StudioAppErrorCode = keyof StudioAppErrorDetailsByCode;

export class StudioAppError<TCode extends StudioAppErrorCode> extends Error {
  override readonly name = "StudioAppError";

  constructor(
    readonly code: TCode,
    message: string,
    readonly details: StudioAppErrorDetailsByCode[TCode],
  ) {
    super(message);
  }
}

export type AnyStudioAppError = {
  [TCode in StudioAppErrorCode]: StudioAppError<TCode>;
}[StudioAppErrorCode];

export function isStudioAppError(error: unknown): error is AnyStudioAppError {
  return error instanceof StudioAppError;
}

function createStudioAppError<TCode extends StudioAppErrorCode>(
  code: TCode,
  message: string,
  details: StudioAppErrorDetailsByCode[TCode],
): StudioAppError<TCode> {
  return new StudioAppError(code, message, details);
}

export const studioAppErrors = {
  localSaveFailed: () => createStudioAppError("LOCAL_SAVE_FAILED", "Local save failed.", {}),
  importCommitting: () =>
    createStudioAppError("IMPORT_COMMITTING", "Import is being committed.", {}),
  projectRepositoryNotReady: () =>
    createStudioAppError("PROJECT_REPOSITORY_NOT_READY", "Project repository is not ready.", {}),
  autosaveNotReady: () => createStudioAppError("AUTOSAVE_NOT_READY", "Autosave is not ready.", {}),
  projectNameRequired: () =>
    createStudioAppError("PROJECT_NAME_REQUIRED", "Project name is required.", {}),
  newProjectInvalid: () =>
    createStudioAppError("NEW_PROJECT_INVALID", "New project is invalid.", {}),
  projectTimestampInvalid: () =>
    createStudioAppError("PROJECT_TIMESTAMP_INVALID", "Project timestamp is invalid.", {}),
  documentCommandsDisabledInRunMode: () =>
    createStudioAppError(
      "DOCUMENT_COMMANDS_DISABLED_IN_RUN_MODE",
      "Document commands are disabled in Run mode.",
      {},
    ),
  documentRevisionNotMonotonic: (current: number, next: number) =>
    createStudioAppError(
      "DOCUMENT_REVISION_NOT_MONOTONIC",
      `Document revision must increase from ${current}; received ${next}.`,
      { current, next },
    ),
  assetHashAmbiguous: (sha256: string, count: number) =>
    createStudioAppError(
      "ASSET_HASH_AMBIGUOUS",
      `Asset hash ${sha256} maps to multiple SceneAsset records.`,
      { sha256, count },
    ),
  assetHashConflict: (sha256: string) =>
    createStudioAppError(
      "ASSET_HASH_CONFLICT",
      `Asset hash ${sha256} conflicts with the existing SceneAsset.`,
      { sha256 },
    ),
  entityNotFound: (entityId: string) =>
    createStudioAppError("ENTITY_NOT_FOUND", `Entity ${entityId} does not exist.`, { entityId }),
  sceneDocumentValidationFailed: (diagnostic?: StudioErrorDiagnosticDetails) => {
    const details: StudioAppErrorDetailsByCode["SCENE_DOCUMENT_VALIDATION_FAILED"] =
      diagnostic === undefined ? {} : { diagnostic };
    const message =
      diagnostic === undefined
        ? "SceneDocument validation failed."
        : `SceneDocument validation failed: ${diagnostic.code} at ${diagnostic.path || "/"}: ${diagnostic.message}`;
    return createStudioAppError("SCENE_DOCUMENT_VALIDATION_FAILED", message, details);
  },
  assetUriMismatch: (assetId: string, sha256: string) =>
    createStudioAppError("ASSET_URI_MISMATCH", `Asset ${assetId} must use asset://${sha256}.`, {
      assetId,
      sha256,
    }),
  indexedDbUnavailable: () =>
    createStudioAppError(
      "INDEXEDDB_UNAVAILABLE",
      "IndexedDB is not available in this environment.",
      {},
    ),
  assetNotReferenced: (sha256: string) =>
    createStudioAppError(
      "ASSET_NOT_REFERENCED",
      `Asset ${sha256} is not referenced by the SceneDocument.`,
      { sha256 },
    ),
  assetBytesMissing: (sha256: string) =>
    createStudioAppError(
      "ASSET_BYTES_MISSING",
      `Asset bytes for ${sha256} are missing from the repository.`,
      { sha256 },
    ),
  projectNotFound: (projectId: string) =>
    createStudioAppError("PROJECT_NOT_FOUND", `Project ${projectId} does not exist.`, {
      projectId,
    }),
  assetNotFound: (sha256: string) =>
    createStudioAppError("ASSET_NOT_FOUND", `Asset ${sha256} does not exist.`, { sha256 }),
  projectRepositoryClosed: () =>
    createStudioAppError("PROJECT_REPOSITORY_CLOSED", "Project repository is closed.", {}),
  assetSha256Mismatch: (expectedSha256: string, receivedSha256: string) =>
    createStudioAppError(
      "ASSET_SHA256_MISMATCH",
      `Asset SHA-256 mismatch for ${expectedSha256}; received ${receivedSha256}.`,
      { expectedSha256, receivedSha256 },
    ),
  insufficientStorageCapacity: (remainingBytes: number, requiredBytes: number) =>
    createStudioAppError(
      "INSUFFICIENT_STORAGE_CAPACITY",
      `Insufficient storage capacity: ${remainingBytes} bytes remain, ${requiredBytes} bytes required.`,
      { remainingBytes, requiredBytes },
    ),
  storedProjectInvalid: (projectId: string) =>
    createStudioAppError(
      "STORED_PROJECT_INVALID",
      `Project ${projectId} contains an invalid SceneDocument.`,
      { projectId },
    ),
  unsupportedAssetUri: (uri: string) =>
    createStudioAppError("UNSUPPORTED_ASSET_URI", `Unsupported asset URI ${uri}.`, { uri }),
  indexedDbOpenFailed: () =>
    createStudioAppError("INDEXEDDB_OPEN_FAILED", "Failed to open IndexedDB.", {}),
  indexedDbRequestFailed: () =>
    createStudioAppError("INDEXEDDB_REQUEST_FAILED", "IndexedDB request failed.", {}),
  indexedDbTransactionAborted: () =>
    createStudioAppError("INDEXEDDB_TRANSACTION_ABORTED", "IndexedDB transaction aborted.", {}),
  indexedDbTransactionFailed: () =>
    createStudioAppError("INDEXEDDB_TRANSACTION_FAILED", "IndexedDB transaction failed.", {}),
  starterBootstrapFailed: (stage: string, diagnostic: string) =>
    createStudioAppError("STARTER_BOOTSTRAP_FAILED", "Starter bootstrap failed.", {
      stage,
      diagnostic,
    }),
} as const;
