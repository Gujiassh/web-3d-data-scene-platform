import type { AuthoringSceneViewer, DataAdapter } from "@web3d/runtime";

type AuthoringRuntimeControls = Pick<AuthoringSceneViewer, "setAdapter" | "setDataRuntimeEnabled">;

export async function reconcileAuthoringSceneRuntime(
  viewer: AuthoringRuntimeControls,
  previous: Readonly<Record<string, DataAdapter>>,
  next: Readonly<Record<string, DataAdapter>>,
  enabled: boolean,
  isCurrent: () => boolean = () => true,
): Promise<void> {
  await viewer.setDataRuntimeEnabled(false);
  if (!isCurrent()) return;

  const operations: Promise<void>[] = [];
  for (const sourceId of Object.keys(previous)) {
    if (!(sourceId in next)) operations.push(viewer.setAdapter(sourceId, null));
  }
  for (const [sourceId, adapter] of Object.entries(next)) {
    if (previous[sourceId] !== adapter) {
      operations.push(viewer.setAdapter(sourceId, adapter));
    }
  }
  await Promise.all(operations);
  if (enabled && isCurrent()) await viewer.setDataRuntimeEnabled(true);
}
