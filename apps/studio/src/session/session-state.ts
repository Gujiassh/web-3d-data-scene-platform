import { studioAppErrors } from "../errors";

export type StudioMode = "edit" | "run";
export type AuthoringTool = "select" | "translate" | "rotate" | "scale";

export type SaveState =
  | { readonly status: "saved"; readonly revision: number }
  | { readonly status: "saving"; readonly revision: number }
  | { readonly status: "failed"; readonly revision: number; readonly message: string };

export interface StudioSessionState {
  readonly mode: StudioMode;
  readonly selectedEntityIds: readonly string[];
  readonly tool: AuthoringTool;
  readonly documentRevision: number;
  readonly save: SaveState;
  readonly lastExportedRevision: number | null;
}

export type StudioSessionAction =
  | { readonly type: "mode-changed"; readonly mode: StudioMode }
  | { readonly type: "entity-selected"; readonly entityId: string; readonly extend: boolean }
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
      return {
        ...state,
        selectedEntityIds: selectEntity(state.selectedEntityIds, action.entityId, action.extend),
      };
    case "selection-cleared":
      return { ...state, selectedEntityIds: [] };
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
  current: readonly string[],
  entityId: string,
  extend: boolean,
): readonly string[] {
  if (!extend) return [entityId];
  if (current.includes(entityId)) return current.filter((candidate) => candidate !== entityId);
  return [...current, entityId];
}

function requireMonotonicRevision(current: number, next: number): void {
  if (!Number.isInteger(next) || next <= current) {
    throw studioAppErrors.documentRevisionNotMonotonic(current, next);
  }
}
