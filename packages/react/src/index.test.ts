import { StrictMode, createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, expectTypeOf, it } from "vitest";

import {
  AuthoringScene,
  SceneViewer,
  type AuthoringSceneHandle,
  type AuthoringSceneProps,
  type SceneViewerHandle,
  type SceneViewerProps,
} from "./index";

const source = {
  schemaVersion: "1.3.0",
  id: "scene-1",
  name: "Scene",
  revision: 0,
  assets: [],
  entities: [],
  targets: [],
  dataSources: [],
  bindings: [],
  ruleSets: [],
  annotations: [],
  views: [],
  environment: {
    backgroundMode: "theme",
    background: "#FFFFFF",
    grid: false,
    unit: "m",
    upAxis: "Y",
    lighting: {
      fill: { skyColor: "#FFFFFF", groundColor: "#65706A", intensity: 1.8 },
      key: {
        color: "#FFFFFF",
        intensity: 2.2,
        directionToLight: [0.37904902178945177, 0.7580980435789035, 0.5306686305052324],
      },
    },
  },
} as const;

describe("react runtime wrappers", () => {
  it("render as inert containers during StrictMode render", () => {
    const html = renderToStaticMarkup(
      createElement(
        StrictMode,
        undefined,
        createElement(SceneViewer, {
          source,
          canvasLabel: "Interactive 3D scene",
          className: "viewer",
        }),
        createElement(AuthoringScene, {
          source,
          canvasLabel: "Authoring 3D scene",
          className: "authoring",
          dataRuntimeEnabled: true,
          authoringMode: "edit",
          initialTool: "rotate",
          selectedEntityIds: ["asset-b", "asset-a"],
          primaryEntityId: "asset-b",
          transformSettings: {
            translationSnap: 0.5,
            rotationSnapRadians: Math.PI / 12,
            scaleSnap: null,
          },
          onBindingStateChange: () => undefined,
        }),
      ),
    );

    expect(html).toContain('data-web3d-react-viewer="true"');
    expect(html).toContain('data-web3d-react-authoring="true"');
    expect(html).toContain('class="viewer"');
    expect(html).toContain('class="authoring"');
    expectTypeOf<AuthoringSceneHandle["selectEntities"]>().toBeFunction();
    expectTypeOf<AuthoringSceneHandle["setThemeBackground"]>().toBeFunction();
    expectTypeOf<AuthoringSceneHandle["setBackgroundPreview"]>().toBeFunction();
    expectTypeOf<AuthoringSceneHandle["setGridPreview"]>().toBeFunction();
    expectTypeOf<AuthoringSceneHandle["setLightingPreview"]>().toBeFunction();
    expectTypeOf<AuthoringSceneHandle["setTransformSettings"]>().toBeFunction();
    expectTypeOf<AuthoringSceneHandle["setSmartAlignEnabled"]>().toBeFunction();
    expectTypeOf<AuthoringSceneHandle["isTransformDragging"]>().toBeFunction();
    expectTypeOf<AuthoringSceneHandle["getEntitySpatialSnapshots"]>().toBeFunction();
    expectTypeOf<AuthoringSceneHandle["setAuthoringMode"]>().toBeFunction();
    expectTypeOf<AuthoringSceneHandle["getLightCreationFrame"]>().toBeFunction();
    expectTypeOf<
      ReturnType<AuthoringSceneHandle["getEntitySpatialSnapshots"]>[number]
    >().toHaveProperty("documentRevision");
    expectTypeOf<
      ReturnType<AuthoringSceneHandle["getEntitySpatialSnapshots"]>[number]
    >().not.toHaveProperty("revision");
    expectTypeOf<AuthoringSceneProps>().not.toHaveProperty("onSelectionSetChange");
    expectTypeOf<AuthoringSceneProps>().toHaveProperty("themeBackground");
    expectTypeOf<AuthoringSceneProps>().toHaveProperty("backgroundPreview");
    expectTypeOf<AuthoringSceneProps>().toHaveProperty("gridPreview");
    expectTypeOf<AuthoringSceneProps>().toHaveProperty("lightingPreview");
    expectTypeOf<AuthoringSceneProps>().toHaveProperty("authoringMode");
    expectTypeOf<SceneViewerHandle["setThemeBackground"]>().toBeFunction();
    expectTypeOf<SceneViewerHandle["setBackgroundPreview"]>().toBeFunction();
    expectTypeOf<SceneViewerHandle["setGridPreview"]>().toBeFunction();
    expectTypeOf<SceneViewerHandle["setLightingPreview"]>().toBeFunction();
    expectTypeOf<SceneViewerProps>().toHaveProperty("themeBackground");
    expectTypeOf<SceneViewerProps>().toHaveProperty("backgroundPreview");
    expectTypeOf<SceneViewerProps>().toHaveProperty("gridPreview");
    expectTypeOf<SceneViewerProps>().toHaveProperty("lightingPreview");
  });
});
