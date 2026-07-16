import { describe, expect, it } from "vitest";

import {
  createSetSceneEnvironmentCommand,
  deriveLightingDirection,
  deriveLightingPreset,
  directionFor,
  LIGHTING_DIRECTIONS,
  lightingForPreset,
  sceneSettingsStateKey,
  sceneSettingsDraft,
  themeBackgroundFor,
  themeBackgroundForSettings,
} from "./model";

describe("scene settings model", () => {
  it("materializes concrete presets and derives only exact matches", () => {
    const standard = lightingForPreset("standard");
    expect(standard).toEqual({
      fill: { skyColor: "#FFFFFF", groundColor: "#65706A", intensity: 1.8 },
      key: {
        color: "#FFFFFF",
        intensity: 2.2,
        directionToLight: directionFor("standard"),
      },
    });
    expect(deriveLightingPreset(standard)).toBe("standard");
    expect(deriveLightingPreset({ ...standard, key: { ...standard.key, intensity: 2.21 } })).toBe(
      "custom",
    );
    expect(standard).not.toHaveProperty("preset");
  });

  it("defines Standard and eight normalized compass directions", () => {
    expect(LIGHTING_DIRECTIONS.map((direction) => direction.id)).toEqual([
      "standard",
      "n",
      "ne",
      "e",
      "se",
      "s",
      "sw",
      "w",
      "nw",
    ]);
    for (const direction of LIGHTING_DIRECTIONS) {
      expect(Math.hypot(...direction.vector)).toBeCloseTo(1, 12);
      expect(deriveLightingDirection(direction.vector)).toBe(direction.id);
    }
    expect(directionFor("n")).toEqual([0, Math.sin(Math.PI / 4), -Math.cos(Math.PI / 4)]);
  });

  it("maps only concrete settings into one complete environment command", () => {
    const before = {
      backgroundMode: "theme" as const,
      background: "#F4F6F5",
      grid: true,
      unit: "m" as const,
      upAxis: "Y" as const,
      lighting: lightingForPreset("standard"),
    };
    const draft = {
      ...sceneSettingsDraft(before),
      backgroundMode: "custom" as const,
      background: "#336699",
      grid: false,
      lighting: lightingForPreset("contrast"),
    };

    expect(createSetSceneEnvironmentCommand(before, draft)).toEqual({
      type: "set-scene-environment",
      before,
      after: { ...before, ...draft },
    });
    expect(draft).not.toHaveProperty("preset");
    expect(themeBackgroundForSettings(draft, "#111715")).toBe("#336699");
    expect(themeBackgroundForSettings({ ...draft, backgroundMode: "theme" }, "#111715")).toBe(
      "#111715",
    );
  });

  it("keeps theme resolution transient and keys previews by project and document", () => {
    expect(themeBackgroundFor("light")).toBe("#F4F6F5");
    expect(themeBackgroundFor("dark")).toBe("#111715");
    expect(sceneSettingsStateKey("project-a", "shared-document")).not.toBe(
      sceneSettingsStateKey("project-b", "shared-document"),
    );
  });
});
