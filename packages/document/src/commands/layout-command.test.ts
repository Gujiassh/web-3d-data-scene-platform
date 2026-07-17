import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  parseSceneDocument,
  validateSceneDocument,
  type CreateGroupCommand,
  type DocumentCommand,
  type DuplicateSubtreesCommand,
  type EntityPlacement,
  type SceneDocument,
  type Transform,
} from "../index.js";
import { executeDocumentCommand } from "./document-command.js";
import {
  createDocumentHistory,
  executeHistoryCommand,
  redoHistoryCommand,
  undoHistoryCommand,
} from "./history.js";

const fixtureUrl = new URL(
  "../../../../specs/001-product-foundation/contracts/scene.example.json",
  import.meta.url,
);

describe("layout document commands", () => {
  it("creates empty groups and groups selected entities as atomic history", () => {
    const original = loadFixture();
    const empty = executeDocumentCommand(original, {
      type: "create-group",
      group: group("empty-group", null),
      members: [],
    });
    expect(entity(empty, "empty-group")).toMatchObject({ type: "group", parentId: null });
    expect(empty.revision).toBe(original.revision + 1);
    expectPersistentCollectionsUnchanged(empty, original);

    const press = entity(original, "press-01");
    const command: CreateGroupCommand = {
      type: "create-group",
      group: group("line-group", "factory-root", transform([1, 0, 0])),
      members: [
        {
          entityId: press.id,
          before: placement(press.parentId, press.transform),
          after: placement("line-group", transform([1, 0, -1])),
        },
      ],
    };
    const applied = executeHistoryCommand(createDocumentHistory(original), command);
    expect(applied.document.revision).toBe(original.revision + 1);
    expect(applied.undoStack).toHaveLength(1);
    expect(entity(applied.document, "line-group").parentId).toBe("factory-root");
    expect(entity(applied.document, "press-01")).toMatchObject({
      parentId: "line-group",
      transform: { position: [1, 0, -1] },
    });
    expectPersistentCollectionsUnchanged(applied.document, original);

    const undone = undoHistoryCommand(applied);
    expect(undone.document.entities).toEqual(original.entities);
    expect(undone.document.revision).toBe(original.revision + 2);
    const redone = redoHistoryCommand(undone);
    expect(entity(redone.document, "press-01").parentId).toBe("line-group");
    expect(redone.document.revision).toBe(original.revision + 3);
  });

  it("reparents an unordered hierarchy without using entity array order", () => {
    const original = loadFixture();
    const unordered: SceneDocument = {
      ...original,
      entities: [entity(original, "press-01"), entity(original, "factory-root")],
    };
    expect(validateSceneDocument(unordered).ok).toBe(true);
    const press = entity(unordered, "press-01");
    const next = executeDocumentCommand(unordered, {
      type: "reparent-entities",
      changes: [
        {
          entityId: press.id,
          before: placement("factory-root", press.transform),
          after: placement(null, transform([7, 0, 2])),
        },
      ],
    });

    expect(next.entities.map((candidate) => candidate.id)).toEqual(["press-01", "factory-root"]);
    expect(entity(next, "press-01")).toMatchObject({
      parentId: null,
      transform: { position: [7, 0, 2] },
    });
    expectPersistentCollectionsUnchanged(next, unordered);
  });

  it("rejects invalid create-group parent contracts without changing history", () => {
    const original = loadFixture();
    const root = entity(original, "factory-root");
    const press = entity(original, "press-01");

    expectHistoryRejects(
      original,
      {
        type: "create-group",
        group: group("mixed-group", null),
        members: [
          {
            entityId: root.id,
            before: placement(root.parentId, root.transform),
            after: placement("mixed-group", root.transform),
          },
          {
            entityId: press.id,
            before: placement(press.parentId, press.transform),
            after: placement("mixed-group", press.transform),
          },
        ],
      },
      "same parent",
    );
    expectHistoryRejects(
      original,
      {
        type: "create-group",
        group: group("mismatched-group", null),
        members: [
          {
            entityId: press.id,
            before: placement(press.parentId, press.transform),
            after: placement("mismatched-group", press.transform),
          },
        ],
      },
      "common parent",
    );
    expectHistoryRejects(
      original,
      {
        type: "create-group",
        group: group("asset-child-group", press.id),
        members: [],
      },
      "must be a group",
    );

    const lockedParent = lockEntity(original, root.id);
    expectHistoryRejects(
      lockedParent,
      {
        type: "create-group",
        group: group("locked-parent-group", root.id),
        members: [],
      },
      "must be unlocked",
    );
    expectHistoryRejects(
      original,
      {
        type: "create-group",
        group: { ...group("locked-new-group", root.id), locked: true },
        members: [
          {
            entityId: press.id,
            before: placement(press.parentId, press.transform),
            after: placement("locked-new-group", press.transform),
          },
        ],
      },
      "must be unlocked",
    );
  });

  it("validates reparent source and destination contracts before no-op", () => {
    const original = withSibling(loadFixture());
    const root = entity(original, "factory-root");
    const press = entity(original, "press-01");
    const sibling = entity(original, "press-02");

    expectHistoryRejects(
      original,
      {
        type: "reparent-entities",
        changes: [
          {
            entityId: root.id,
            before: placement(root.parentId, root.transform),
            after: placement(null, root.transform),
          },
          {
            entityId: press.id,
            before: placement(press.parentId, press.transform),
            after: placement(null, press.transform),
          },
        ],
      },
      "before placements",
    );
    expectHistoryRejects(
      original,
      {
        type: "reparent-entities",
        changes: [
          {
            entityId: press.id,
            before: placement(press.parentId, press.transform),
            after: placement(null, press.transform),
          },
          {
            entityId: sibling.id,
            before: placement(sibling.parentId, sibling.transform),
            after: placement(root.id, sibling.transform),
          },
        ],
      },
      "after placements",
    );
    expectHistoryRejects(
      original,
      {
        type: "reparent-entities",
        changes: [
          {
            entityId: press.id,
            before: placement(press.parentId, press.transform),
            after: placement(sibling.id, press.transform),
          },
        ],
      },
      "must be a group",
    );

    const lockedParent = lockEntity(original, root.id);
    const lockedPress = entity(lockedParent, press.id);
    expectHistoryRejects(
      lockedParent,
      {
        type: "reparent-entities",
        changes: [
          {
            entityId: lockedPress.id,
            before: placement(lockedPress.parentId, lockedPress.transform),
            after: placement(lockedPress.parentId, lockedPress.transform),
          },
        ],
      },
      "must be unlocked",
    );

    const history = createDocumentHistory(original);
    const noop = executeHistoryCommand(history, {
      type: "reparent-entities",
      changes: [
        {
          entityId: press.id,
          before: placement(press.parentId, press.transform),
          after: placement(press.parentId, press.transform),
        },
      ],
    });
    expect(noop).toBe(history);
  });

  it("applies explicit multi-entity transforms once with exact Undo and Redo", () => {
    const original = loadFixture();
    const root = entity(original, "factory-root");
    const press = entity(original, "press-01");
    const command = {
      type: "transform-entities",
      changes: [
        { entityId: root.id, before: root.transform, after: transform([3, 0, 0]) },
        { entityId: press.id, before: press.transform, after: transform([5, 0, -1]) },
      ],
    } as const;
    const applied = executeHistoryCommand(createDocumentHistory(original), command);
    const next = applied.document;

    expect(next.revision).toBe(original.revision + 1);
    expect(applied.undoStack).toHaveLength(1);
    expect(applied.redoStack).toHaveLength(0);
    expect(entity(next, root.id).transform.position).toEqual([3, 0, 0]);
    expect(entity(next, press.id).transform.position).toEqual([5, 0, -1]);
    expectPersistentCollectionsUnchanged(next, original);

    const undone = undoHistoryCommand(applied);
    expect({ ...undone.document, revision: original.revision }).toEqual(original);
    expect(undone.undoStack).toHaveLength(0);
    expect(undone.redoStack).toHaveLength(1);
    const redone = redoHistoryCommand(undone);
    expect({ ...redone.document, revision: next.revision }).toEqual(next);
    expect(redone.document.revision).toBe(original.revision + 3);
    expect(redone.undoStack).toHaveLength(1);
    expect(redone.redoStack).toHaveLength(0);

    const history = createDocumentHistory(original);
    expect(
      executeHistoryCommand(history, {
        type: "transform-entities",
        changes: [{ entityId: press.id, before: press.transform, after: press.transform }],
      }),
    ).toBe(history);
    expect(executeHistoryCommand(history, { type: "reparent-entities", changes: [] })).toBe(
      history,
    );
  });

  it("rejects locked, stale, duplicate, and non-finite batch changes atomically", () => {
    const original = loadFixture();
    const root = entity(original, "factory-root");
    const press = entity(original, "press-01");
    const locked: SceneDocument = {
      ...original,
      entities: original.entities.map((candidate) =>
        candidate.id === press.id ? { ...candidate, locked: true } : candidate,
      ),
    };

    expect(() =>
      executeDocumentCommand(locked, {
        type: "transform-entities",
        changes: [
          { entityId: root.id, before: root.transform, after: transform([9, 0, 0]) },
          { entityId: press.id, before: press.transform, after: transform([8, 0, 0]) },
        ],
      }),
    ).toThrow("Locked entity 'press-01'");
    expect(entity(locked, root.id).transform).toEqual(root.transform);
    expect(locked.revision).toBe(original.revision);

    expect(() =>
      executeDocumentCommand(original, {
        type: "reparent-entities",
        changes: [
          {
            entityId: press.id,
            before: placement(null, press.transform),
            after: placement(null, press.transform),
          },
        ],
      }),
    ).toThrow("before snapshot");
    expect(() =>
      executeDocumentCommand(original, {
        type: "transform-entities",
        changes: [
          { entityId: press.id, before: press.transform, after: transform([3, 0, 0]) },
          { entityId: press.id, before: press.transform, after: transform([4, 0, 0]) },
        ],
      }),
    ).toThrow("appears more than once");
    expect(() =>
      executeDocumentCommand(original, {
        type: "transform-entities",
        changes: [
          {
            entityId: press.id,
            before: press.transform,
            after: transform([Number.NaN, 0, 0]),
          },
        ],
      }),
    ).toThrow("position values must be finite");

    expect(() =>
      executeDocumentCommand(original, {
        type: "transform-entities",
        changes: [
          {
            entityId: press.id,
            before: press.transform,
            after: { ...press.transform, rotation: [0, 0, 0, 2] },
          },
        ],
      }),
    ).toThrow("normalized non-zero quaternion");
  });

  it("rejects a stale or invalid second batch item before mutating the first", () => {
    const original = loadFixture();
    const root = entity(original, "factory-root");
    const press = entity(original, "press-01");
    const invalidSecondItems = [
      {
        entityId: press.id,
        before: transform([99, 0, 0]),
        after: transform([8, 0, 0]),
      },
      {
        entityId: press.id,
        before: press.transform,
        after: { ...press.transform, scale: [1, 0, 1] as const },
      },
    ] as const;

    for (const second of invalidSecondItems) {
      const history = createDocumentHistory(original);
      const beforeHistory = structuredClone(history);
      expect(() =>
        executeHistoryCommand(history, {
          type: "transform-entities",
          changes: [
            { entityId: root.id, before: root.transform, after: transform([9, 0, 0]) },
            second,
          ],
        }),
      ).toThrow();
      expect(history).toEqual(beforeHistory);
      expect(history.document).toBe(original);
      expect(entity(history.document, root.id).transform).toEqual(root.transform);
      expect(history.undoStack).toHaveLength(0);
      expect(history.redoStack).toHaveLength(0);
    }
  });

  it("rejects non-positive scale in every layout transform before snapshot and mutation", () => {
    const original = loadFixture();
    const press = entity(original, "press-01");
    const scaleError = "scale values must be finite and greater than zero";

    expectHistoryRejects(
      original,
      {
        type: "transform-entities",
        changes: [
          {
            entityId: press.id,
            before: press.transform,
            after: transformWithScale([0, 1, 1]),
          },
        ],
      },
      scaleError,
    );
    expectHistoryRejects(
      original,
      {
        type: "transform-entities",
        changes: [
          {
            entityId: press.id,
            before: transformWithScale([1, 0, 1]),
            after: press.transform,
          },
        ],
      },
      scaleError,
    );
    expectHistoryRejects(
      original,
      {
        type: "create-group",
        group: group("negative-scale-group", press.parentId),
        members: [
          {
            entityId: press.id,
            before: placement(press.parentId, press.transform),
            after: placement("negative-scale-group", transformWithScale([-1, 1, 1])),
          },
        ],
      },
      scaleError,
    );
    expectHistoryRejects(
      original,
      {
        type: "reparent-entities",
        changes: [
          {
            entityId: press.id,
            before: placement(press.parentId, press.transform),
            after: placement(null, transformWithScale([1, -1, 1])),
          },
        ],
      },
      scaleError,
    );
    expectHistoryRejects(
      original,
      {
        type: "duplicate-subtree",
        rootEntityId: press.id,
        entityIdMap: { [press.id]: "press-02" },
        targetIdMap: { "press-01-target": "press-02-target" },
        rootPlacement: {
          before: placement(press.parentId, press.transform),
          after: placement(press.parentId, transformWithScale([1, 1, -1])),
        },
      },
      scaleError,
    );
  });

  it("rejects missing parents, hierarchy cycles, and conflicting group IDs", () => {
    const original = loadFixture();
    const press = entity(original, "press-01");

    expect(() =>
      executeDocumentCommand(original, {
        type: "reparent-entities",
        changes: [
          {
            entityId: press.id,
            before: placement(press.parentId, press.transform),
            after: placement("missing-parent", press.transform),
          },
        ],
      }),
    ).toThrow("does not exist");
    const nested = withChildGroup(original);
    const root = entity(nested, "factory-root");
    expect(() =>
      executeDocumentCommand(nested, {
        type: "reparent-entities",
        changes: [
          {
            entityId: root.id,
            before: placement(root.parentId, root.transform),
            after: placement("child-group", root.transform),
          },
        ],
      }),
    ).toThrow("cycle");
    expect(() =>
      executeDocumentCommand(original, {
        type: "create-group",
        group: group("press-01-target", null),
        members: [],
      }),
    ).toThrow("already in use");
  });

  it("duplicates a subtree at an explicit offset without copying business semantics", () => {
    const original = lockEntity(loadFixture(), "press-01");
    const press = entity(original, "press-01");
    const next = executeDocumentCommand(original, {
      type: "duplicate-subtree",
      rootEntityId: press.id,
      entityIdMap: { [press.id]: "press-02" },
      targetIdMap: { "press-01-target": "press-02-target" },
      rootPlacement: {
        before: placement(press.parentId, press.transform),
        after: placement("factory-root", transform([6, 0, -1])),
      },
    });

    expect(next.revision).toBe(original.revision + 1);
    expect(entity(next, "press-02")).toMatchObject({
      parentId: "factory-root",
      locked: true,
      transform: { position: [6, 0, -1] },
    });
    const target = next.targets.find((candidate) => candidate.id === "press-02-target");
    expect(target).toMatchObject({ entityId: "press-02", nodeIndex: null });
    expect(target).not.toHaveProperty("businessId");
    expect(next.bindings).toBe(original.bindings);
    expect(next.annotations).toBe(original.annotations);
    expect(next.dataSources).toBe(original.dataSources);
    expect(next.ruleSets).toBe(original.ruleSets);
  });

  it("duplicates multiple locked roots atomically with one revision and history entry", () => {
    const original = lockEntity(
      lockEntity(withSiblingTarget(loadFixture()), "press-01"),
      "press-02",
    );
    const press01 = entity(original, "press-01");
    const press02 = entity(original, "press-02");
    const command: DuplicateSubtreesCommand = {
      type: "duplicate-subtrees",
      items: [
        duplicateItem(press01, "press-03", "press-01-target", "press-03-target", [6, 0, -1]),
        duplicateItem(press02, "press-04", "press-02-target", "press-04-target", [8, 0, -1]),
      ],
    };

    const applied = executeHistoryCommand(createDocumentHistory(original), command);
    expect(applied.document.revision).toBe(original.revision + 1);
    expect(applied.undoStack).toHaveLength(1);
    expect(entity(applied.document, "press-03")).toMatchObject({
      parentId: "factory-root",
      locked: true,
      transform: { position: [6, 0, -1] },
    });
    expect(entity(applied.document, "press-04")).toMatchObject({
      parentId: "factory-root",
      locked: true,
      transform: { position: [8, 0, -1] },
    });
    expect(
      applied.document.targets
        .filter((target) => target.id === "press-03-target" || target.id === "press-04-target")
        .map((target) => target.entityId),
    ).toEqual(["press-03", "press-04"]);
    expect(applied.document.targets.at(-2)).not.toHaveProperty("businessId");
    expect(applied.document.targets.at(-1)).not.toHaveProperty("businessId");
    expect(applied.document.assets).toBe(original.assets);
    expect(applied.document.dataSources).toBe(original.dataSources);
    expect(applied.document.bindings).toBe(original.bindings);
    expect(applied.document.ruleSets).toBe(original.ruleSets);
    expect(applied.document.annotations).toBe(original.annotations);
    expect(applied.document.views).toBe(original.views);
    expect(applied.document.environment).toBe(original.environment);

    const undone = undoHistoryCommand(applied);
    expect(undone.document.entities).toEqual(original.entities);
    expect(undone.document.targets).toEqual(original.targets);
    expect(undone.document.revision).toBe(original.revision + 2);
    const redone = redoHistoryCommand(undone);
    expect(redone.document.revision).toBe(original.revision + 3);
    expect(entity(redone.document, "press-03").locked).toBe(true);
    expect(entity(redone.document, "press-04").locked).toBe(true);
  });

  it("rejects batch duplicate roots from different original parents atomically", () => {
    const original = withDifferentParentTarget(loadFixture());
    const press01 = entity(original, "press-01");
    const press02 = entity(original, "press-02");

    expectHistoryRejects(
      original,
      {
        type: "duplicate-subtrees",
        items: [
          duplicateItem(press01, "press-03", "press-01-target", "press-03-target", [6, 0, -1]),
          duplicateItem(press02, "press-04", "press-02-target", "press-04-target", [8, 0, -1]),
        ],
      },
      "same parent",
    );
    expect(original.entities.some((candidate) => candidate.id === "press-03")).toBe(false);
    expect(original.targets.some((candidate) => candidate.id === "press-03-target")).toBe(false);
  });

  it("rejects cross-item and cross-kind duplicate IDs atomically", () => {
    const original = withSiblingTarget(loadFixture());
    const press01 = entity(original, "press-01");
    const press02 = entity(original, "press-02");
    const first = duplicateItem(
      press01,
      "shared-duplicate",
      "press-01-target",
      "press-03-target",
      [6, 0, -1],
    );

    expectHistoryRejects(
      original,
      {
        type: "duplicate-subtrees",
        items: [
          first,
          duplicateItem(
            press02,
            "shared-duplicate",
            "press-02-target",
            "press-04-target",
            [8, 0, -1],
          ),
        ],
      },
      "already in use",
    );
    expectHistoryRejects(
      original,
      {
        type: "duplicate-subtrees",
        items: [
          duplicateItem(
            press01,
            "press-02-target",
            "press-01-target",
            "press-03-target",
            [6, 0, -1],
          ),
          duplicateItem(press02, "press-04", "press-02-target", "press-04-target", [8, 0, -1]),
        ],
      },
      "already in use",
    );
    expectHistoryRejects(
      original,
      {
        type: "duplicate-subtrees",
        items: [
          { ...first, targetIdMap: { "press-01-target": "cross-kind-id" } },
          duplicateItem(press02, "cross-kind-id", "press-02-target", "press-04-target", [8, 0, -1]),
        ],
      },
      "already in use",
    );
  });

  it("rejects empty, duplicate, and overlapping batch roots before planning copies", () => {
    const original = loadFixture();
    const root = entity(original, "factory-root");
    const press = entity(original, "press-01");
    expectHistoryRejects(original, { type: "duplicate-subtrees", items: [] }, "requires items");
    expectHistoryRejects(
      original,
      {
        type: "duplicate-subtrees",
        items: [
          duplicateItem(press, "press-02", "press-01-target", "press-02-target", [6, 0, 0]),
          duplicateItem(press, "press-03", "press-01-target", "press-03-target", [8, 0, 0]),
        ],
      },
      "appears more than once",
    );
    expectHistoryRejects(
      original,
      {
        type: "duplicate-subtrees",
        items: [
          {
            rootEntityId: root.id,
            entityIdMap: {},
            targetIdMap: {},
            rootPlacement: {
              before: placement(root.parentId, root.transform),
              after: placement(root.parentId, transform([1, 0, 0])),
            },
          },
          duplicateItem(press, "press-02", "press-01-target", "press-02-target", [6, 0, 0]),
        ],
      },
      "overlap",
    );
  });

  it("rejects a stale or incomplete second item without applying the first", () => {
    const original = withSiblingTarget(loadFixture());
    const press01 = entity(original, "press-01");
    const press02 = entity(original, "press-02");
    const first = duplicateItem(
      press01,
      "press-03",
      "press-01-target",
      "press-03-target",
      [6, 0, -1],
    );
    const second = duplicateItem(
      press02,
      "press-04",
      "press-02-target",
      "press-04-target",
      [8, 0, -1],
    );

    expectHistoryRejects(
      original,
      {
        type: "duplicate-subtrees",
        items: [
          first,
          {
            ...second,
            rootPlacement: {
              ...second.rootPlacement,
              before: placement(null, press02.transform),
            },
          },
        ],
      },
      "before snapshot",
    );
    expectHistoryRejects(
      original,
      {
        type: "duplicate-subtrees",
        items: [first, { ...second, targetIdMap: {} }],
      },
      "Missing duplicate target ID",
    );
    expect(original.entities.some((candidate) => candidate.id === "press-03")).toBe(false);
    expect(original.targets.some((candidate) => candidate.id === "press-03-target")).toBe(false);
  });

  it("rejects non-positive scale in the second duplicate item atomically", () => {
    const original = withSiblingTarget(loadFixture());
    const press01 = entity(original, "press-01");
    const press02 = entity(original, "press-02");
    const second = duplicateItem(
      press02,
      "press-04",
      "press-02-target",
      "press-04-target",
      [8, 0, -1],
    );

    expectHistoryRejects(
      original,
      {
        type: "duplicate-subtrees",
        items: [
          duplicateItem(press01, "press-03", "press-01-target", "press-03-target", [6, 0, -1]),
          {
            ...second,
            rootPlacement: {
              ...second.rootPlacement,
              after: placement(press02.parentId, transformWithScale([1, 0, 1])),
            },
          },
        ],
      },
      "scale values must be finite and greater than zero",
    );
    expect(original.entities.some((candidate) => candidate.id === "press-03")).toBe(false);
    expect(original.targets.some((candidate) => candidate.id === "press-03-target")).toBe(false);
  });

  it("rejects stale, invalid, and colliding duplicate placement before creation", () => {
    const original = loadFixture();
    const press = entity(original, "press-01");
    const base = {
      type: "duplicate-subtree" as const,
      rootEntityId: press.id,
      entityIdMap: { [press.id]: "press-02" },
      targetIdMap: { "press-01-target": "press-02-target" },
    };

    expect(() =>
      executeDocumentCommand(original, {
        ...base,
        rootPlacement: {
          before: placement(null, press.transform),
          after: placement("factory-root", transform([6, 0, 0])),
        },
      }),
    ).toThrow("before snapshot");
    expect(() =>
      executeDocumentCommand(original, {
        ...base,
        entityIdMap: { [press.id]: "factory-root" },
      }),
    ).toThrow("already in use");
    expect(() =>
      executeDocumentCommand(original, {
        ...base,
        rootPlacement: {
          before: placement(press.parentId, press.transform),
          after: placement("factory-root", transform([Number.POSITIVE_INFINITY, 0, 0])),
        },
      }),
    ).toThrow("position values must be finite");
    expectHistoryRejects(
      original,
      {
        ...base,
        rootPlacement: {
          before: placement(press.parentId, press.transform),
          after: placement(null, transform([6, 0, 0])),
        },
      },
      "must not change parent",
    );
    expect(original.entities.some((candidate) => candidate.id === "press-02")).toBe(false);
  });
});

function loadFixture(): SceneDocument {
  const result = parseSceneDocument(readFileSync(fixtureUrl, "utf8"));
  if (!result.ok) throw new Error(result.diagnostics[0]?.message ?? "Fixture is invalid.");
  return result.value;
}

function group(
  id: string,
  parentId: string | null,
  value = transform(),
): CreateGroupCommand["group"] {
  return {
    id,
    type: "group",
    parentId,
    name: id,
    visible: true,
    locked: false,
    transform: value,
    metadata: {},
  };
}

function entity(document: SceneDocument, entityId: string) {
  const value = document.entities.find((candidate) => candidate.id === entityId);
  if (value === undefined) throw new Error(`Entity '${entityId}' is missing.`);
  return value;
}

function placement(parentId: string | null, value: Transform): EntityPlacement {
  return { parentId, transform: value };
}

function transform(position: Transform["position"] = [0, 0, 0]): Transform {
  return { position, rotation: [0, 0, 0, 1], scale: [1, 1, 1] };
}

function transformWithScale(scale: Transform["scale"]): Transform {
  return { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale };
}

function duplicateItem(
  source: SceneDocument["entities"][number],
  duplicateEntityId: string,
  sourceTargetId: string,
  duplicateTargetId: string,
  position: Transform["position"],
): DuplicateSubtreesCommand["items"][number] {
  return {
    rootEntityId: source.id,
    entityIdMap: { [source.id]: duplicateEntityId },
    targetIdMap: { [sourceTargetId]: duplicateTargetId },
    rootPlacement: {
      before: placement(source.parentId, source.transform),
      after: placement(source.parentId, transform(position)),
    },
  };
}

function expectPersistentCollectionsUnchanged(next: SceneDocument, original: SceneDocument): void {
  expect(next.assets).toBe(original.assets);
  expect(next.targets).toBe(original.targets);
  expect(next.dataSources).toBe(original.dataSources);
  expect(next.bindings).toBe(original.bindings);
  expect(next.ruleSets).toBe(original.ruleSets);
  expect(next.annotations).toBe(original.annotations);
  expect(next.views).toBe(original.views);
  expect(next.environment).toBe(original.environment);
}

function lockEntity(document: SceneDocument, entityId: string): SceneDocument {
  return {
    ...document,
    entities: document.entities.map((candidate) =>
      candidate.id === entityId ? { ...candidate, locked: true } : candidate,
    ),
  };
}

function withSibling(document: SceneDocument): SceneDocument {
  const press = entity(document, "press-01");
  if (press.type !== "asset") throw new Error("Fixture press must be an asset entity.");
  return {
    ...document,
    entities: [
      ...document.entities,
      {
        ...press,
        id: "press-02",
        name: "Press 02",
        transform: transform([4, 0, -1]),
      },
    ],
  };
}

function withSiblingTarget(document: SceneDocument): SceneDocument {
  const withEntity = withSibling(document);
  const sourceTarget = document.targets.find((target) => target.id === "press-01-target");
  if (sourceTarget === undefined) throw new Error("Fixture target is missing.");
  return {
    ...withEntity,
    targets: [
      ...document.targets,
      {
        ...sourceTarget,
        id: "press-02-target",
        entityId: "press-02",
        name: "Press 02",
        businessId: "MACHINE-PRESS-02",
      },
    ],
  };
}

function withDifferentParentTarget(document: SceneDocument): SceneDocument {
  const withTarget = withSiblingTarget(document);
  return {
    ...withTarget,
    entities: withTarget.entities.map((candidate) =>
      candidate.id === "press-02" ? { ...candidate, parentId: null } : candidate,
    ),
  };
}

function withChildGroup(document: SceneDocument): SceneDocument {
  return {
    ...document,
    entities: [...document.entities, group("child-group", "factory-root")],
  };
}

function expectHistoryRejects(
  document: SceneDocument,
  command: DocumentCommand,
  message: string,
): void {
  const history = createDocumentHistory(document);
  expect(() => executeHistoryCommand(history, command)).toThrow(message);
  expect(history.document).toEqual(document);
  expect(history.document.revision).toBe(document.revision);
  expect(history.undoStack).toEqual([]);
  expect(history.redoStack).toEqual([]);
}
