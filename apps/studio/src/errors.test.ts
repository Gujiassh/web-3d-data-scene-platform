import { describe, expect, it } from "vitest";

import { StudioAppError, studioAppErrors } from "./errors";

describe("StudioAppError", () => {
  it("preserves existing English messages alongside stable codes and details", () => {
    const hash = "a".repeat(64);
    const conflict = studioAppErrors.assetHashConflict(hash);
    const revision = studioAppErrors.documentRevisionNotMonotonic(9, 9);
    const storage = studioAppErrors.insufficientStorageCapacity(128, 4096);

    expect(conflict).toBeInstanceOf(StudioAppError);
    expect(conflict).toMatchObject({
      code: "ASSET_HASH_CONFLICT",
      details: { sha256: hash },
      message: `Asset hash ${hash} conflicts with the existing SceneAsset.`,
    });
    expect(revision).toMatchObject({
      code: "DOCUMENT_REVISION_NOT_MONOTONIC",
      details: { current: 9, next: 9 },
      message: "Document revision must increase from 9; received 9.",
    });
    expect(storage).toMatchObject({
      code: "INSUFFICIENT_STORAGE_CAPACITY",
      details: { remainingBytes: 128, requiredBytes: 4096 },
      message: "Insufficient storage capacity: 128 bytes remain, 4096 bytes required.",
    });
  });
});
