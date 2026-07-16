import { describe, expect, it } from "vitest";

import type { SceneDocument, SceneEntity } from "@web3d/document";

import {
  canEditEntityTransform,
  getTransformResetCapability,
  planTransformReset,
  resetTransformComponent,
  TransformResetError,
} from "./transform-reset";

describe("transform reset planning", () => {
  it("resets reduced roots atomically without requiring a common parent", () => {
    const document = scene([
      entity("parent", null, [4, 5, 6]),
      entity("child", "parent", [7, 8, 9]),
      entity("other", null, [10, 11, 12]),
    ]);
    const command = planTransformReset(document, ["child", "other", "parent"], "position");

    expect(command.changes.map((change) => change.entityId)).toEqual(["other", "parent"]);
    expect(command.changes.every((change) => change.after.position.join() === "0,0,0")).toBe(true);
    expect(command.changes[1]?.after.rotation).toBe(command.changes[1]?.before.rotation);
    expect(command.changes[1]?.after.scale).toBe(command.changes[1]?.before.scale);
  });

  it("uses exact component and all identities", () => {
    const transform = entity("source", null, [2, 3, 4]).transform;
    expect(resetTransformComponent(transform, "rotation")).toEqual({
      ...transform,
      rotation: [0, 0, 0, 1],
    });
    expect(resetTransformComponent(transform, "all")).toEqual({
      position: [0, 0, 0],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
    });
  });

  it("rejects missing, locked and effectively hidden selections as a whole", () => {
    const document = scene([
      { ...entity("hidden-parent", null), visible: false },
      entity("child", "hidden-parent"),
      { ...entity("locked", null), locked: true },
      entity("valid", null),
    ]);
    expectResetError(document, ["missing", "valid"], "selection-missing");
    expectResetError(document, ["locked", "valid"], "selection-locked");
    expectResetError(document, ["child", "valid"], "selection-hidden");
    expect(getTransformResetCapability(document, ["valid"], false)).toEqual({
      enabled: false,
      reason: "run-disabled",
    });
  });

  it("does not recursively inherit a locked ancestor", () => {
    const document = scene([
      { ...entity("locked-parent", null), locked: true },
      entity("child", "locked-parent"),
    ]);
    expect(getTransformResetCapability(document, ["child"], true)).toEqual({
      enabled: true,
      reason: null,
    });
    expect(canEditEntityTransform(document, "child", true)).toBe(true);
    expect(canEditEntityTransform(document, "locked-parent", true)).toBe(false);
  });
});

function expectResetError(
  document: SceneDocument,
  ids: readonly string[],
  code: TransformResetError["code"],
): void {
  try {
    planTransformReset(document, ids, "all");
    throw new Error("Expected reset planning to fail.");
  } catch (error) {
    expect(error).toBeInstanceOf(TransformResetError);
    expect((error as TransformResetError).code).toBe(code);
  }
}

function entity(
  id: string,
  parentId: string | null,
  position: readonly [number, number, number] = [1, 2, 3],
): SceneEntity {
  return {
    id,
    type: "group",
    parentId,
    name: id,
    visible: true,
    locked: false,
    transform: {
      position,
      rotation: [0.1, 0.2, 0.3, 0.9273618495495703],
      scale: [2, 3, 4],
    },
    metadata: {},
  };
}

function scene(entities: readonly SceneEntity[]): SceneDocument {
  return {
    schemaVersion: "1.1.0",
    id: "scene",
    name: "Scene",
    revision: 1,
    assets: [],
    entities,
    targets: [],
    dataSources: [],
    bindings: [],
    ruleSets: [],
    annotations: [],
    views: [],
    environment: {
      backgroundMode: "custom",
      background: "#FFFFFF",
      grid: true,
      unit: "m",
      upAxis: "Y",
    },
  };
}
