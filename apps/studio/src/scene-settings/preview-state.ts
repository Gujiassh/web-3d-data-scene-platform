import type { SceneLighting } from "@web3d/document";

import { themeBackgroundForSettings, type SceneSettingsDraft } from "./model";

interface SceneSettingsDraftPreview {
  readonly status: "draft";
  readonly projectDocumentKey: string;
  readonly settings: SceneSettingsDraft;
}

interface SceneSettingsAwaitingReadyPreview {
  readonly status: "awaiting-ready";
  readonly projectDocumentKey: string;
  readonly settings: SceneSettingsDraft;
  readonly revision: number;
}

export type SceneSettingsPreviewState =
  SceneSettingsDraftPreview | SceneSettingsAwaitingReadyPreview;

export interface ResolvedSceneSettingsPreview {
  readonly background: string;
  readonly grid: boolean;
  readonly lighting: SceneLighting;
}

export function createSceneSettingsDraftPreview(
  projectDocumentKey: string,
  settings: SceneSettingsDraft,
): SceneSettingsPreviewState {
  return { status: "draft", projectDocumentKey, settings };
}

export function holdSceneSettingsPreviewUntilReady(
  projectDocumentKey: string,
  settings: SceneSettingsDraft,
  revision: number,
): SceneSettingsPreviewState {
  return { status: "awaiting-ready", projectDocumentKey, settings, revision };
}

export function resolveSceneSettingsPreview(
  state: SceneSettingsPreviewState | null,
  projectDocumentKey: string | null,
  themeBackground: string,
): ResolvedSceneSettingsPreview | null {
  if (state === null || state.projectDocumentKey !== projectDocumentKey) return null;
  return {
    background: themeBackgroundForSettings(state.settings, themeBackground),
    grid: state.settings.grid,
    lighting: state.settings.lighting,
  };
}

export function releaseSceneSettingsPreviewOnReady(
  state: SceneSettingsPreviewState | null,
  projectDocumentKey: string,
  revision: number,
): SceneSettingsPreviewState | null {
  if (
    state?.status === "awaiting-ready" &&
    state.projectDocumentKey === projectDocumentKey &&
    revision >= state.revision
  ) {
    return null;
  }
  return state;
}
