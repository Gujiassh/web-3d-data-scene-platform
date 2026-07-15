import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { SceneEntity } from "@web3d/document";

import { StudioI18nProvider } from "../i18n/I18nProvider";
import { SceneTree } from "./SceneTree";

describe("SceneTree", () => {
  it("renders a nested multi-select tree with levels and a localized primary name", () => {
    const html = renderToStaticMarkup(
      createElement(
        StudioI18nProvider,
        null,
        createElement(SceneTree, {
          entities: [entity("group", "Assembly", null, "group"), entity("child", "Press", "group")],
          selectedEntityIds: ["child", "group"],
          primaryEntityId: "child",
          editable: true,
          onSelect: () => undefined,
          onVisibilityChange: () => undefined,
          onLockChange: () => undefined,
        }),
      ),
    );

    expect(html).toContain('role="tree"');
    expect(html).toContain('aria-multiselectable="true"');
    expect(html).toContain('aria-level="1"');
    expect(html).toContain('aria-level="2"');
    expect(html).toContain('role="group"');
    expect(html).toContain('aria-label="Press, primary selection"');
    expect(html.match(/tabindex="0"/g)).toHaveLength(1);
  });
});

function entity(
  id: string,
  name: string,
  parentId: string | null,
  type: SceneEntity["type"] = "asset",
): SceneEntity {
  const common = {
    id,
    parentId,
    name,
    visible: true,
    locked: false,
    transform: {
      position: [0, 0, 0],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
    },
    metadata: {},
  } as const;
  return type === "group" ? { ...common, type } : { ...common, type, assetId: "asset" };
}
