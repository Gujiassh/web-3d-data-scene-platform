import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { DocumentCommand, SceneDocument, SceneEntity } from "@web3d/document";
import type { AuthoringSceneHandle } from "@web3d/react";
import type {
  AuthoringTool,
  AuthoringTransformSettings,
  AuthoringViewerEvent,
  EntitySpatialSnapshot,
} from "@web3d/runtime";

import { useStudioI18n } from "../i18n/I18nProvider";
import { createBrowserIdFactory } from "../session/command-builders";
import type { SelectionOperation } from "../session/session-state";
import type { StudioCommandOutcome } from "../workspace/command-outcome";
import { deriveLayoutCapabilities, type LayoutCapabilities } from "./layout-capabilities";
import {
  planAlign,
  planBoundsAnchorSnap,
  planCreateGroup,
  planDistribute,
  planDuplicateSubtrees,
  planReparent,
} from "./layout-planners";
import { normalizeSelectedRoots, type LayoutAnchor, type LayoutAxis } from "./layout-selection";
import {
  createSceneLayoutState,
  clearedSpatialFeedback,
  invalidDuplicateOffsetFields,
  mergeCurrentSnapshots,
  parseDuplicateOffset,
  updateTransformSettingsDraft,
  type SceneLayoutState,
} from "./scene-layout-state";
import type { TransformSettingsDraftField } from "./transform-settings";
import { selectionPivot, transformSpatialFeedback } from "./spatial-feedback";
import { reconcileSceneLayoutIdentity, sceneLayoutIdentity } from "./layout-identity";
import { isFinitePositiveScaleTransform } from "./spatial-math";
import {
  DISABLED_TRANSFORM_SETTINGS,
  LayoutPlanningError,
  type BoundsAnchorKind,
  type LayoutFailureCode,
  type PlannedLayoutCommand,
  type SpatialFeedback,
} from "./types";

type TransformPreviewEvent = Extract<AuthoringViewerEvent, { type: "transform-preview" }>;
type TransformCommitEvent = Extract<AuthoringViewerEvent, { type: "transform-commit" }>;
type SelectionChangeEvent = Extract<AuthoringViewerEvent, { type: "entity-selection-change" }>;

interface UseStudioSceneLayoutOptions {
  readonly projectId: string | null;
  readonly document: SceneDocument | null;
  readonly mode: "edit" | "run";
  readonly canEdit: boolean;
  readonly activeTool: AuthoringTool;
  readonly selectedEntityIds: readonly string[];
  readonly primaryEntityId: string | null;
  readonly viewerRef: RefObject<AuthoringSceneHandle | null>;
  readonly execute: (command: DocumentCommand) => StudioCommandOutcome;
  readonly selectEntity: (entityId: string | null, operation?: SelectionOperation) => void;
  readonly selectEntities: (entityIds: readonly string[], primaryEntityId: string | null) => void;
  readonly addDiagnostic: (message: string) => void;
}

export interface StudioSceneLayout {
  readonly editable: boolean;
  readonly documentEntities: readonly SceneEntity[];
  readonly selectedEntityIds: readonly string[];
  readonly primaryEntityId: string | null;
  readonly activeTool: AuthoringTool;
  readonly transformSettings: AuthoringTransformSettings;
  readonly axis: LayoutAxis;
  readonly alignAnchor: LayoutAnchor;
  readonly reparentTargetId: string | null;
  readonly duplicateOffsetDraft: readonly [string, string, string];
  readonly invalidDuplicateOffsetFields: readonly (0 | 1 | 2)[];
  readonly transformSettingsDraft: SceneLayoutState["transformSettingsDraft"];
  readonly invalidTransformFields: SceneLayoutState["invalidTransformFields"];
  readonly sourceAnchor: BoundsAnchorKind;
  readonly targetEntityId: string | null;
  readonly targetAnchor: BoundsAnchorKind;
  readonly capabilities: LayoutCapabilities;
  readonly feedback: SpatialFeedback;
  readonly error: LayoutFailureCode | null;
  readonly setAxis: (axis: LayoutAxis) => void;
  readonly setAlignAnchor: (anchor: LayoutAnchor) => void;
  readonly setReparentTargetId: (entityId: string | null) => void;
  readonly setDuplicateOffsetDraft: (axisIndex: 0 | 1 | 2, value: string) => void;
  readonly setTransformSettingsDraft: (field: TransformSettingsDraftField, value: string) => void;
  readonly setSourceAnchor: (anchor: BoundsAnchorKind) => void;
  readonly setTargetEntityId: (entityId: string | null) => void;
  readonly setTargetAnchor: (anchor: BoundsAnchorKind) => void;
  readonly groupSelection: () => void;
  readonly reparentSelection: () => void;
  readonly alignSelection: () => void;
  readonly distributeSelection: () => void;
  readonly duplicateSelection: () => void;
  readonly snapToAnchor: () => void;
  readonly selectFromTree: (entityId: string, operation: SelectionOperation) => void;
  readonly handleSelectionChange: (event: SelectionChangeEvent) => void;
  readonly handleReady: () => void;
  readonly handleTransformPreview: (event: TransformPreviewEvent) => void;
  readonly handleTransformCommit: (event: TransformCommitEvent) => void;
}

export function useStudioSceneLayout(options: UseStudioSceneLayoutOptions): StudioSceneLayout {
  const { t } = useStudioI18n();
  const identity = sceneLayoutIdentity(options);
  const [storedState, setStoredState] = useState(() =>
    createSceneLayoutState(
      identity.projectKey,
      identity.selectionKey,
      identity.mode,
      identity.documentRevision,
    ),
  );
  const lastStoredStateRef = useRef(storedState);
  const effectiveStateRef = useRef(storedState);
  const stateBase =
    lastStoredStateRef.current === storedState ? effectiveStateRef.current : storedState;
  const state = reconcileSceneLayoutIdentity(stateBase, identity);
  lastStoredStateRef.current = storedState;
  effectiveStateRef.current = state;
  const stateRef = useRef(state);
  stateRef.current = state;
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const duplicateOffsetKey = state.duplicateOffsetDraft.join("\u0000");
  const invalidDuplicateOffsetFieldIndices = invalidDuplicateOffsetFields(
    state.duplicateOffsetDraft,
  );
  const duplicateOffsetValid = invalidDuplicateOffsetFieldIndices.length === 0;

  const updateState = useCallback((update: (current: SceneLayoutState) => SceneLayoutState) => {
    setStoredState((current) => {
      const latestIdentity = sceneLayoutIdentity(optionsRef.current);
      return update(reconcileSceneLayoutIdentity(current, latestIdentity));
    });
  }, []);

  const clearSpatialFeedback = useCallback(() => {
    updateState((value) => ({
      ...value,
      feedback: clearedSpatialFeedback(value.transformSettings),
      error: null,
    }));
  }, [updateState]);

  const refreshSnapshots = useCallback(
    (additionalEntityIds: readonly string[] = []) => {
      const current = optionsRef.current;
      if (current.document === null) return;
      const document = current.document;
      const viewer = current.viewerRef.current;
      const rootIds = normalizeSelectedRoots(document.entities, current.selectedEntityIds);
      const entityIds = [...new Set([...rootIds, ...additionalEntityIds])].sort(compareStableIds);
      if (viewer === null || entityIds.length === 0) {
        if (entityIds.length === 0) {
          updateState((value) => ({
            ...value,
            snapshots: [],
            feedback: clearedSpatialFeedback(value.transformSettings),
          }));
        }
        return;
      }
      try {
        const snapshots = viewer.getEntitySpatialSnapshots(entityIds);
        updateState((value) => {
          const merged = mergeCurrentSnapshots(
            value.snapshots,
            snapshots,
            document.id,
            document.revision,
          );
          const selectedSnapshots = rootIds.flatMap((entityId) => {
            const snapshot = merged.find((candidate) => candidate.entityId === entityId);
            return snapshot === undefined ? [] : [snapshot];
          });
          return {
            ...value,
            snapshots: merged,
            feedback: {
              ...value.feedback,
              ...selectionPivot(selectedSnapshots, current.primaryEntityId),
            },
            error: null,
          };
        });
      } catch {
        updateState((value) => ({ ...value, snapshots: [], error: "snapshot-unavailable" }));
      }
    },
    [updateState],
  );

  useEffect(() => {
    if (options.mode !== "edit") return;
    const frame = requestAnimationFrame(() => {
      const extra = [state.reparentTargetId, state.targetEntityId].filter(
        (entityId): entityId is string => entityId !== null,
      );
      refreshSnapshots(extra);
    });
    return () => cancelAnimationFrame(frame);
  }, [
    options.document?.id,
    options.document?.revision,
    options.mode,
    refreshSnapshots,
    identity.selectionKey,
    state.reparentTargetId,
    state.targetEntityId,
  ]);

  const capabilities = useMemo(
    () =>
      options.document === null
        ? unavailableCapabilities()
        : deriveLayoutCapabilities({
            document: options.document,
            selectedEntityIds: options.selectedEntityIds,
            primaryEntityId: options.primaryEntityId,
            snapshots: state.snapshots,
            editable: options.canEdit && options.mode === "edit",
            reparentTargetId: state.reparentTargetId,
            anchorTargetId: state.targetEntityId,
            duplicateOffsetValid,
          }),
    [
      options.canEdit,
      options.document,
      options.mode,
      options.primaryEntityId,
      options.selectedEntityIds,
      duplicateOffsetKey,
      duplicateOffsetValid,
      state.reparentTargetId,
      state.snapshots,
      state.targetEntityId,
    ],
  );

  const fail = useCallback(
    (code: LayoutFailureCode) => {
      updateState((value) => ({ ...value, error: code }));
      optionsRef.current.addDiagnostic(t.layout.reasons[code]);
    },
    [t.layout.reasons, updateState],
  );

  const snapshotsForAction = useCallback(
    (additionalEntityIds: readonly string[] = []): readonly EntitySpatialSnapshot[] => {
      const current = optionsRef.current;
      if (current.document === null) throw new LayoutPlanningError("command-unavailable");
      const document = current.document;
      const viewer = current.viewerRef.current;
      if (viewer === null) throw new LayoutPlanningError("snapshot-unavailable");
      const rootIds = normalizeSelectedRoots(document.entities, current.selectedEntityIds);
      const entityIds = [...new Set([...rootIds, ...additionalEntityIds])].sort(compareStableIds);
      if (entityIds.length === 0) return [];
      try {
        const snapshots = viewer.getEntitySpatialSnapshots(entityIds);
        updateState((value) => ({
          ...value,
          snapshots: mergeCurrentSnapshots(
            value.snapshots,
            snapshots,
            document.id,
            document.revision,
          ),
        }));
        return snapshots;
      } catch {
        throw new LayoutPlanningError("snapshot-unavailable");
      }
    },
    [updateState],
  );

  const perform = useCallback(
    (plan: () => PlannedLayoutCommand) => {
      const current = optionsRef.current;
      if (!current.canEdit || current.mode !== "edit") {
        fail("run-disabled");
        return;
      }
      let planned: PlannedLayoutCommand;
      try {
        planned = plan();
      } catch (error) {
        fail(error instanceof LayoutPlanningError ? error.code : "invalid-transform");
        return;
      }
      const outcome = current.execute(planned.command);
      if (outcome.status === "changed") {
        updateState((value) => ({
          ...value,
          documentRevision: outcome.revision,
          feedback: { ...planned.feedback, settings: value.transformSettings },
          error: null,
        }));
        if (planned.nextSelection !== undefined) {
          current.selectEntities(
            planned.nextSelection.entityIds,
            planned.nextSelection.primaryEntityId,
          );
        }
        requestAnimationFrame(() => refreshSnapshots());
        return;
      }
      fail(
        outcome.status === "unchanged"
          ? "unchanged"
          : outcome.status === "unavailable"
            ? "command-unavailable"
            : "command-rejected",
      );
    },
    [fail, refreshSnapshots, updateState],
  );

  const plannerContext = useCallback(
    (additionalEntityIds: readonly string[] = []) => {
      const current = optionsRef.current;
      if (current.document === null) throw new LayoutPlanningError("command-unavailable");
      return {
        document: current.document,
        selectedEntityIds: current.selectedEntityIds,
        primaryEntityId: current.primaryEntityId,
        snapshots: snapshotsForAction(additionalEntityIds),
      };
    },
    [snapshotsForAction],
  );

  const groupSelection = useCallback(() => {
    perform(() =>
      planCreateGroup(plannerContext(), {
        id: createBrowserIdFactory().next("entity"),
        name: t.layout.defaultGroupName,
      }),
    );
  }, [perform, plannerContext, t.layout.defaultGroupName]);

  const reparentSelection = useCallback(() => {
    const destinationId = stateRef.current.reparentTargetId;
    perform(() =>
      planReparent(plannerContext(destinationId === null ? [] : [destinationId]), destinationId),
    );
  }, [perform, plannerContext]);

  const alignSelection = useCallback(() => {
    const current = stateRef.current;
    perform(() => planAlign(plannerContext(), current.axis, current.alignAnchor));
  }, [perform, plannerContext]);

  const distributeSelection = useCallback(() => {
    const axis = stateRef.current.axis;
    perform(() => planDistribute(plannerContext(), axis));
  }, [perform, plannerContext]);

  const duplicateSelection = useCallback(() => {
    const offset = parseDuplicateOffset(stateRef.current.duplicateOffsetDraft);
    if (offset === null) {
      fail("invalid-offset");
      return;
    }
    perform(() => planDuplicateSubtrees(plannerContext(), offset, createBrowserIdFactory()));
  }, [fail, perform, plannerContext]);

  const snapToAnchor = useCallback(() => {
    const current = stateRef.current;
    if (current.targetEntityId === null) {
      fail("target-required");
      return;
    }
    perform(() =>
      planBoundsAnchorSnap(
        plannerContext([current.targetEntityId!]),
        current.sourceAnchor,
        current.targetEntityId!,
        current.targetAnchor,
      ),
    );
  }, [fail, perform, plannerContext]);

  const selectFromTree = useCallback(
    (entityId: string, operation: SelectionOperation) => {
      clearSpatialFeedback();
      optionsRef.current.selectEntity(entityId, operation);
      requestAnimationFrame(() => refreshSnapshots());
    },
    [clearSpatialFeedback, refreshSnapshots],
  );

  const handleSelectionChange = useCallback(
    (event: SelectionChangeEvent) => {
      const entityId = viewportSelectionEntityId(event);
      if (entityId === undefined) return;
      clearSpatialFeedback();
      optionsRef.current.selectEntity(entityId, "replace");
      requestAnimationFrame(() => refreshSnapshots());
    },
    [clearSpatialFeedback, refreshSnapshots],
  );

  const handleTransformPreview = useCallback(
    (event: TransformPreviewEvent) => {
      const current = optionsRef.current;
      if (!current.canEdit || current.mode !== "edit") return;
      const entity = current.document?.entities.find(
        (candidate) => candidate.id === event.entityId,
      );
      if (entity === undefined) return;
      const snapshot = stateRef.current.snapshots.find(
        (candidate) => candidate.entityId === event.entityId,
      );
      if (snapshot === undefined) {
        updateState((value) => ({
          ...value,
          feedback: clearedSpatialFeedback(value.transformSettings),
        }));
        return;
      }
      const nextFeedback = transformSpatialFeedback(
        current.activeTool,
        entity.transform,
        event.transform,
        stateRef.current.feedback,
        stateRef.current.transformSettings,
        snapshot,
      );
      updateState((value) => ({
        ...value,
        feedback: nextFeedback,
        error: null,
      }));
    },
    [updateState],
  );

  const handleTransformCommit = useCallback(
    (event: TransformCommitEvent) => {
      const current = optionsRef.current;
      if (!current.canEdit || current.mode !== "edit") return;
      if (!isFinitePositiveScaleTransform(event.after)) {
        fail("invalid-transform");
        return;
      }
      const outcome = current.execute({
        type: "transform-entity",
        entityId: event.entityId,
        before: event.before,
        after: event.after,
      });
      if (outcome.status !== "changed") {
        fail(
          outcome.status === "unchanged"
            ? "unchanged"
            : outcome.status === "unavailable"
              ? "command-unavailable"
              : "command-rejected",
        );
        return;
      }
      const snapshot = stateRef.current.snapshots.find(
        (candidate) => candidate.entityId === event.entityId,
      );
      const nextFeedback =
        snapshot === undefined
          ? clearedSpatialFeedback(stateRef.current.transformSettings)
          : transformSpatialFeedback(
              current.activeTool,
              event.before,
              event.after,
              stateRef.current.feedback,
              stateRef.current.transformSettings,
              snapshot,
            );
      updateState((value) => ({
        ...value,
        documentRevision: outcome.revision,
        feedback: nextFeedback,
        error: null,
      }));
      requestAnimationFrame(() => refreshSnapshots());
    },
    [fail, refreshSnapshots, updateState],
  );

  return {
    editable: options.canEdit && options.mode === "edit",
    documentEntities: options.document?.entities ?? [],
    selectedEntityIds: options.selectedEntityIds,
    primaryEntityId: options.primaryEntityId,
    activeTool: options.activeTool,
    transformSettings:
      options.mode === "edit" && options.canEdit
        ? state.transformSettings
        : DISABLED_TRANSFORM_SETTINGS,
    axis: state.axis,
    alignAnchor: state.alignAnchor,
    reparentTargetId: state.reparentTargetId,
    duplicateOffsetDraft: state.duplicateOffsetDraft,
    invalidDuplicateOffsetFields: invalidDuplicateOffsetFields(state.duplicateOffsetDraft),
    transformSettingsDraft: state.transformSettingsDraft,
    invalidTransformFields: state.invalidTransformFields,
    sourceAnchor: state.sourceAnchor,
    targetEntityId: state.targetEntityId,
    targetAnchor: state.targetAnchor,
    capabilities,
    feedback: state.feedback,
    error: state.error,
    setAxis: (axis) => updateState((value) => ({ ...value, axis, error: null })),
    setAlignAnchor: (alignAnchor) =>
      updateState((value) => ({ ...value, alignAnchor, error: null })),
    setReparentTargetId: (reparentTargetId) =>
      updateState((value) => ({ ...value, reparentTargetId, error: null })),
    setDuplicateOffsetDraft: (axisIndex, draft) =>
      updateState((value) => {
        const duplicateOffsetDraft = [...value.duplicateOffsetDraft] as [string, string, string];
        duplicateOffsetDraft[axisIndex] = draft;
        return { ...value, duplicateOffsetDraft, error: null };
      }),
    setTransformSettingsDraft: (field, draft) =>
      updateState((value) => updateTransformSettingsDraft(value, field, draft)),
    setSourceAnchor: (sourceAnchor) =>
      updateState((value) => ({ ...value, sourceAnchor, error: null })),
    setTargetEntityId: (targetEntityId) =>
      updateState((value) => ({ ...value, targetEntityId, error: null })),
    setTargetAnchor: (targetAnchor) =>
      updateState((value) => ({ ...value, targetAnchor, error: null })),
    groupSelection,
    reparentSelection,
    alignSelection,
    distributeSelection,
    duplicateSelection,
    snapToAnchor,
    selectFromTree,
    handleSelectionChange,
    handleReady: refreshSnapshots,
    handleTransformPreview,
    handleTransformCommit,
  };
}

export function viewportSelectionEntityId(event: SelectionChangeEvent): string | null | undefined {
  return event.origin === "viewport" ? event.entityId : undefined;
}

function compareStableIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function unavailableCapabilities(): LayoutCapabilities {
  const unavailable = { enabled: false, reason: "command-unavailable" } as const;
  return {
    group: unavailable,
    reparent: unavailable,
    align: unavailable,
    distribute: unavailable,
    duplicate: unavailable,
    anchorSnap: unavailable,
  };
}
