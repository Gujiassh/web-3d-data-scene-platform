import { describe, expect, it } from "vitest";

import type { SceneDocument, SceneEntity } from "@web3d/document";
import type { EntitySpatialSnapshot } from "@web3d/runtime";

import { deriveLayoutCapabilities } from "./layout-capabilities";
import { matrixFromTransform } from "./spatial-math";

describe("deriveLayoutCapabilities", () => {
  it("separates selection counts and allows locked-source duplicate", () => {
    const locked = { ...entity("a", 0), locked: true } as SceneEntity;
    const document = scene([locked, entity("b", 4), entity("c", 8)]);
    const capabilities = derive(document, ["a", "b", "c"], "a");

    expect(capabilities.group.reason).toBe("selection-locked");
    expect(capabilities.align.reason).toBe("selection-locked");
    expect(capabilities.distribute.reason).toBe("selection-locked");
    expect(capabilities.duplicate.enabled).toBe(true);
  });

  it("requires current bounds for bounds actions but not reparent", () => {
    const document = scene([entity("a", 0), entity("b", 4)]);
    const snapshots = document.entities.map((item) => ({ ...snapshot(item), worldBounds: null }));
    const capabilities = deriveLayoutCapabilities({
      document,
      selectedEntityIds: ["a", "b"],
      primaryEntityId: "a",
      snapshots,
      editable: true,
      reparentTargetId: null,
      anchorTargetId: null,
      duplicateOffsetValid: true,
    });

    expect(capabilities.group.reason).toBe("bounds-unavailable");
    expect(capabilities.align.reason).toBe("bounds-unavailable");
    expect(capabilities.reparent.reason).toBe("target-current-parent");
    expect(capabilities.duplicate.enabled).toBe(true);
  });

  it("disables every mutation in Run", () => {
    const document = scene([entity("a", 0), entity("b", 4), entity("c", 8)]);
    const capabilities = deriveLayoutCapabilities({
      document,
      selectedEntityIds: ["a", "b", "c"],
      primaryEntityId: "a",
      snapshots: document.entities.map(snapshot),
      editable: false,
      reparentTargetId: null,
      anchorTargetId: "b",
      duplicateOffsetValid: true,
    });

    expect(Object.values(capabilities).every((item) => item.reason === "run-disabled")).toBe(true);
  });

  it("disables duplicate before execution when the offset draft is invalid", () => {
    const document = scene([entity("a", 0)]);
    const input = {
      document,
      selectedEntityIds: ["a"],
      primaryEntityId: "a",
      snapshots: document.entities.map(snapshot),
      editable: true,
      reparentTargetId: null,
      anchorTargetId: null,
      duplicateOffsetValid: false,
    };
    const capabilities = deriveLayoutCapabilities(input);
    expect(capabilities.duplicate).toEqual({ enabled: false, reason: "invalid-offset" });
  });
});

function derive(document: SceneDocument, selected: readonly string[], primary: string) {
  return deriveLayoutCapabilities({
    document,
    selectedEntityIds: selected,
    primaryEntityId: primary,
    snapshots: document.entities.map(snapshot),
    editable: true,
    reparentTargetId: "destination",
    anchorTargetId: "b",
    duplicateOffsetValid: true,
  });
}

function scene(entities: readonly SceneEntity[]): SceneDocument {
  return {
    schemaVersion: "1.2.0",
    id: "scene",
    name: "Scene",
    revision: 3,
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
      lighting: standardLighting(),
    },
  };
}

function standardLighting() {
  return {
    fill: { skyColor: "#FFFFFF", groundColor: "#65706A", intensity: 1.8 },
    key: {
      color: "#FFFFFF",
      intensity: 2.2,
      directionToLight: [0.37904902178945177, 0.7580980435789035, 0.5306686305052324] as const,
    },
  };
}

function entity(id: string, x: number): SceneEntity {
  return {
    id,
    type: "asset",
    assetId: "asset",
    parentId: null,
    name: id,
    visible: true,
    locked: false,
    transform: { position: [x, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
    metadata: {},
  };
}

function snapshot(entity: SceneEntity): EntitySpatialSnapshot {
  const world = matrixFromTransform(entity.transform);
  const x = entity.transform.position[0];
  return {
    documentId: "scene",
    documentRevision: 3,
    entityId: entity.id,
    parentId: entity.parentId,
    localTransform: entity.transform,
    worldMatrix: world.toArray() as unknown as EntitySpatialSnapshot["worldMatrix"],
    worldBounds: { min: [x - 1, -1, -1], max: [x + 1, 1, 1] },
    worldPivot: [x, 0, 0],
    visible: entity.visible,
    locked: entity.locked,
  };
}
