import { describe, expect, it } from "vitest";

import {
  createSceneBackgroundDraftPreview,
  holdSceneBackgroundPreviewUntilReady,
  releaseSceneBackgroundPreviewOnReady,
  resolveSceneBackgroundPreview,
} from "./preview-state";

describe("scene background preview state", () => {
  it("retains an applied preview after dialog close until the matching source revision is ready", () => {
    const key = "project-a\u0000scene-a";
    const draft = createSceneBackgroundDraftPreview(key, "#336699");
    const awaitingReady = holdSceneBackgroundPreviewUntilReady(
      key,
      { backgroundMode: "theme", background: "#AABBCC" },
      8,
    );

    expect(draft.status).toBe("draft");
    expect(awaitingReady.status).toBe("awaiting-ready");
    expect(resolveSceneBackgroundPreview(awaitingReady, key, "#F4F6F5")).toBe("#F4F6F5");
    expect(resolveSceneBackgroundPreview(awaitingReady, key, "#111715")).toBe("#111715");
    expect(releaseSceneBackgroundPreviewOnReady(awaitingReady, key, 7)).toBe(awaitingReady);
    expect(releaseSceneBackgroundPreviewOnReady(awaitingReady, "project-b\u0000scene-a", 8)).toBe(
      awaitingReady,
    );
    expect(releaseSceneBackgroundPreviewOnReady(awaitingReady, key, 8)).toBeNull();
    expect(releaseSceneBackgroundPreviewOnReady(awaitingReady, key, 9)).toBeNull();
  });

  it("does not expose a draft preview to another project and allows Cancel to clear immediately", () => {
    const draft = createSceneBackgroundDraftPreview("project-a\u0000scene-a", "#336699");

    expect(resolveSceneBackgroundPreview(draft, "project-b\u0000scene-a", "#F4F6F5")).toBeNull();
    expect(resolveSceneBackgroundPreview(null, "project-a\u0000scene-a", "#F4F6F5")).toBeNull();
  });
});
