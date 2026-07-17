import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { LightEntity, SceneEntity } from "@web3d/document";

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

  it("renders root Point and Spot entities with explicit light kinds", () => {
    const html = renderToStaticMarkup(
      createElement(
        StudioI18nProvider,
        null,
        createElement(SceneTree, {
          entities: [light("point"), light("spot")],
          selectedEntityIds: [],
          primaryEntityId: null,
          editable: true,
          onSelect: () => undefined,
          onVisibilityChange: () => undefined,
          onLockChange: () => undefined,
        }),
      ),
    );

    expect(html).toContain('data-entity-type="point"');
    expect(html).toContain('data-entity-type="spot"');
    expect(html).toContain("Point light 1");
    expect(html).toContain("Spot light 1");
  });
});

function entity(
  id: string,
  name: string,
  parentId: string | null,
  type: "group" | "asset" = "asset",
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

function light(kind: LightEntity["light"]["kind"]): LightEntity {
  const common = {
    id: `light-${kind}`,
    type: "light" as const,
    parentId: null,
    name: kind === "point" ? "Point light 1" : "Spot light 1",
    visible: true,
    locked: false,
    transform: { position: [0, 2, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
    metadata: {},
  } as const;
  return kind === "point"
    ? {
        ...common,
        light: { kind, color: "#FFFFFF", intensity: 25, range: null },
      }
    : {
        ...common,
        light: {
          kind,
          color: "#FFFFFF",
          intensity: 10,
          range: null,
          angleRadians: Math.PI / 4,
          penumbra: 1 / 3,
        },
      };
}
