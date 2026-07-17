import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";

import type {
  DocumentCommand,
  LightEntity,
  RemoveLightEntityCommand,
  SceneDocument,
  Transform,
  UpdateLightEntityCommand,
} from "@web3d/document";
import type { AuthoringSceneHandle } from "@web3d/react";
import type {
  AuthoringTool,
  AuthoringViewerEvent,
  AuthoredLightPropertyPreview,
} from "@web3d/runtime";

import { createBrowserIdFactory } from "../session/command-builders";
import type { SelectionOperation } from "../session/session-state";
import type { StudioCommandOutcome } from "../workspace/command-outcome";
import {
  buildAddLightCommand,
  buildDuplicateLightCommand,
  buildUpdateLightCommand,
  countAuthoredLights,
  isLightEntity,
  lightSupportsTool,
  MAX_AUTHORED_LIGHTS,
  type StudioLightKind,
} from "./model";

type TransformPreviewEvent = Extract<AuthoringViewerEvent, { type: "transform-preview" }>;
type TransformCommitEvent = Extract<AuthoringViewerEvent, { type: "transform-commit" }>;

interface LightPreviewLayer extends AuthoredLightPropertyPreview {
  readonly targetRevision?: number;
}

export type LightAddDisabledReason = "run" | "limit" | "not-ready";
export type LightDuplicateDisabledReason = "limit" | "mixed-selection";

interface UseStudioLightAuthoringOptions {
  readonly document: SceneDocument | null;
  readonly mode: "edit" | "run";
  readonly canEdit: boolean;
  readonly selectedEntityIds: readonly string[];
  readonly primaryEntityId: string | null;
  readonly viewerRef: RefObject<AuthoringSceneHandle | null>;
  readonly execute: (command: DocumentCommand) => StudioCommandOutcome;
  readonly selectEntity: (entityId: string | null, operation?: SelectionOperation) => void;
}

export interface StudioLightAuthoring {
  readonly lightCount: number;
  readonly addDisabledReason: LightAddDisabledReason | null;
  readonly settingsDisabled: boolean;
  readonly selectionContainsLight: boolean;
  readonly duplicateEnabled: boolean;
  readonly duplicateDisabledReason: LightDuplicateDisabledReason | null;
  readonly previewCancellation: number;
  readonly add: (kind: StudioLightKind) => boolean;
  readonly canUseTool: (tool: AuthoringTool) => boolean;
  readonly deleteSelection: () => boolean;
  readonly duplicateSelection: () => boolean;
  readonly handleTransformCommit: (event: TransformCommitEvent) => boolean;
  readonly handleTransformPreview: (event: TransformPreviewEvent) => boolean;
  readonly handleReady: (documentId: string, revision: number) => void;
  readonly refreshCreationAvailability: () => void;
  readonly acceptPreview: (entity: LightEntity, revision: number) => void;
  readonly cancelPreview: () => void;
  readonly clearPreview: () => void;
  readonly preview: (entity: LightEntity) => void;
  readonly updateLock: (entityId: string, locked: boolean) => boolean;
  readonly updateVisibility: (entityId: string, visible: boolean) => boolean;
}

export function useStudioLightAuthoring(
  options: UseStudioLightAuthoringOptions,
): StudioLightAuthoring {
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const availabilityKey = stateKey(options.document, options.mode);
  const [availability, setAvailability] = useState({ key: "", ready: false });
  const [previewCancellation, setPreviewCancellation] = useState(0);
  const activePreviewRef = useRef<LightPreviewLayer | null>(null);
  const heldPreviewRef = useRef<LightPreviewLayer | null>(null);
  const frameReady = availability.key === availabilityKey && availability.ready;
  const lightCount = countAuthoredLights(options.document);
  const selectedLights = useMemo(
    () => selectedLightEntities(options.document, options.selectedEntityIds),
    [options.document, options.selectedEntityIds],
  );
  const primaryLight = lightFor(options.document, options.primaryEntityId);
  const selectionContainsLight = selectedLights.length > 0;
  const duplicateDisabledReason: LightDuplicateDisabledReason | null =
    selectedLights.length !== 1 || options.selectedEntityIds.length !== 1
      ? "mixed-selection"
      : lightCount >= MAX_AUTHORED_LIGHTS
        ? "limit"
        : null;
  const addDisabledReason: LightAddDisabledReason | null =
    !options.canEdit || options.mode !== "edit"
      ? "run"
      : lightCount >= MAX_AUTHORED_LIGHTS
        ? "limit"
        : !frameReady
          ? "not-ready"
          : null;

  const refreshCreationAvailability = useCallback(() => {
    const current = optionsRef.current;
    const key = stateKey(current.document, current.mode);
    const ready =
      current.canEdit &&
      current.mode === "edit" &&
      current.viewerRef.current?.getLightCreationFrame() !== null;
    setAvailability({ key, ready });
  }, []);

  const renderPreview = useCallback((preview: LightPreviewLayer | null): boolean => {
    const viewer = optionsRef.current.viewerRef.current;
    if (viewer === null) return false;
    if (preview === null) return viewer.setAuthoredLightPropertyPreview(null);
    const snapshot = viewer.getSnapshot();
    if (snapshot.documentId !== preview.documentId || snapshot.revision === null) {
      return false;
    }
    return viewer.setAuthoredLightPropertyPreview({
      documentId: preview.documentId,
      documentRevision: snapshot.revision,
      entityId: preview.entityId,
      light: preview.light,
    });
  }, []);

  const clearPreview = useCallback((): void => {
    activePreviewRef.current = null;
    heldPreviewRef.current = null;
    renderPreview(null);
    setPreviewCancellation((current) => current + 1);
  }, [renderPreview]);

  const cancelPreview = useCallback((): void => {
    activePreviewRef.current = null;
    renderPreview(heldPreviewRef.current);
    setPreviewCancellation((current) => current + 1);
  }, [renderPreview]);

  const preview = useCallback(
    (entity: LightEntity): void => {
      const current = optionsRef.current;
      if (current.document === null) return;
      const layer: LightPreviewLayer = {
        documentId: current.document.id,
        documentRevision: current.document.revision,
        entityId: entity.id,
        light: entity.light,
      };
      activePreviewRef.current = layer;
      renderPreview(layer);
    },
    [renderPreview],
  );

  const acceptPreview = useCallback(
    (entity: LightEntity, revision: number): void => {
      const current = optionsRef.current;
      if (current.document === null) return;
      const active = activePreviewRef.current;
      const held: LightPreviewLayer = {
        documentId: current.document.id,
        documentRevision:
          active?.entityId === entity.id ? active.documentRevision : current.document.revision,
        entityId: entity.id,
        light: entity.light,
        targetRevision: revision,
      };
      activePreviewRef.current = null;
      heldPreviewRef.current = held;
      renderPreview(held);
    },
    [renderPreview],
  );

  const handleReady = useCallback(
    (documentId: string, revision: number): void => {
      const held = heldPreviewRef.current;
      if (
        held !== null &&
        held.documentId === documentId &&
        held.targetRevision !== undefined &&
        revision >= held.targetRevision
      ) {
        heldPreviewRef.current = null;
      }
      renderPreview(activePreviewRef.current ?? heldPreviewRef.current);
    },
    [renderPreview],
  );

  useEffect(
    () => clearPreview(),
    [clearPreview, options.document?.id, options.mode, options.primaryEntityId],
  );

  const add = useCallback((kind: StudioLightKind): boolean => {
    const current = optionsRef.current;
    if (!current.canEdit || current.mode !== "edit" || current.document === null) return false;
    if (countAuthoredLights(current.document) >= MAX_AUTHORED_LIGHTS) return false;
    const frame = current.viewerRef.current?.getLightCreationFrame() ?? null;
    if (frame === null) return false;
    const command = buildAddLightCommand(
      current.document,
      kind,
      frame,
      createBrowserIdFactory().next("entity"),
    );
    const outcome = current.execute(command);
    if (outcome.status !== "changed") return false;
    current.selectEntity(command.after.id, "replace");
    focusLightInspector(command.after.id);
    return true;
  }, []);

  const duplicateSelection = useCallback((): boolean => {
    const current = optionsRef.current;
    if (!current.canEdit || current.mode !== "edit" || current.document === null) return false;
    const selected = selectedLightEntities(current.document, current.selectedEntityIds);
    if (
      selected.length !== 1 ||
      current.selectedEntityIds.length !== 1 ||
      countAuthoredLights(current.document) >= MAX_AUTHORED_LIGHTS
    ) {
      return false;
    }
    const command = buildDuplicateLightCommand(
      current.document,
      selected[0]!,
      createBrowserIdFactory().next("entity"),
    );
    const outcome = current.execute(command);
    if (outcome.status !== "changed") return false;
    current.selectEntity(command.after.id, "replace");
    focusLightInspector(command.after.id);
    return true;
  }, []);

  const deleteSelection = useCallback((): boolean => {
    const current = optionsRef.current;
    const light = lightFor(current.document, current.primaryEntityId);
    if (light === null) return false;
    if (!current.canEdit || current.mode !== "edit") return true;
    const command: RemoveLightEntityCommand = { type: "remove-light-entity", before: light };
    const outcome = current.execute(command);
    if (outcome.status === "changed") current.selectEntity(null);
    return true;
  }, []);

  const updateVisibility = useCallback((entityId: string, visible: boolean): boolean => {
    return updateLight(optionsRef.current, entityId, (before) => ({ ...before, visible }));
  }, []);

  const updateLock = useCallback((entityId: string, locked: boolean): boolean => {
    return updateLight(optionsRef.current, entityId, (before) => ({ ...before, locked }));
  }, []);

  const handleTransformPreview = useCallback((event: TransformPreviewEvent): boolean => {
    return lightFor(optionsRef.current.document, event.entityId) !== null;
  }, []);

  const handleTransformCommit = useCallback((event: TransformCommitEvent): boolean => {
    const current = optionsRef.current;
    const before = lightFor(current.document, event.entityId);
    if (before === null) return false;
    if (!current.canEdit || current.mode !== "edit" || before.locked) return true;
    if (!lightTransformAllowed(before, event.before, event.after)) return true;
    current.execute(buildUpdateLightCommand(before, { ...before, transform: event.after }));
    return true;
  }, []);

  return {
    lightCount,
    addDisabledReason,
    settingsDisabled: !options.canEdit || options.mode !== "edit",
    selectionContainsLight,
    duplicateEnabled: selectionContainsLight && duplicateDisabledReason === null,
    duplicateDisabledReason: selectionContainsLight ? duplicateDisabledReason : null,
    previewCancellation,
    add,
    canUseTool(tool) {
      return primaryLight === null ? true : lightSupportsTool(primaryLight, tool);
    },
    deleteSelection,
    duplicateSelection,
    handleTransformCommit,
    handleTransformPreview,
    handleReady,
    refreshCreationAvailability,
    acceptPreview,
    cancelPreview,
    clearPreview,
    preview,
    updateLock,
    updateVisibility,
  };
}

function updateLight(
  options: UseStudioLightAuthoringOptions,
  entityId: string,
  update: (before: LightEntity) => LightEntity,
): boolean {
  const before = lightFor(options.document, entityId);
  if (before === null) return false;
  if (!options.canEdit || options.mode !== "edit") return true;
  const command: UpdateLightEntityCommand = {
    type: "update-light-entity",
    before,
    after: update(before),
  };
  options.execute(command);
  return true;
}

function lightFor(document: SceneDocument | null, entityId: string | null): LightEntity | null {
  if (document === null || entityId === null) return null;
  const entity = document.entities.find((candidate) => candidate.id === entityId);
  return entity !== undefined && isLightEntity(entity) ? entity : null;
}

function selectedLightEntities(
  document: SceneDocument | null,
  selectedEntityIds: readonly string[],
): readonly LightEntity[] {
  if (document === null) return [];
  const selected = new Set(selectedEntityIds);
  return document.entities.filter(
    (entity): entity is LightEntity => selected.has(entity.id) && isLightEntity(entity),
  );
}

function lightTransformAllowed(
  entity: LightEntity,
  eventBefore: Transform,
  eventAfter: Transform,
): boolean {
  if (!sameTransform(entity.transform, eventBefore)) return false;
  if (!sameVector(eventBefore.scale, eventAfter.scale)) return false;
  if (entity.light.kind === "point" && !sameVector(eventBefore.rotation, eventAfter.rotation)) {
    return false;
  }
  return true;
}

function sameTransform(left: Transform, right: Transform): boolean {
  return (
    sameVector(left.position, right.position) &&
    sameVector(left.rotation, right.rotation) &&
    sameVector(left.scale, right.scale)
  );
}

function sameVector(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function stateKey(document: SceneDocument | null, mode: "edit" | "run"): string {
  return document === null ? `${mode}:none` : `${mode}:${document.id}:${document.revision}`;
}

function focusLightInspector(entityId: string): void {
  requestAnimationFrame(() => {
    const field = [
      ...document.querySelectorAll<HTMLInputElement>("[data-light-inspector-primary]"),
    ].find((candidate) => candidate.dataset["lightInspectorPrimary"] === entityId);
    field?.focus();
  });
}
