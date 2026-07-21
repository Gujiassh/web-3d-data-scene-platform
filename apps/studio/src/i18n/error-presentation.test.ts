import { describe, expect, it } from "vitest";

import { studioAppErrors } from "../errors";
import { chinese } from "./catalog";
import { formatStudioError } from "./error-presentation";

describe("formatStudioError", () => {
  it("renders known app errors in Chinese without changing technical values", () => {
    const entityId = "entity-machine-07";
    const hash = "a1".repeat(32);

    expect(formatStudioError(studioAppErrors.entityNotFound(entityId), chinese.errors)).toBe(
      `实体 ${entityId} 不存在。`,
    );
    expect(formatStudioError(studioAppErrors.assetHashConflict(hash), chinese.errors)).toBe(
      `资源哈希 ${hash} 与现有 SceneAsset 冲突。`,
    );
    expect(
      formatStudioError(studioAppErrors.insufficientStorageCapacity(1024, 8192), chinese.errors),
    ).toBe("存储空间不足：剩余 1024 字节，需要 8192 字节。");
    expect(
      formatStudioError(
        studioAppErrors.starterBootstrapFailed("archive-hash", "internal detail"),
        chinese.errors,
      ),
    ).toBe("默认项目无法打开（archive-hash）。请检查 starter descriptor 后重试。");
  });

  it("passes unknown browser and runtime error messages through unchanged", () => {
    const nativeMessage = "QuotaExceededError: browser-specific detail";

    expect(formatStudioError(new Error(nativeMessage), chinese.errors)).toBe(nativeMessage);
  });
});
