import { StrictMode, createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AuthoringScene, SceneViewer } from "./index";

const source = {
  schemaVersion: "1.0.0",
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
        createElement(SceneViewer, { source, className: "viewer" }),
        createElement(AuthoringScene, {
          source,
          className: "authoring",
          initialTool: "rotate",
        }),
      ),
    );

    expect(html).toContain('data-web3d-react-viewer="true"');
    expect(html).toContain('data-web3d-react-authoring="true"');
    expect(html).toContain('class="viewer"');
    expect(html).toContain('class="authoring"');
  });
});
