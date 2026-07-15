import { studioAppErrors } from "../errors";

export type StudioMode = "edit" | "run";
export type AuthoringTool = "select" | "translate" | "rotate" | "scale";
export type SelectionOperation = "replace" | "toggle";

export type SaveState =
  | { readonly status: "saved"; readonly revision: number }
  | { readonly status: "saving"; readonly revision: number }
  | { readonly status: "failed"; readonly revision: number; readonly message: string };

export interface StudioSessionState {
  readonly mode: StudioMode;
  readonly selectedEntityIds: readonly string[];
  readonly primaryEntityId: string | null;
  readonly selectionAnchorId: string | null;
  readonly selectionRecency: readonly string[];
  readonly tool: AuthoringTool;
  readonly documentRevision: number;
  readonly save: SaveState;
  readonly lastExportedRevision: number | null;
}

export type StudioSessionAction =
  | { readonly type: "mode-changed"; readonly mode: StudioMode }
  | {
      readonly type: "entity-selected";
      readonly entityId: string;
      readonly operation: SelectionOperation;
    }
  | {
      readonly type: "selection-replaced";
      readonly entityIds: readonly string[];
      readonly primaryEntityId: string | null;
    }
  | { readonly type: "selection-reconciled"; readonly availableEntityIds: readonly string[] }
  | { readonly type: "selection-cleared" }
  | { readonly type: "tool-changed"; readonly tool: AuthoringTool }
  | { readonly type: "document-changed"; readonly revision: number }
  | { readonly type: "save-started"; readonly revision: number }
  | { readonly type: "save-succeeded"; readonly revision: number }
  | { readonly type: "save-failed"; readonly revision: number; readonly message: string }
  | { readonly type: "export-succeeded"; readonly revision: number };

export function createStudioSession(
  documentRevision: number,
  lastExportedRevision: number | null = null,
): StudioSessionState {
  return {
    mode: "edit",
    selectedEntityIds: [],
    primaryEntityId: null,
    selectionAnchorId: null,
    selectionRecency: [],
    tool: "select",
    documentRevision,
    save: { status: "saved", revision: documentRevision },
    lastExportedRevision,
  };
}

export function reduceStudioSession(
  state: StudioSessionState,
  action: StudioSessionAction,
): StudioSessionState {
  switch (action.type) {
    case "mode-changed":
      return {
        ...state,
        mode: action.mode,
        tool: action.mode === "run" ? "select" : state.tool,
      };
    case "entity-selected":
      return selectEntity(state, action.entityId, action.operation);
    case "selection-replaced":
      return replaceSelection(state, action.entityIds, action.primaryEntityId);
    case "selection-reconciled":
      return reconcileSelection(state, action.availableEntityIds);
    case "selection-cleared":
      return {
        ...state,
        selectedEntityIds: [],
        primaryEntityId: null,
        selectionAnchorId: null,
        selectionRecency: [],
      };
    case "tool-changed":
      return state.mode === "run" ? state : { ...state, tool: action.tool };
    case "document-changed":
      requireMonotonicRevision(state.documentRevision, action.revision);
      return { ...state, documentRevision: action.revision };
    case "save-started":
      return { ...state, save: { status: "saving", revision: action.revision } };
    case "save-succeeded":
      return { ...state, save: { status: "saved", revision: action.revision } };
    case "save-failed":
      return {
        ...state,
        save: { status: "failed", revision: action.revision, message: action.message },
      };
    case "export-succeeded":
      return { ...state, lastExportedRevision: action.revision };
  }
}

export function assertCanEdit(state: StudioSessionState): void {
  if (state.mode === "run") throw studioAppErrors.documentCommandsDisabledInRunMode();
}

export function isDirty(state: StudioSessionState): boolean {
  return state.documentRevision > state.save.revision || state.save.status === "failed";
}

export function isExportOutdated(state: StudioSessionState): boolean {
  return state.lastExportedRevision === null || state.documentRevision > state.lastExportedRevision;
}

function selectEntity(
  state: StudioSessionState,
  entityId: string,
  operation: SelectionOperation,
): StudioSessionState {
  if (operation === "replace") {
    return {
      ...state,
      selectedEntityIds: [entityId],
      primaryEntityId: entityId,
      selectionAnchorId: entityId,
      selectionRecency: [entityId],
    };
  }

  if (!state.selectedEntityIds.includes(entityId)) {
    return {
      ...state,
      selectedEntityIds: sortStableIds([...state.selectedEntityIds, entityId]),
      primaryEntityId: entityId,
      selectionAnchorId: state.selectionAnchorId ?? entityId,
      selectionRecency: [
        ...state.selectionRecency.filter((candidate) => candidate !== entityId),
        entityId,
      ],
    };
  }

  const selectedEntityIds = state.selectedEntityIds.filter((candidate) => candidate !== entityId);
  const selectionRecency = state.selectionRecency.filter((candidate) => candidate !== entityId);
  if (selectedEntityIds.length === 0) {
    return {
      ...state,
      selectedEntityIds,
      primaryEntityId: null,
      selectionAnchorId: null,
      selectionRecency: [],
    };
  }

  const primaryEntityId =
    state.primaryEntityId === entityId || state.primaryEntityId === null
      ? selectionRecency.at(-1)!
      : state.primaryEntityId;
  return {
    ...state,
    selectedEntityIds,
    primaryEntityId,
    selectionAnchorId:
      state.selectionAnchorId === entityId ? primaryEntityId : state.selectionAnchorId,
    selectionRecency,
  };
}

function replaceSelection(
  state: StudioSessionState,
  entityIds: readonly string[],
  requestedPrimaryEntityId: string | null,
): StudioSessionState {
  const selectedEntityIds = sortStableIds([...new Set(entityIds)]);
  if (selectedEntityIds.length === 0) {
    return {
      ...state,
      selectedEntityIds: [],
      primaryEntityId: null,
      selectionAnchorId: null,
      selectionRecency: [],
    };
  }
  const primaryEntityId =
    requestedPrimaryEntityId !== null && selectedEntityIds.includes(requestedPrimaryEntityId)
      ? requestedPrimaryEntityId
      : entityIds.findLast((entityId) => selectedEntityIds.includes(entityId))!;
  const selectionRecency = [
    ...new Set(entityIds.filter((entityId) => selectedEntityIds.includes(entityId))),
  ].filter((entityId) => entityId !== primaryEntityId);
  selectionRecency.push(primaryEntityId);
  return {
    ...state,
    selectedEntityIds,
    primaryEntityId,
    selectionAnchorId: primaryEntityId,
    selectionRecency,
  };
}

function reconcileSelection(
  state: StudioSessionState,
  availableEntityIds: readonly string[],
): StudioSessionState {
  const available = new Set(availableEntityIds);
  const selectedEntityIds = state.selectedEntityIds.filter((entityId) => available.has(entityId));
  const selectionRecency = state.selectionRecency.filter((entityId) => available.has(entityId));
  if (selectedEntityIds.length === 0) {
    return {
      ...state,
      selectedEntityIds: [],
      primaryEntityId: null,
      selectionAnchorId: null,
      selectionRecency: [],
    };
  }
  const primaryEntityId =
    state.primaryEntityId !== null && available.has(state.primaryEntityId)
      ? state.primaryEntityId
      : selectionRecency.at(-1)!;
  return {
    ...state,
    selectedEntityIds,
    primaryEntityId,
    selectionAnchorId:
      state.selectionAnchorId !== null && available.has(state.selectionAnchorId)
        ? state.selectionAnchorId
        : primaryEntityId,
    selectionRecency,
  };
}

function sortStableIds(ids: readonly string[]): readonly string[] {
  return [...ids].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
}

function requireMonotonicRevision(current: number, next: number): void {
  if (!Number.isInteger(next) || next <= current) {
    throw studioAppErrors.documentRevisionNotMonotonic(current, next);
  }
}
