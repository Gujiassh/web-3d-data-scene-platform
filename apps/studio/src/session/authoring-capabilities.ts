export interface StudioHistoryCapabilities {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
}

export function studioHistoryCapabilities(
  canEdit: boolean,
  undoCount: number,
  redoCount: number,
): StudioHistoryCapabilities {
  return {
    canUndo: canEdit && undoCount > 0,
    canRedo: canEdit && redoCount > 0,
  };
}
