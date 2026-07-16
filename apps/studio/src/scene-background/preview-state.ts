import { resolveSceneBackground, type SceneBackgroundSettings } from "./model";

interface SceneBackgroundDraftPreview {
  readonly status: "draft";
  readonly projectDocumentKey: string;
  readonly color: string;
}

interface SceneBackgroundAwaitingReadyPreview {
  readonly status: "awaiting-ready";
  readonly projectDocumentKey: string;
  readonly settings: SceneBackgroundSettings;
  readonly revision: number;
}

export type SceneBackgroundPreviewState =
  SceneBackgroundDraftPreview | SceneBackgroundAwaitingReadyPreview;

export function createSceneBackgroundDraftPreview(
  projectDocumentKey: string,
  color: string,
): SceneBackgroundPreviewState {
  return { status: "draft", projectDocumentKey, color };
}

export function holdSceneBackgroundPreviewUntilReady(
  projectDocumentKey: string,
  settings: SceneBackgroundSettings,
  revision: number,
): SceneBackgroundPreviewState {
  return { status: "awaiting-ready", projectDocumentKey, settings, revision };
}

export function resolveSceneBackgroundPreview(
  state: SceneBackgroundPreviewState | null,
  projectDocumentKey: string | null,
  themeBackground: string,
): string | null {
  if (state === null || state.projectDocumentKey !== projectDocumentKey) return null;
  return state.status === "draft"
    ? state.color
    : resolveSceneBackground(state.settings, themeBackground);
}

export function releaseSceneBackgroundPreviewOnReady(
  state: SceneBackgroundPreviewState | null,
  projectDocumentKey: string,
  revision: number,
): SceneBackgroundPreviewState | null {
  if (
    state?.status === "awaiting-ready" &&
    state.projectDocumentKey === projectDocumentKey &&
    revision >= state.revision
  ) {
    return null;
  }
  return state;
}
