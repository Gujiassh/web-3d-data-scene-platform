import { describe, expect, it } from "vitest";

import type { SceneDocument } from "@web3d/document";

import { createNewStudioProject } from "../session/new-project";
import { resolveSelectedRootTarget } from "./selected-target";

describe("resolveSelectedRootTarget", () => {
  it("resolves exactly one explicit root target by entity ID", () => {
    const document = withAssetTarget(emptyDocument(), null);
    expect(resolveSelectedRootTarget(document, "entity-a")).toMatchObject({
      status: "supported",
      target: { id: "target-a", entityId: "entity-a", nodeIndex: null },
    });
  });

  it("does not guess among node targets, multiple roots, groups, or missing selections", () => {
    const nodesOnly = {
      ...withAssetTarget(emptyDocument(), 0),
      targets: [target(0, "target-a"), target(1, "target-b")],
    };
    expect(resolveSelectedRootTarget(nodesOnly, "entity-a").status).toBe("no-root-target");

    const multipleRoots = {
      ...nodesOnly,
      targets: [target(null, "target-a"), target(null, "target-b")],
    };
    expect(resolveSelectedRootTarget(multipleRoots, "entity-a").status).toBe(
      "ambiguous-root-target",
    );
    expect(resolveSelectedRootTarget(emptyDocument(), "group-a").status).toBe("unsupported-entity");
    expect(resolveSelectedRootTarget(emptyDocument(), null).status).toBe("no-selection");
  });
});

function emptyDocument(): SceneDocument {
  const document = createNewStudioProject({
    id: "project-a",
    name: "Project A",
    createdAt: "2026-07-15T00:00:00Z",
  }).document;
  return {
    ...document,
    entities: [
      {
        id: "group-a",
        type: "group",
        parentId: null,
        name: "Group",
        visible: true,
        locked: false,
        transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
        metadata: {},
      },
    ],
  };
}

function withAssetTarget(document: SceneDocument, nodeIndex: number | null): SceneDocument {
  return {
    ...document,
    entities: [
      ...document.entities,
      {
        id: "entity-a",
        type: "asset",
        parentId: null,
        name: "Asset",
        visible: true,
        locked: false,
        transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
        assetId: "asset-a",
        metadata: {},
      },
    ],
    targets: [target(nodeIndex, "target-a")],
  };
}

function target(nodeIndex: number | null, id: string) {
  return {
    id,
    entityId: "entity-a",
    name: id,
    assetHash: "a".repeat(64),
    nodeIndex,
    metadata: {},
  } as const;
}
