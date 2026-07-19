import type { AuthoringSceneViewer, CreateAuthoringViewerOptions } from "../types";

import { TransformAuthoringController } from "./transform-authoring-controller";
import { createThreeSceneViewport } from "../viewer/three-scene-viewport";

export function createAuthoringSceneViewer(
  container: HTMLElement,
  options: CreateAuthoringViewerOptions = {},
): AuthoringSceneViewer {
  const {
    authoringMode,
    dataRuntimeEnabled,
    hotspotAuthority,
    hotspotOrder,
    initialTool,
    onEvent,
    ...viewerOptions
  } = options;
  return createThreeSceneViewport(container, viewerOptions, {
    enabled: true,
    initialMode: authoringMode ?? "edit",
    dataRuntimeEnabled: dataRuntimeEnabled ?? false,
    initialTool: initialTool ?? "select",
    onEvent,
    initialHotspotAuthority: hotspotAuthority ?? { projectId: null, sourceId: null },
    initialHotspotOrder: hotspotOrder ?? [],
    createTransformController: (controllerOptions) =>
      new TransformAuthoringController(controllerOptions),
  });
}
