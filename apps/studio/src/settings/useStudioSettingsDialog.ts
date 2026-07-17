import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { SceneEnvironment, SetSceneEnvironmentCommand } from "@web3d/document";

import {
  createSetSceneEnvironmentCommand,
  sceneSettingsDraft,
  sceneSettingsEqual,
  sceneSettingsStateKey,
  type SceneSettingsDraft,
} from "../scene-settings/model";
import {
  closeSceneSettingsDraftPreview,
  createSceneSettingsDraftPreview,
  EMPTY_SCENE_SETTINGS_PREVIEW,
  holdSceneSettingsPreviewUntilReady,
  releaseSceneSettingsPreviewOnReady,
  resolveSceneSettingsPreview,
} from "../scene-settings/preview-state";
import type { StudioCommandOutcome } from "../workspace/command-outcome";

interface OpenSettingsState {
  readonly projectDocumentKey: string | null;
  readonly draft: SceneSettingsDraft | null;
  readonly previewing: boolean;
}

interface UseStudioSettingsDialogOptions {
  readonly projectId: string | null;
  readonly documentId: string | null;
  readonly environment: SceneEnvironment | null;
  readonly canEdit: boolean;
  readonly themeBackground: string;
  readonly execute: (command: SetSceneEnvironmentCommand) => StudioCommandOutcome;
  readonly restoreFocus: () => void;
}

export interface StudioSettingsDialogState {
  readonly open: boolean;
  readonly draft: SceneSettingsDraft | null;
  readonly sceneEditable: boolean;
  readonly previewCancellation: number;
  readonly preview: ReturnType<typeof resolveSceneSettingsPreview>;
  readonly openDialog: () => void;
  readonly closeDialog: () => void;
  readonly cancelScenePreview: () => void;
  readonly clearScenePreview: () => void;
  readonly previewSceneSettings: (draft: SceneSettingsDraft) => void;
  readonly commitSceneSettings: (draft: SceneSettingsDraft) => boolean;
  readonly handleReady: (documentId: string, revision: number) => void;
}

export function useStudioSettingsDialog(
  options: UseStudioSettingsDialogOptions,
): StudioSettingsDialogState {
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const projectDocumentKey =
    options.projectId === null || options.documentId === null
      ? null
      : sceneSettingsStateKey(options.projectId, options.documentId);
  const [dialog, setDialog] = useState<OpenSettingsState | null>(null);
  const [previewState, setPreviewState] = useState(EMPTY_SCENE_SETTINGS_PREVIEW);
  const [previewCancellation, setPreviewCancellation] = useState(0);
  const open = dialog !== null;
  const matchesOpenScene =
    dialog !== null &&
    dialog.projectDocumentKey !== null &&
    dialog.projectDocumentKey === projectDocumentKey;
  const draft = matchesOpenScene ? dialog.draft : null;
  const sceneEditable =
    options.canEdit &&
    options.environment !== null &&
    projectDocumentKey !== null &&
    draft !== null;

  const openDialog = useCallback((): void => {
    const current = optionsRef.current;
    if (current.projectId === null || current.documentId === null || current.environment === null) {
      setDialog({ projectDocumentKey: null, draft: null, previewing: false });
      setPreviewState(closeSceneSettingsDraftPreview);
      return;
    }
    const key = sceneSettingsStateKey(current.projectId, current.documentId);
    const draft = sceneSettingsDraft(current.environment);
    setDialog({ projectDocumentKey: key, draft, previewing: false });
    setPreviewState(closeSceneSettingsDraftPreview);
  }, []);

  const closeDialog = useCallback((): void => {
    setDialog(null);
    setPreviewState(closeSceneSettingsDraftPreview);
    optionsRef.current.restoreFocus();
  }, []);

  const clearScenePreview = useCallback((): void => {
    const current = optionsRef.current;
    setPreviewCancellation((current) => current + 1);
    setPreviewState(EMPTY_SCENE_SETTINGS_PREVIEW);
    setDialog((dialogState) => {
      if (dialogState === null) return dialogState;
      const draft = current.environment === null ? null : sceneSettingsDraft(current.environment);
      return { ...dialogState, draft, previewing: false };
    });
  }, []);

  const cancelScenePreview = useCallback((): void => {
    const current = optionsRef.current;
    setPreviewCancellation((value) => value + 1);
    setPreviewState(closeSceneSettingsDraftPreview);
    setDialog((dialogState) => {
      if (dialogState === null || !dialogState.previewing) return dialogState;
      const draft = current.environment === null ? null : sceneSettingsDraft(current.environment);
      return { ...dialogState, draft, previewing: false };
    });
  }, []);

  const previewSceneSettings = useCallback(
    (next: SceneSettingsDraft): void => {
      if (!matchesOpenScene || dialog === null || projectDocumentKey === null) return;
      setDialog({ ...dialog, draft: next, previewing: true });
      setPreviewState((current) =>
        createSceneSettingsDraftPreview(current, projectDocumentKey, next),
      );
    },
    [dialog, matchesOpenScene, projectDocumentKey],
  );

  const commitSceneSettings = useCallback(
    (next: SceneSettingsDraft): boolean => {
      const current = optionsRef.current;
      if (
        !open ||
        dialog === null ||
        dialog.projectDocumentKey !== projectDocumentKey ||
        projectDocumentKey === null ||
        current.environment === null ||
        !current.canEdit
      ) {
        return false;
      }
      const authoritative = sceneSettingsDraft(current.environment);
      const outcome = current.execute(createSetSceneEnvironmentCommand(current.environment, next));
      if (outcome.status === "rejected" || outcome.status === "unavailable") {
        setPreviewCancellation((value) => value + 1);
        setDialog({ ...dialog, draft: authoritative, previewing: false });
        setPreviewState(closeSceneSettingsDraftPreview);
        return false;
      }
      setDialog({ ...dialog, draft: next, previewing: false });
      setPreviewState((state) =>
        outcome.status === "changed"
          ? holdSceneSettingsPreviewUntilReady(state, projectDocumentKey, next, outcome.revision)
          : closeSceneSettingsDraftPreview(state),
      );
      return true;
    },
    [dialog, open, projectDocumentKey],
  );

  useEffect(() => {
    if (options.environment === null || projectDocumentKey === null) return;
    const authoritative = sceneSettingsDraft(options.environment);
    setDialog((current) => {
      if (
        current === null ||
        current.projectDocumentKey !== projectDocumentKey ||
        current.previewing ||
        (current.draft !== null && sceneSettingsEqual(current.draft, authoritative))
      ) {
        return current;
      }
      return { ...current, draft: authoritative };
    });
  }, [options.environment, projectDocumentKey]);

  const handleReady = useCallback((documentId: string, revision: number): void => {
    const projectId = optionsRef.current.projectId;
    if (projectId === null) return;
    setPreviewState((current) =>
      releaseSceneSettingsPreviewOnReady(
        current,
        sceneSettingsStateKey(projectId, documentId),
        revision,
      ),
    );
  }, []);

  const preview = useMemo(
    () => resolveSceneSettingsPreview(previewState, projectDocumentKey, options.themeBackground),
    [options.themeBackground, previewState, projectDocumentKey],
  );
  return {
    open,
    draft,
    sceneEditable,
    previewCancellation,
    preview,
    openDialog,
    closeDialog,
    cancelScenePreview,
    clearScenePreview,
    previewSceneSettings,
    commitSceneSettings,
    handleReady,
  };
}
