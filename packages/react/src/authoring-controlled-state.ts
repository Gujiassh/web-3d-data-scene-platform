import type { AuthoringSceneViewer, AuthoringTransformSettings } from "@web3d/runtime";

type AuthoringControlledState = Pick<
  AuthoringSceneViewer,
  "selectEntities" | "setTransformSettings"
>;

export function reconcileAuthoringSceneSelection(
  viewer: AuthoringControlledState,
  selectedEntityIds: readonly string[] | undefined,
  primaryEntityId: string | null | undefined,
): void {
  if (selectedEntityIds === undefined && primaryEntityId === undefined) return;
  const entityIds =
    selectedEntityIds ??
    (primaryEntityId === null || primaryEntityId === undefined ? [] : [primaryEntityId]);
  const primary = primaryEntityId === undefined ? (entityIds[0] ?? null) : primaryEntityId;
  viewer.selectEntities(entityIds, primary);
}

export async function reconcileAuthoringSceneSelectionAfterLoad(
  viewer: AuthoringControlledState,
  loading: Promise<void>,
  selectedEntityIds: readonly string[] | undefined,
  primaryEntityId: string | null | undefined,
  isCurrent: () => boolean = () => true,
): Promise<void> {
  await loading;
  if (isCurrent()) {
    reconcileAuthoringSceneSelection(viewer, selectedEntityIds, primaryEntityId);
  }
}

export function reconcileAuthoringTransformSettings(
  viewer: AuthoringControlledState,
  transformSettings: AuthoringTransformSettings | undefined,
): void {
  if (transformSettings !== undefined) viewer.setTransformSettings(transformSettings);
}
