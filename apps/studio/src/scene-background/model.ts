import type { Theme } from "@web3d/demo-support/theme";
import type { SetSceneBackgroundCommand } from "@web3d/document";

export interface SceneBackgroundSettings {
  readonly backgroundMode: "theme" | "custom";
  readonly background: string;
}

const THEME_BACKGROUNDS: Readonly<Record<Theme, string>> = {
  light: "#F4F6F5",
  dark: "#111715",
};

const sceneBackgroundPattern = /^#[A-Fa-f0-9]{6}$/u;

export function themeBackgroundFor(theme: Theme): string {
  return THEME_BACKGROUNDS[theme];
}

export function sceneBackgroundStateKey(projectId: string, documentId: string): string {
  return `${projectId}\u0000${documentId}`;
}

export function normalizeSceneBackgroundColor(value: string): string | null {
  const normalized = value.trim();
  return sceneBackgroundPattern.test(normalized) ? normalized.toUpperCase() : null;
}

export function resolveSceneBackground(
  settings: SceneBackgroundSettings,
  themeBackground: string,
): string {
  return settings.backgroundMode === "theme" ? themeBackground : settings.background;
}

export function createSetSceneBackgroundCommand(
  before: SceneBackgroundSettings,
  after: SceneBackgroundSettings,
): SetSceneBackgroundCommand {
  return {
    type: "set-scene-background",
    before: { mode: before.backgroundMode, color: before.background },
    after: { mode: after.backgroundMode, color: after.background },
  };
}
