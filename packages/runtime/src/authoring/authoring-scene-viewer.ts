import type { AuthoringSceneViewer, CreateAuthoringViewerOptions } from "../types";

import { TransformAuthoringController } from "./transform-authoring-controller";
import { createThreeSceneViewport } from "../viewer/three-scene-viewport";

export function createAuthoringSceneViewer(
  container: HTMLElement,
  options: CreateAuthoringViewerOptions = {},
): AuthoringSceneViewer {
  const { initialTool, onEvent, ...viewerOptions } = options;
  return createThreeSceneViewport(container, viewerOptions, {
    enabled: true,
    initialTool: initialTool ?? "select",
    onEvent,
    createTransformController: (controllerOptions) =>
      new TransformAuthoringController(controllerOptions),
  });
}
