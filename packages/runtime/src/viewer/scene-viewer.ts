import type { CreateViewerOptions, SceneViewer } from "../types";

import { createThreeSceneViewport } from "./three-scene-viewport";

export function createSceneViewer(
  container: HTMLElement,
  options: CreateViewerOptions = {},
): SceneViewer {
  return createThreeSceneViewport(container, options);
}
