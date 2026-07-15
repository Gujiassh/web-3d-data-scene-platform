import type { SceneDocument } from "@web3d/document";

import {
  currentSceneLayoutState,
  sceneLayoutProjectKey,
  type SceneLayoutState,
} from "./scene-layout-state";

export interface SceneLayoutIdentity {
  readonly projectKey: string;
  readonly selectionKey: string;
  readonly mode: "edit" | "run";
  readonly documentRevision: number;
}

export function sceneLayoutIdentity(input: {
  readonly projectId: string | null;
  readonly document: SceneDocument | null;
  readonly selectedEntityIds: readonly string[];
  readonly mode: "edit" | "run";
}): SceneLayoutIdentity {
  return {
    projectKey: sceneLayoutProjectKey(
      input.projectId ?? "__opening__",
      input.document?.id ?? "__opening__",
    ),
    selectionKey: input.selectedEntityIds.join("\u0000"),
    mode: input.mode,
    documentRevision: input.document?.revision ?? -1,
  };
}

export function reconcileSceneLayoutIdentity(
  state: SceneLayoutState,
  identity: SceneLayoutIdentity,
): SceneLayoutState {
  return currentSceneLayoutState(
    state,
    identity.projectKey,
    identity.selectionKey,
    identity.mode,
    identity.documentRevision,
  );
}
