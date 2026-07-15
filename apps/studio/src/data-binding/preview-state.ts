import type { StudioPreviewAction, StudioPreviewState } from "./types";

export const DEFAULT_PREVIEW_CONNECTION = "connecting" as const;

const MAX_DIAGNOSTICS = 12;

export function createStudioPreviewState(active = false): StudioPreviewState {
  return { active, connections: {}, values: {}, alarms: [], diagnostics: [] };
}

export function reduceStudioPreview(
  state: StudioPreviewState,
  action: StudioPreviewAction,
): StudioPreviewState {
  switch (action.type) {
    case "started":
      return createStudioPreviewState(true);
    case "stopped":
      return createStudioPreviewState(false);
    case "connection-changed":
      if (!state.active) return state;
      return {
        ...state,
        connections: { ...state.connections, [action.sourceId]: action.status },
      };
    case "binding-state-changed":
      if (!state.active) return state;
      return {
        ...state,
        values: { ...state.values, [action.state.bindingId]: action.state },
      };
    case "binding-state-cleared": {
      if (!state.active || !(action.bindingId in state.values)) return state;
      const values = { ...state.values };
      delete values[action.bindingId];
      return { ...state, values };
    }
    case "alarm-changed":
      if (!state.active) return state;
      return {
        ...state,
        alarms: updateAlarms(state.alarms, action.transition, action.alarm),
      };
    case "diagnostic-added":
      if (!state.active) return state;
      return {
        ...state,
        diagnostics: [...state.diagnostics, action.diagnostic].slice(-MAX_DIAGNOSTICS),
      };
  }
}

function updateAlarms(
  alarms: StudioPreviewState["alarms"],
  transition: "opened" | "updated" | "cleared",
  alarm: StudioPreviewState["alarms"][number],
): StudioPreviewState["alarms"] {
  const next = new Map(alarms.map((candidate) => [candidate.key, candidate]));
  if (transition === "cleared") next.delete(alarm.key);
  else next.set(alarm.key, alarm);
  return [...next.values()].sort((left, right) => left.key.localeCompare(right.key, "en"));
}
