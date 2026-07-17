import { describe, expect, it } from "vitest";

import type { SceneEntity } from "@web3d/document";

import {
  buildSceneTree,
  flattenSceneTree,
  sceneTreeFocusTarget,
  sceneTreeSelectionOperation,
} from "./scene-tree-model";

describe("scene tree model", () => {
  it("builds nested levels without using document order as selection meaning", () => {
    const roots = buildSceneTree([
      entity("child", "Child", "group"),
      entity("root-b", "Beta", null),
      entity("group", "Alpha", null, "group"),
    ]);

    expect(roots.map((node) => node.entity.id)).toEqual(["group", "root-b"]);
    expect(roots[0]?.level).toBe(1);
    expect(roots[0]?.children[0]?.entity.id).toBe("child");
    expect(roots[0]?.children[0]?.level).toBe(2);
    expect(flattenSceneTree(roots).map((node) => node.entity.id)).toEqual([
      "group",
      "child",
      "root-b",
    ]);
  });

  it("maps click modifiers to replace or toggle while preserving Shift additive behavior", () => {
    expect(sceneTreeSelectionOperation({ ctrlKey: false, metaKey: false, shiftKey: false })).toBe(
      "replace",
    );
    expect(sceneTreeSelectionOperation({ ctrlKey: true, metaKey: false, shiftKey: false })).toBe(
      "toggle",
    );
    expect(sceneTreeSelectionOperation({ ctrlKey: false, metaKey: true, shiftKey: false })).toBe(
      "toggle",
    );
    expect(sceneTreeSelectionOperation({ ctrlKey: false, metaKey: false, shiftKey: true })).toBe(
      "toggle",
    );
  });

  it("moves roving focus through visible tree order with stable endpoints", () => {
    const ids = ["a", "b", "c"];
    expect(sceneTreeFocusTarget(ids, "b", "ArrowUp")).toBe("a");
    expect(sceneTreeFocusTarget(ids, "b", "ArrowDown")).toBe("c");
    expect(sceneTreeFocusTarget(ids, "a", "ArrowUp")).toBe("a");
    expect(sceneTreeFocusTarget(ids, "c", "ArrowDown")).toBe("c");
    expect(sceneTreeFocusTarget(ids, "c", "Home")).toBe("a");
    expect(sceneTreeFocusTarget(ids, "a", "End")).toBe("c");
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
