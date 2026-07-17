import type { SceneLighting } from "@web3d/document";

import { themeBackgroundForSettings, type SceneSettingsDraft } from "./model";

interface SceneSettingsDraftPreview {
  readonly projectDocumentKey: string;
  readonly settings: SceneSettingsDraft;
}

interface SceneSettingsAwaitingReadyPreview extends SceneSettingsDraftPreview {
  readonly revision: number;
}

export interface SceneSettingsPreviewState {
  readonly draft: SceneSettingsDraftPreview | null;
  readonly awaitingReady: SceneSettingsAwaitingReadyPreview | null;
}

export interface ResolvedSceneSettingsPreview {
  readonly background: string;
  readonly grid: boolean;
  readonly lighting: SceneLighting;
}

export const EMPTY_SCENE_SETTINGS_PREVIEW: SceneSettingsPreviewState = Object.freeze({
  draft: null,
  awaitingReady: null,
});

export function createSceneSettingsDraftPreview(
  state: SceneSettingsPreviewState,
  projectDocumentKey: string,
  settings: SceneSettingsDraft,
): SceneSettingsPreviewState {
  return { ...state, draft: { projectDocumentKey, settings } };
}

export function holdSceneSettingsPreviewUntilReady(
  state: SceneSettingsPreviewState,
  projectDocumentKey: string,
  settings: SceneSettingsDraft,
  revision: number,
): SceneSettingsPreviewState {
  return {
    draft: null,
    awaitingReady: { projectDocumentKey, settings, revision },
  };
}

export function resolveSceneSettingsPreview(
  state: SceneSettingsPreviewState,
  projectDocumentKey: string | null,
  themeBackground: string,
): ResolvedSceneSettingsPreview | null {
  const preview = state.draft ?? state.awaitingReady;
  if (preview === null || preview.projectDocumentKey !== projectDocumentKey) return null;
  return {
    background: themeBackgroundForSettings(preview.settings, themeBackground),
    grid: preview.settings.grid,
    lighting: preview.settings.lighting,
  };
}

export function releaseSceneSettingsPreviewOnReady(
  state: SceneSettingsPreviewState,
  projectDocumentKey: string,
  revision: number,
): SceneSettingsPreviewState {
  const awaiting = state.awaitingReady;
  if (
    awaiting !== null &&
    awaiting.projectDocumentKey === projectDocumentKey &&
    revision >= awaiting.revision
  ) {
    return { ...state, awaitingReady: null };
  }
  return state;
}

export function closeSceneSettingsDraftPreview(
  state: SceneSettingsPreviewState,
): SceneSettingsPreviewState {
  return state.draft === null ? state : { ...state, draft: null };
}
