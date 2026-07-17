import { describe, expect, it } from "vitest";

import { lightingForPreset, type SceneSettingsDraft } from "./model";
import {
  closeSceneSettingsDraftPreview,
  createSceneSettingsDraftPreview,
  EMPTY_SCENE_SETTINGS_PREVIEW,
  holdSceneSettingsPreviewUntilReady,
  releaseSceneSettingsPreviewOnReady,
  resolveSceneSettingsPreview,
} from "./preview-state";

describe("scene settings preview state", () => {
  const key = "project-a\u0000scene-a";
  const applied: SceneSettingsDraft = {
    backgroundMode: "custom",
    background: "#336699",
    grid: false,
    lighting: lightingForPreset("contrast"),
  };
  const nextDraft: SceneSettingsDraft = {
    ...applied,
    background: "#123456",
    lighting: lightingForPreset("soft"),
  };

  it("resolves a draft over a held preview and reveals the held value after cancel", () => {
    const held = holdSceneSettingsPreviewUntilReady(EMPTY_SCENE_SETTINGS_PREVIEW, key, applied, 8);
    const layered = createSceneSettingsDraftPreview(held, key, nextDraft);

    expect(resolveSceneSettingsPreview(layered, key, "#111715")?.background).toBe("#123456");
    const cancelled = closeSceneSettingsDraftPreview(layered);
    expect(resolveSceneSettingsPreview(cancelled, key, "#111715")?.background).toBe("#336699");
    expect(cancelled.awaitingReady).toBe(held.awaitingReady);
  });

  it("releases only a matching held revision without disturbing a newer draft", () => {
    const held = holdSceneSettingsPreviewUntilReady(EMPTY_SCENE_SETTINGS_PREVIEW, key, applied, 8);
    const layered = createSceneSettingsDraftPreview(held, key, nextDraft);

    expect(releaseSceneSettingsPreviewOnReady(layered, key, 7)).toBe(layered);
    expect(releaseSceneSettingsPreviewOnReady(layered, "project-b\u0000scene-a", 8)).toBe(layered);
    const released = releaseSceneSettingsPreviewOnReady(layered, key, 8);
    expect(released.awaitingReady).toBeNull();
    expect(released.draft).toBe(layered.draft);
    expect(resolveSceneSettingsPreview(released, key, "#111715")?.background).toBe("#123456");
  });

  it("does not resolve either layer across project-document identity", () => {
    const held = holdSceneSettingsPreviewUntilReady(EMPTY_SCENE_SETTINGS_PREVIEW, key, applied, 8);
    const layered = createSceneSettingsDraftPreview(held, key, nextDraft);

    expect(resolveSceneSettingsPreview(layered, "project-b\u0000scene-a", "#111715")).toBeNull();
    expect(resolveSceneSettingsPreview(EMPTY_SCENE_SETTINGS_PREVIEW, key, "#111715")).toBeNull();
  });
});
