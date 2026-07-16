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
  schemaVersion: "1.1.0",
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
    expectTypeOf<AuthoringSceneHandle["setTransformSettings"]>().toBeFunction();
    expectTypeOf<AuthoringSceneHandle["getEntitySpatialSnapshots"]>().toBeFunction();
    expectTypeOf<
      ReturnType<AuthoringSceneHandle["getEntitySpatialSnapshots"]>[number]
    >().toHaveProperty("documentRevision");
    expectTypeOf<
      ReturnType<AuthoringSceneHandle["getEntitySpatialSnapshots"]>[number]
    >().not.toHaveProperty("revision");
    expectTypeOf<AuthoringSceneProps>().not.toHaveProperty("onSelectionSetChange");
    expectTypeOf<AuthoringSceneProps>().toHaveProperty("themeBackground");
    expectTypeOf<AuthoringSceneProps>().toHaveProperty("backgroundPreview");
    expectTypeOf<SceneViewerHandle["setThemeBackground"]>().toBeFunction();
    expectTypeOf<SceneViewerHandle["setBackgroundPreview"]>().toBeFunction();
    expectTypeOf<SceneViewerProps>().toHaveProperty("themeBackground");
    expectTypeOf<SceneViewerProps>().toHaveProperty("backgroundPreview");
  });
});
