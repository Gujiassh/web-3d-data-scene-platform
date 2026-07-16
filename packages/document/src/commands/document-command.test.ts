import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { validateSceneDocument, type RenameDocumentCommand, type SceneDocument } from "../index.js";
import type { Annotation, AssetEntity, Binding, GroupEntity, SceneTarget } from "../types.js";
import { executeDocumentCommand } from "./document-command.js";
import {
  createDocumentHistory,
  executeHistoryCommand,
  redoHistoryCommand,
  undoHistoryCommand,
} from "./history.js";
import type { DocumentCommand } from "./types.js";

const fixtureUrl = new URL(
  "../../../../specs/001-product-foundation/contracts/scene.example.json",
  import.meta.url,
);

describe("document commands", () => {
  it("sets scene background atomically with no-op and undo/redo history", () => {
    const original = loadFixture();
    const before = backgroundSettings(original);
    const command = backgroundCommand(before, { mode: "custom", color: "#123456" });
    const applied = executeHistoryCommand(createDocumentHistory(original), command);

    expect(applied.document.environment).toMatchObject({
      backgroundMode: "custom",
      background: "#123456",
    });
    expect(applied.document.revision).toBe(original.revision + 1);
    expect(applied.undoStack).toHaveLength(1);
    expect(applied.document.entities).toBe(original.entities);
    expect(applied.document.targets).toBe(original.targets);
    expect(applied.document.dataSources).toBe(original.dataSources);
    expect(applied.document.bindings).toBe(original.bindings);
    expect(applied.document.ruleSets).toBe(original.ruleSets);
    expect(applied.document.annotations).toBe(original.annotations);

    const undone = undoHistoryCommand(applied);
    expect(undone.document.environment).toEqual(original.environment);
    const undoneBackground = backgroundSettings(undone.document);
    const noop = executeHistoryCommand(
      undone,
      backgroundCommand(undoneBackground, undoneBackground),
    );
    expect(noop).toBe(undone);
    expect(noop.redoStack).toHaveLength(1);
    const redone = redoHistoryCommand(noop);
    expect(redone.document.environment).toMatchObject({
      backgroundMode: "custom",
      background: "#123456",
    });
    expect(redone.document.revision).toBe(original.revision + 3);
  });

  it("rejects stale and malformed scene background commands without history mutation", () => {
    const original = loadFixture();
    const history = createDocumentHistory(original);

    expect(() =>
      executeHistoryCommand(
        history,
        backgroundCommand(
          { mode: "custom", color: "#000000" },
          { mode: "custom", color: "#123456" },
        ),
      ),
    ).toThrow();
    expect(() =>
      executeHistoryCommand(
        history,
        backgroundCommand(backgroundSettings(original), { mode: "custom", color: "red" }),
      ),
    ).toThrow();
    expect(() =>
      executeHistoryCommand(
        history,
        backgroundCommand(backgroundSettings(original), {
          mode: "system" as "theme",
          color: "#123456",
        }),
      ),
    ).toThrow();
    expect(history.document).toEqual(original);
    expect(history.undoStack).toEqual([]);
    expect(history.redoStack).toEqual([]);
  });
  it("renames the document with a trimmed name as one validated revision", () => {
    const document = loadFixture();
    const command: RenameDocumentCommand = {
      type: "rename-document",
      name: "  Assembly line overview  ",
    };

    const next = executeDocumentCommand(document, command);

    expect(next.name).toBe("Assembly line overview");
    expect(next.revision).toBe(document.revision + 1);
    expectValidationOk(next);
  });

  it("rejects a whitespace-only document name without changing the document", () => {
    const document = loadFixture();

    expect(() =>
      executeDocumentCommand(document, { type: "rename-document", name: "  \t\n  " }),
    ).toThrow("Document name must not be empty.");
    expect(document.name).toBe(loadFixture().name);
    expect(document.revision).toBe(loadFixture().revision);
  });

  it("treats the current trimmed document name as a history no-op", () => {
    const document = loadFixture();
    const renamed = executeHistoryCommand(createDocumentHistory(document), {
      type: "rename-document",
      name: "Temporary name",
    });
    const history = undoHistoryCommand(renamed);

    const next = executeHistoryCommand(history, {
      type: "rename-document",
      name: `  ${document.name}  `,
    });

    expect(next).toBe(history);
    expect(next.document.name).toBe(document.name);
    expect(next.document.revision).toBe(history.document.revision);
    expect(next.undoStack).toEqual([]);
    expect(next.redoStack).toHaveLength(1);
  });

  it("undoes and redoes document renames with monotonic revisions", () => {
    const original = loadFixture();
    const renamed = executeHistoryCommand(createDocumentHistory(original), {
      type: "rename-document",
      name: "Packaging cell",
    });

    expect(renamed.document.name).toBe("Packaging cell");
    expect(renamed.document.revision).toBe(original.revision + 1);

    const undone = undoHistoryCommand(renamed);
    expect(undone.document.name).toBe(original.name);
    expect(undone.document.revision).toBe(original.revision + 2);

    const redone = redoHistoryCommand(undone);
    expect(redone.document.name).toBe("Packaging cell");
    expect(redone.document.revision).toBe(original.revision + 3);
    expectValidationOk(redone.document);
  });

  it("supports three-step undo and redo with monotonic revisions", () => {
    const original = loadFixture();
    let history = createDocumentHistory(original);

    history = executeHistoryCommand(history, {
      type: "rename-entity",
      entityId: "press-01",
      name: "Press 01 Renamed",
    });
    history = executeHistoryCommand(history, {
      type: "transform-entity",
      entityId: "press-01",
      before: original.entities[1]!.transform,
      after: {
        position: [5, 0, -3],
        rotation: [0, 0, 0, 1],
        scale: [2, 2, 2],
      },
    });
    history = executeHistoryCommand(history, {
      type: "set-entity-lock",
      entityId: "press-01",
      locked: true,
    });

    expect(history.document.revision).toBe(original.revision + 3);
    expect(entityById(history.document, "press-01")).toMatchObject({
      name: "Press 01 Renamed",
      locked: true,
      transform: {
        position: [5, 0, -3],
        rotation: [0, 0, 0, 1],
        scale: [2, 2, 2],
      },
    });

    history = undoHistoryCommand(history);
    history = undoHistoryCommand(history);
    history = undoHistoryCommand(history);

    expect(history.document).toEqual({ ...original, revision: original.revision + 6 });

    history = redoHistoryCommand(history);
    history = redoHistoryCommand(history);
    history = redoHistoryCommand(history);

    expect(history.document.revision).toBe(original.revision + 9);
    expect(entityById(history.document, "press-01")).toMatchObject({
      name: "Press 01 Renamed",
      locked: true,
      transform: {
        position: [5, 0, -3],
        rotation: [0, 0, 0, 1],
        scale: [2, 2, 2],
      },
    });
    expectValidationOk(history.document);
  });

  it("cascades delete across targets, bindings, and annotations", () => {
    const document = withNestedAssetTarget(loadFixture());

    const next = executeDocumentCommand(document, {
      type: "delete-subtree",
      rootEntityId: "line-01",
    });

    expect(next.revision).toBe(document.revision + 1);
    expect(next.entities.map((entity) => entity.id)).toEqual(["factory-root", "press-01"]);
    expect(next.targets.map((target) => target.id)).toEqual(["press-01-target"]);
    expect(next.bindings.map((binding) => binding.id)).toEqual(["press-01-status-binding"]);
    expect(next.annotations).toEqual([]);
    expectValidationOk(next);
  });

  it("duplicates a subtree with caller-provided stable IDs only", () => {
    const document = withNestedAssetTarget(loadFixture());
    const next = executeDocumentCommand(document, {
      type: "duplicate-subtree",
      rootEntityId: "line-01",
      entityIdMap: {
        "line-01": "dup-line-A",
        "robot-01": "dup-robot-Z",
      },
      targetIdMap: {
        "robot-01-target": "dup-target-Q",
      },
    });

    expect(next.revision).toBe(document.revision + 1);
    expect(next.entities.map((entity) => entity.id)).toEqual([
      "factory-root",
      "press-01",
      "line-01",
      "robot-01",
      "dup-line-A",
      "dup-robot-Z",
    ]);
    expect(entityById(next, "dup-line-A").parentId).toBe("factory-root");
    expect(entityById(next, "dup-robot-Z")).toMatchObject({
      parentId: "dup-line-A",
      assetId: "asset-press",
      name: "Robot 01",
    });
    expect(next.targets.map((target) => target.id)).toEqual([
      "press-01-target",
      "robot-01-target",
      "dup-target-Q",
    ]);
    expect(targetById(next, "dup-target-Q")).toMatchObject({
      entityId: "dup-robot-Z",
      assetHash: document.assets[0]!.sha256,
      nodeIndex: 2,
    });
    expect(targetById(next, "dup-target-Q")).not.toHaveProperty("businessId");
    expect(next.bindings.map((binding) => binding.id)).toEqual([
      "press-01-status-binding",
      "robot-01-status-binding",
    ]);
    expect(next.annotations.map((annotation) => annotation.id)).toEqual(["robot-01-annotation"]);
    expectValidationOk(next);
  });

  it("rejects transforms for locked entities at the command boundary", () => {
    const document = loadFixture();
    const lockedDocument = {
      ...document,
      entities: document.entities.map((entity) =>
        entity.id === "press-01" ? { ...entity, locked: true } : entity,
      ),
    } satisfies SceneDocument;

    expect(() =>
      executeDocumentCommand(lockedDocument, {
        type: "transform-entity",
        entityId: "press-01",
        before: entityById(lockedDocument, "press-01").transform,
        after: {
          position: [5, 0, -3],
          rotation: [0, 0, 0, 1],
          scale: [2, 2, 2],
        },
      }),
    ).toThrow("Locked entity 'press-01' cannot be transformed.");
    expect(lockedDocument.revision).toBe(document.revision);
    expect(entityById(lockedDocument, "press-01").transform).toEqual(
      entityById(document, "press-01").transform,
    );
  });

  it("enforces finite normalized positive single transforms before mutation", () => {
    const document = loadFixture();
    const entity = entityById(document, "press-01");
    const invalidAfter = [
      {
        ...entity.transform,
        position: [Number.NaN, 0, 0] as const,
      },
      {
        ...entity.transform,
        rotation: [0, 0, 0, 2] as const,
      },
      {
        ...entity.transform,
        scale: [1, 0, 1] as const,
      },
    ];

    for (const after of invalidAfter) {
      expect(() =>
        executeDocumentCommand(document, {
          type: "transform-entity",
          entityId: entity.id,
          before: entity.transform,
          after,
        }),
      ).toThrow();
      expect(document.revision).toBe(loadFixture().revision);
      expect(entityById(document, entity.id).transform).toEqual(entity.transform);
    }
  });

  it("rejects invalid and stale single-transform before snapshots without changing history", () => {
    const document = loadFixture();
    const entity = entityById(document, "press-01");
    const commands: readonly DocumentCommand[] = [
      {
        type: "transform-entity",
        entityId: entity.id,
        before: { ...entity.transform, position: [99, 0, 0] },
        after: { ...entity.transform, position: [5, 0, 0] },
      },
      {
        type: "transform-entity",
        entityId: entity.id,
        before: { ...entity.transform, scale: [0, 1, 1] },
        after: { ...entity.transform, position: [5, 0, 0] },
      },
    ];

    for (const command of commands) {
      const history = createDocumentHistory(document);
      const beforeHistory = structuredClone(history);
      expect(() => executeHistoryCommand(history, command)).toThrow();
      expect(history).toEqual(beforeHistory);
      expect(history.document).toBe(document);
      expect(history.undoStack).toHaveLength(0);
      expect(history.redoStack).toHaveLength(0);
    }
  });

  it("keeps exact single-transform no-ops out of history without clearing redo", () => {
    const document = loadFixture();
    const changed = executeHistoryCommand(createDocumentHistory(document), {
      type: "rename-entity",
      entityId: "press-01",
      name: "Changed",
    });
    const undone = undoHistoryCommand(changed);
    const entity = entityById(undone.document, "press-01");
    const noop = executeHistoryCommand(undone, {
      type: "transform-entity",
      entityId: entity.id,
      before: entity.transform,
      after: entity.transform,
    });

    expect(noop).toBe(undone);
    expect(noop.redoStack).toHaveLength(1);
    expect(
      redoHistoryCommand(noop).document.entities.find((item) => item.id === entity.id)?.name,
    ).toBe("Changed");
  });

  it("imports an asset instance as one validated revision", () => {
    const document = loadFixture();
    const next = executeDocumentCommand(document, {
      type: "import-asset-instance",
      asset: {
        id: "asset-pump",
        name: "Pump",
        uri: "asset://bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        mediaType: "model/gltf-binary",
        sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        byteLength: 2048,
        stats: {
          nodeCount: 4,
          meshCount: 2,
          materialCount: 2,
          triangleCount: 900,
        },
      },
      entity: {
        id: "pump-01",
        type: "asset",
        parentId: "factory-root",
        name: "Pump 01",
        visible: true,
        locked: false,
        transform: {
          position: [8, 0, 0],
          rotation: [0, 0, 0, 1],
          scale: [1, 1, 1],
        },
        assetId: "asset-pump",
        metadata: {},
      },
      target: {
        id: "pump-01-target",
        entityId: "pump-01",
        name: "Pump 01",
        assetHash: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        nodeIndex: null,
        metadata: {},
      },
    });

    expect(next.revision).toBe(document.revision + 1);
    expect(next.assets.map((asset) => asset.id)).toContain("asset-pump");
    expect(next.entities.map((entity) => entity.id)).toContain("pump-01");
    expect(next.targets.map((target) => target.id)).toContain("pump-01-target");
    expectValidationOk(next);
  });

  it("reuses an explicitly selected identical asset during instance import", () => {
    const document = loadFixture();
    const asset = document.assets[0]!;
    const next = executeDocumentCommand(document, {
      type: "import-asset-instance",
      asset,
      entity: {
        id: "press-02",
        type: "asset",
        parentId: "factory-root",
        name: "Press 02",
        visible: true,
        locked: false,
        transform: {
          position: [8, 0, 0],
          rotation: [0, 0, 0, 1],
          scale: [1, 1, 1],
        },
        assetId: asset.id,
        metadata: {},
      },
      target: {
        id: "press-02-target",
        entityId: "press-02",
        name: "Press 02",
        assetHash: asset.sha256,
        nodeIndex: null,
        metadata: {},
      },
    });

    expect(next.revision).toBe(document.revision + 1);
    expect(next.assets).toEqual(document.assets);
    expect(next.assets).toHaveLength(document.assets.length);
    expect(next.entities.map((entity) => entity.id)).toContain("press-02");
    expect(next.targets.map((target) => target.id)).toContain("press-02-target");
    expectValidationOk(next);
  });

  it("rejects an import when an existing asset ID has different content", () => {
    const document = loadFixture();
    const asset = document.assets[0]!;

    expect(() =>
      executeDocumentCommand(document, {
        type: "import-asset-instance",
        asset: {
          ...asset,
          stats: {
            ...asset.stats!,
            nodeCount: asset.stats!.nodeCount + 1,
          },
        },
        entity: {
          id: "press-02",
          type: "asset",
          parentId: "factory-root",
          name: "Press 02",
          visible: true,
          locked: false,
          transform: {
            position: [8, 0, 0],
            rotation: [0, 0, 0, 1],
            scale: [1, 1, 1],
          },
          assetId: asset.id,
          metadata: {},
        },
        target: {
          id: "press-02-target",
          entityId: "press-02",
          name: "Press 02",
          assetHash: asset.sha256,
          nodeIndex: null,
          metadata: {},
        },
      }),
    ).toThrow(`Asset ID '${asset.id}' conflicts with an existing asset.`);
    expect(document.revision).toBe(loadFixture().revision);
    expect(document.entities.some((entity) => entity.id === "press-02")).toBe(false);
    expect(document.targets.some((target) => target.id === "press-02-target")).toBe(false);
  });

  it("rejects execute in Run mode without touching history or revision", () => {
    const original = loadFixture();
    const history = createDocumentHistory(original);
    const command: DocumentCommand = {
      type: "rename-entity",
      entityId: "press-01",
      name: "should-not-apply",
    };

    expect(() => executeHistoryCommand(history, command, { mode: "run" })).toThrow(
      "Document commands are disabled in Run mode.",
    );
    expect(history.document).toEqual(original);
    expect(history.undoStack).toEqual([]);
    expect(history.redoStack).toEqual([]);
  });
});

function backgroundSettings(document: SceneDocument): { mode: "theme" | "custom"; color: string } {
  const environment = document.environment as SceneDocument["environment"] & {
    readonly backgroundMode?: "theme" | "custom";
  };
  return { mode: environment.backgroundMode ?? "theme", color: environment.background };
}

function backgroundCommand(
  before: { mode: "theme" | "custom"; color: string },
  after: { mode: "theme" | "custom"; color: string },
): DocumentCommand {
  return { type: "set-scene-background", before, after };
}

function loadFixture(): SceneDocument {
  const result = validateSceneDocument(JSON.parse(readFileSync(fixtureUrl, "utf8")) as unknown);
  if (!result.ok)
    throw new Error(`Fixture must be valid: ${result.diagnostics[0]?.code ?? "unknown"}`);
  return result.value;
}

function withNestedAssetTarget(document: SceneDocument): SceneDocument {
  const line: GroupEntity = {
    id: "line-01",
    type: "group",
    parentId: "factory-root",
    name: "Line 01",
    visible: true,
    locked: false,
    transform: {
      position: [0, 0, 0],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
    },
    metadata: {},
  };
  const robot: AssetEntity = {
    id: "robot-01",
    type: "asset",
    parentId: "line-01",
    name: "Robot 01",
    visible: true,
    locked: false,
    transform: {
      position: [1, 0, 0],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
    },
    assetId: "asset-press",
    metadata: {
      area: "welding",
    },
  };
  const target: SceneTarget = {
    id: "robot-01-target",
    entityId: "robot-01",
    name: "Robot 01",
    businessId: "ROBOT-01",
    assetHash: document.assets[0]!.sha256,
    nodeIndex: 2,
    metadata: {
      equipmentType: "robot",
    },
  };
  const binding: Binding = {
    id: "robot-01-status-binding",
    targetId: "robot-01-target",
    sourceId: document.dataSources[0]!.id,
    pointer: "/machines/ROBOT-01/status",
    ruleSetId: document.ruleSets[0]!.id,
    writes: ["color", "alarm"],
    enabled: true,
  };
  const annotation: Annotation = {
    id: "robot-01-annotation",
    targetId: "robot-01-target",
    title: "Robot Note",
    contentKey: "robot-01-note",
    localOffset: [0, 1, 0],
  };

  const next = {
    ...document,
    entities: [...document.entities, line, robot],
    targets: [...document.targets, target],
    bindings: [...document.bindings, binding],
    annotations: [...document.annotations, annotation],
  } satisfies SceneDocument;
  expectValidationOk(next);
  return next;
}

function entityById(document: SceneDocument, entityId: string) {
  const entity = document.entities.find((candidate) => candidate.id === entityId);
  if (entity === undefined) throw new Error(`Missing entity '${entityId}'.`);
  return entity;
}

function targetById(document: SceneDocument, targetId: string) {
  const target = document.targets.find((candidate) => candidate.id === targetId);
  if (target === undefined) throw new Error(`Missing target '${targetId}'.`);
  return target;
}

function expectValidationOk(document: SceneDocument): void {
  const result = validateSceneDocument(document);
  expect(result.ok).toBe(true);
}
