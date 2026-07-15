import type { AuthoringTransformSettings, EntitySpatialSnapshot } from "@web3d/runtime";

import {
  validateTransformSettingsDraft,
  type TransformSettingsDraft,
  type TransformSettingsDraftField,
} from "./transform-settings";
import {
  DISABLED_TRANSFORM_SETTINGS,
  type BoundsAnchorKind,
  type LayoutFailureCode,
  type SpatialFeedback,
} from "./types";
import type { LayoutAnchor, LayoutAxis } from "./layout-selection";

export interface SceneLayoutState {
  readonly projectKey: string;
  readonly selectionKey: string;
  readonly mode: "edit" | "run";
  readonly documentRevision: number;
  readonly axis: LayoutAxis;
  readonly alignAnchor: LayoutAnchor;
  readonly reparentTargetId: string | null;
  readonly duplicateOffsetDraft: readonly [string, string, string];
  readonly transformSettingsDraft: TransformSettingsDraft;
  readonly transformSettings: AuthoringTransformSettings;
  readonly invalidTransformFields: readonly TransformSettingsDraftField[];
  readonly sourceAnchor: BoundsAnchorKind;
  readonly targetEntityId: string | null;
  readonly targetAnchor: BoundsAnchorKind;
  readonly snapshots: readonly EntitySpatialSnapshot[];
  readonly feedback: SpatialFeedback;
  readonly error: LayoutFailureCode | null;
}

export function sceneLayoutProjectKey(projectId: string, documentId: string): string {
  return JSON.stringify([projectId, documentId]);
}

export function createSceneLayoutState(
  projectKey: string,
  selectionKey = "",
  mode: "edit" | "run" = "edit",
  documentRevision = 0,
): SceneLayoutState {
  return {
    projectKey,
    selectionKey,
    mode,
    documentRevision,
    axis: "x",
    alignAnchor: "center",
    reparentTargetId: null,
    duplicateOffsetDraft: ["1", "0", "0"],
    transformSettingsDraft: {
      translationSnap: "",
      rotationSnapDegrees: "",
      scaleSnap: "",
    },
    transformSettings: DISABLED_TRANSFORM_SETTINGS,
    invalidTransformFields: [],
    sourceAnchor: "center",
    targetEntityId: null,
    targetAnchor: "center",
    snapshots: [],
    feedback: {
      activity: "idle",
      pivotKind: "entity-origin",
      pivotWorld: null,
      activeAxis: "free",
      deltaPosition: null,
      deltaRotationRadians: null,
      deltaScale: null,
      settings: DISABLED_TRANSFORM_SETTINGS,
      sourceAnchor: null,
      targetAnchor: null,
    },
    error: null,
  };
}

export function currentSceneLayoutState(
  state: SceneLayoutState,
  projectKey: string,
  selectionKey = state.selectionKey,
  mode: "edit" | "run" = state.mode,
  documentRevision = state.documentRevision,
): SceneLayoutState {
  if (state.projectKey !== projectKey) {
    return createSceneLayoutState(projectKey, selectionKey, mode, documentRevision);
  }
  if (
    state.selectionKey === selectionKey &&
    state.mode === mode &&
    state.documentRevision === documentRevision
  ) {
    return state;
  }
  return {
    ...state,
    selectionKey,
    mode,
    documentRevision,
    snapshots: [],
    feedback: clearedSpatialFeedback(
      mode === "edit" ? state.transformSettings : DISABLED_TRANSFORM_SETTINGS,
    ),
    error: null,
  };
}

export function updateTransformSettingsDraft(
  state: SceneLayoutState,
  field: TransformSettingsDraftField,
  value: string,
): SceneLayoutState {
  const transformSettingsDraft = { ...state.transformSettingsDraft, [field]: value };
  const validation = validateTransformSettingsDraft(transformSettingsDraft);
  return validation.valid
    ? {
        ...state,
        transformSettingsDraft,
        transformSettings: validation.settings,
        invalidTransformFields: [],
        feedback: { ...state.feedback, settings: validation.settings },
        error: null,
      }
    : {
        ...state,
        transformSettingsDraft,
        invalidTransformFields: validation.invalidFields,
      };
}

export function clearedSpatialFeedback(settings: AuthoringTransformSettings): SpatialFeedback {
  return {
    activity: "idle",
    pivotKind: "entity-origin",
    pivotWorld: null,
    activeAxis: "free",
    deltaPosition: null,
    deltaRotationRadians: null,
    deltaScale: null,
    settings,
    sourceAnchor: null,
    targetAnchor: null,
  };
}

export function parseDuplicateOffset(
  draft: SceneLayoutState["duplicateOffsetDraft"],
): readonly [number, number, number] | null {
  const values = draft.map((value) => Number(value.trim()));
  if (
    draft.some((value) => value.trim() === "") ||
    !values.every((value) => Number.isFinite(value))
  ) {
    return null;
  }
  return values as [number, number, number];
}

export function invalidDuplicateOffsetFields(
  draft: SceneLayoutState["duplicateOffsetDraft"],
): readonly (0 | 1 | 2)[] {
  return draft.flatMap((value, index) => {
    const normalized = value.trim();
    const parsed = Number(normalized);
    return normalized === "" || !Number.isFinite(parsed) ? [index as 0 | 1 | 2] : [];
  });
}

export function mergeCurrentSnapshots(
  current: readonly EntitySpatialSnapshot[],
  incoming: readonly EntitySpatialSnapshot[],
  documentId: string,
  revision: number,
): readonly EntitySpatialSnapshot[] {
  const merged = new Map(
    current
      .filter(
        (snapshot) => snapshot.documentId === documentId && snapshot.documentRevision === revision,
      )
      .map((snapshot) => [snapshot.entityId, snapshot]),
  );
  for (const snapshot of incoming) merged.set(snapshot.entityId, snapshot);
  return [...merged.values()].sort((left, right) =>
    compareStableIds(left.entityId, right.entityId),
  );
}

function compareStableIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
