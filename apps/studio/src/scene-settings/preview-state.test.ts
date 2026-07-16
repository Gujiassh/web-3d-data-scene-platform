import { describe, expect, it } from "vitest";

import { lightingForPreset, type SceneSettingsDraft } from "./model";
import {
  createSceneSettingsDraftPreview,
  holdSceneSettingsPreviewUntilReady,
  releaseSceneSettingsPreviewOnReady,
  resolveSceneSettingsPreview,
} from "./preview-state";

describe("scene settings preview state", () => {
  const key = "project-a\u0000scene-a";
  const settings: SceneSettingsDraft = {
    backgroundMode: "custom",
    background: "#336699",
    grid: false,
    lighting: lightingForPreset("contrast"),
  };

  it("resolves one transient environment and releases it only for the matching ready revision", () => {
    const draft = createSceneSettingsDraftPreview(key, settings);
    const awaiting = holdSceneSettingsPreviewUntilReady(key, settings, 8);

    expect(resolveSceneSettingsPreview(draft, key, "#111715")).toEqual({
      background: "#336699",
      grid: false,
      lighting: settings.lighting,
    });
    expect(releaseSceneSettingsPreviewOnReady(awaiting, key, 7)).toBe(awaiting);
    expect(releaseSceneSettingsPreviewOnReady(awaiting, "project-b\u0000scene-a", 8)).toBe(
      awaiting,
    );
    expect(releaseSceneSettingsPreviewOnReady(awaiting, key, 8)).toBeNull();
  });

  it("does not leak previews across project-document identity", () => {
    const draft = createSceneSettingsDraftPreview(key, {
      ...settings,
      backgroundMode: "theme",
    });

    expect(resolveSceneSettingsPreview(draft, key, "#111715")?.background).toBe("#111715");
    expect(resolveSceneSettingsPreview(draft, "project-b\u0000scene-a", "#111715")).toBeNull();
    expect(resolveSceneSettingsPreview(null, key, "#111715")).toBeNull();
  });
});
