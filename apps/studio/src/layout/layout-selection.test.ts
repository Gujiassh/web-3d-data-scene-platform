import { describe, expect, it } from "vitest";

import type { SceneEntity } from "@web3d/document";

import {
  LAYOUT_ANCHORS,
  LAYOUT_AXES,
  getSameParentCapability,
  normalizeSelectedRoots,
} from "./layout-selection";

describe("layout selection", () => {
  const entities = [
    entity("root-b", null),
    entity("group", null, { type: "group" }),
    entity("child-z", "group"),
    entity("child-a", "group"),
  ];

  it("suppresses selected descendants and returns roots in stable ID order", () => {
    expect(normalizeSelectedRoots(entities, ["root-b", "child-z", "group", "child-a"])).toEqual([
      "group",
      "root-b",
    ]);
  });

  it("reports same-parent hierarchy and bounds capabilities independently", () => {
    const sameParent = getSameParentCapability(entities, ["child-z", "child-a"]);
    expect(sameParent).toMatchObject({
      rootEntityIds: ["child-a", "child-z"],
      missingEntityIds: [],
      hasSameParent: true,
      parentId: "group",
      canEditHierarchy: true,
      canUseBounds: true,
    });

    const mixed = getSameParentCapability(entities, ["root-b", "child-a"]);
    expect(mixed.hasSameParent).toBe(false);
    expect(mixed.canEditHierarchy).toBe(false);
    expect(mixed.canUseBounds).toBe(false);
  });

  it("gates direct edits on locks and only bounds operations on visibility", () => {
    const guarded = [
      entity("locked", null, { locked: true }),
      entity("hidden", null, { visible: false }),
    ];
    const locked = getSameParentCapability(guarded, ["locked"]);
    expect(locked.lockedEntityIds).toEqual(["locked"]);
    expect(locked.canEditHierarchy).toBe(false);
    expect(locked.canUseBounds).toBe(false);

    const hidden = getSameParentCapability(guarded, ["hidden"]);
    expect(hidden.hiddenEntityIds).toEqual(["hidden"]);
    expect(hidden.canEditHierarchy).toBe(true);
    expect(hidden.canUseBounds).toBe(false);
  });

  it("does not silently enable a selection containing a missing ID", () => {
    const capability = getSameParentCapability(entities, ["child-a", "missing"]);
    expect(capability.missingEntityIds).toEqual(["missing"]);
    expect(capability.canEditHierarchy).toBe(false);
    expect(capability.canUseBounds).toBe(false);
  });

  it("defines the fixed layout axes and anchors", () => {
    expect(LAYOUT_AXES).toEqual(["x", "y", "z"]);
    expect(LAYOUT_ANCHORS).toEqual(["min", "center", "max"]);
  });
});

function entity(
  id: string,
  parentId: string | null,
  options: {
    readonly type?: SceneEntity["type"];
    readonly locked?: boolean;
    readonly visible?: boolean;
  } = {},
): SceneEntity {
  const common = {
    id,
    parentId,
    name: id,
    visible: options.visible ?? true,
    locked: options.locked ?? false,
    transform: {
      position: [0, 0, 0],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
    },
    metadata: {},
  } as const;
  return options.type === "group"
    ? { ...common, type: "group" }
    : { ...common, type: "asset", assetId: "asset" };
}
