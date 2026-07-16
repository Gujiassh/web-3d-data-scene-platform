import { describe, expect, it } from "vitest";

import {
  createSetSceneBackgroundCommand,
  normalizeSceneBackgroundColor,
  resolveSceneBackground,
  sceneBackgroundStateKey,
  themeBackgroundFor,
} from "./model";

describe("scene background model", () => {
  it("resolves theme mode without overwriting the dormant custom color", () => {
    const settings = { backgroundMode: "theme" as const, background: "#336699" };

    expect(resolveSceneBackground(settings, "#111715")).toBe("#111715");
    expect(settings.background).toBe("#336699");
    expect(themeBackgroundFor("light")).toBe("#F4F6F5");
    expect(themeBackgroundFor("dark")).toBe("#111715");
  });

  it("uses and normalizes a valid custom color without accepting partial values", () => {
    expect(
      resolveSceneBackground({ backgroundMode: "custom", background: "#336699" }, "#111715"),
    ).toBe("#336699");
    expect(normalizeSceneBackgroundColor("#a0b1c2")).toBe("#A0B1C2");
    expect(normalizeSceneBackgroundColor("#abc")).toBeNull();
    expect(normalizeSceneBackgroundColor("red")).toBeNull();
  });

  it("builds one complete before/after document command", () => {
    expect(
      createSetSceneBackgroundCommand(
        { backgroundMode: "theme", background: "#AABBCC" },
        { backgroundMode: "custom", background: "#336699" },
      ),
    ).toEqual({
      type: "set-scene-background",
      before: { mode: "theme", color: "#AABBCC" },
      after: { mode: "custom", color: "#336699" },
    });
  });

  it("keys transient settings by project and document identity", () => {
    expect(sceneBackgroundStateKey("project-a", "shared-document")).not.toBe(
      sceneBackgroundStateKey("project-b", "shared-document"),
    );
  });
});
