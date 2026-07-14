import { describe, expect, it } from "vitest";

import { executeDocumentCommand, type SceneDocument } from "@web3d/document";

import {
  buildDuplicateSubtreeCommand,
  buildImportAssetCommand,
  type StableIdFactory,
} from "./command-builders";
import { createNewStudioProject } from "./new-project";

describe("Studio command builders", () => {
  it("builds explicit entity and target maps for a duplicated subtree", () => {
    const document = documentWithSubtree();
    const ids = sequentialIds();
    const command = buildDuplicateSubtreeCommand(document, "group-a", ids);

    expect(command.entityIdMap).toEqual({
      "group-a": "entity-1-group-a",
      "asset-a": "entity-2-asset-a",
    });
    expect(command.targetIdMap).toEqual({ "target-a": "target-3-target-a" });
    const next = executeDocumentCommand(document, command);
    expect(next.entities.map((entity) => entity.id)).toContain("entity-2-asset-a");
    expect(next.targets.at(-1)?.businessId).toBeUndefined();
  });

  it("creates an import command and explicitly reuses one matching asset", () => {
    const empty = createNewStudioProject({
      id: "project",
      name: "Project",
      createdAt: "2026-07-14T10:00:00Z",
    }).document;
    const descriptor = modelDescriptor();
    const first = buildImportAssetCommand(empty, descriptor, sequentialIds());
    const imported = executeDocumentCommand(empty, first);
    const second = buildImportAssetCommand(imported, descriptor, sequentialIds());
    const next = executeDocumentCommand(imported, second);

    expect(second.asset.id).toBe(first.asset.id);
    expect(next.assets).toHaveLength(1);
    expect(next.entities).toHaveLength(2);
  });

  it("rejects an ambiguous or conflicting hash instead of choosing the first asset", () => {
    const empty = createNewStudioProject({
      id: "project",
      name: "Project",
      createdAt: "2026-07-14T10:00:00Z",
    }).document;
    const descriptor = modelDescriptor();
    const first = executeDocumentCommand(
      empty,
      buildImportAssetCommand(empty, descriptor, sequentialIds()),
    );
    const duplicateRecord: SceneDocument = {
      ...first,
      assets: [...first.assets, { ...first.assets[0]!, id: "asset-duplicate" }],
    };

    expect(() => buildImportAssetCommand(duplicateRecord, descriptor, sequentialIds())).toThrow(
      "multiple SceneAsset records",
    );
    expect(() =>
      buildImportAssetCommand(
        first,
        { ...descriptor, byteLength: descriptor.byteLength + 1 },
        sequentialIds(),
      ),
    ).toThrow("conflicts with the existing SceneAsset");
  });
});

function sequentialIds(): StableIdFactory {
  let index = 0;
  return {
    next(kind, sourceId) {
      index += 1;
      return `${kind}-${index}${sourceId === undefined ? "" : `-${sourceId}`}`;
    },
  };
}

function modelDescriptor() {
  return {
    fileName: "assembly.glb",
    mediaType: "model/gltf-binary" as const,
    byteLength: 2048,
    sha256: "a".repeat(64),
    stats: {
      nodeCount: 3,
      meshCount: 2,
      materialCount: 1,
      triangleCount: 120,
    },
    parentId: null,
  };
}

function documentWithSubtree(): SceneDocument {
  const descriptor = modelDescriptor();
  const empty = createNewStudioProject({
    id: "project",
    name: "Project",
    createdAt: "2026-07-14T10:00:00Z",
  }).document;
  const imported = executeDocumentCommand(
    empty,
    buildImportAssetCommand(empty, descriptor, sequentialIds()),
  );
  const asset = imported.assets[0]!;
  return {
    ...imported,
    entities: [
      {
        id: "group-a",
        type: "group",
        parentId: null,
        name: "Group A",
        visible: true,
        locked: false,
        transform: {
          position: [0, 0, 0],
          rotation: [0, 0, 0, 1],
          scale: [1, 1, 1],
        },
        metadata: {},
      },
      { ...imported.entities[0]!, id: "asset-a", parentId: "group-a" },
    ],
    targets: [
      {
        ...imported.targets[0]!,
        id: "target-a",
        entityId: "asset-a",
        assetHash: asset.sha256,
        businessId: "EXTERNAL-A",
      },
    ],
  };
}
