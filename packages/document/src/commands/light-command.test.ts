import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  createDocumentHistory,
  executeHistoryCommand,
  parseSceneDocument,
  redoHistoryCommand,
  undoHistoryCommand,
  validateSceneDocument,
  type DocumentCommand,
  type DocumentHistoryState,
  type LightEntity,
  type SceneDocument,
  type Transform,
  type UpdateLightEntityCommand,
} from "../index.js";

const fixtureUrl = new URL(
  "../../../../specs/001-product-foundation/contracts/scene.example.json",
  import.meta.url,
);

describe("light entity document commands", () => {
  it("adds one complete canonical light and projects Duplicate as one unlocked add", () => {
    const original = loadFixture();
    const after = pointLight("point-01");
    const applied = executeHistoryCommand(createDocumentHistory(original), {
      type: "add-light-entity",
      after,
    });

    expect(applied.document.revision).toBe(original.revision + 1);
    expect(applied.undoStack).toHaveLength(1);
    expect(lightById(applied.document, after.id)).toEqual(after);
    expect(lightById(applied.document, after.id)).not.toBe(after);
    expect(lightById(applied.document, after.id).transform).not.toBe(after.transform);
    expect(lightById(applied.document, after.id).light).not.toBe(after.light);

    const lockedSource = pointLight("point-source", {
      locked: true,
      position: [2, 3, 4],
    });
    const withSource = withLights(original, lockedSource);
    const duplicate: LightEntity = {
      ...lockedSource,
      id: "point-copy",
      name: "Point light 2",
      locked: false,
      transform: {
        ...lockedSource.transform,
        position: [3, 3, 4],
      },
    };
    const duplicated = executeHistoryCommand(createDocumentHistory(withSource), {
      type: "add-light-entity",
      after: duplicate,
    });
    expect(lightById(duplicated.document, lockedSource.id)).toEqual(lockedSource);
    expect(lightById(duplicated.document, duplicate.id)).toEqual(duplicate);
    expect(lightById(duplicated.document, duplicate.id).locked).toBe(false);
    expect(duplicated.document.revision).toBe(withSource.revision + 1);
    expect(duplicated.undoStack).toHaveLength(1);
  });

  it("updates exact complete snapshots with one Undo/Redo history entry", () => {
    const before = spotLight("spot-01");
    const original = withLights(loadFixture(), before);
    const after: LightEntity = {
      ...before,
      name: "Inspection spot",
      visible: false,
      light: { ...before.light, intensity: 18, penumbra: 0.5 },
      transform: {
        ...before.transform,
        position: [4, 5, 6],
        rotation: [0, Math.SQRT1_2, 0, Math.SQRT1_2],
      },
    };
    const command: UpdateLightEntityCommand = { type: "update-light-entity", before, after };
    const applied = executeHistoryCommand(createDocumentHistory(original), command);

    expect(lightById(applied.document, before.id)).toEqual(after);
    expect(applied.document.revision).toBe(original.revision + 1);
    expect(applied.undoStack).toHaveLength(1);

    const undone = undoHistoryCommand(applied);
    expect(lightById(undone.document, before.id)).toEqual(before);
    expect(undone.redoStack).toHaveLength(1);

    const redone = redoHistoryCommand(undone);
    expect(lightById(redone.document, before.id)).toEqual(after);
    expect(redone.document.revision).toBe(original.revision + 3);
    expect(redone.redoStack).toHaveLength(0);
  });

  it("treats an exact update no-op as history-free without clearing redo", () => {
    const before = pointLight("point-01");
    const original = withLights(loadFixture(), before);
    const changed = executeHistoryCommand(createDocumentHistory(original), {
      type: "update-light-entity",
      before,
      after: { ...before, name: "Changed" },
    });
    const undone = undoHistoryCommand(changed);
    const current = lightById(undone.document, before.id);

    const result = executeHistoryCommand(undone, {
      type: "update-light-entity",
      before: current,
      after: structuredClone(current),
    });

    expect(result).toBe(undone);
    expect(result.redoStack).toHaveLength(1);
  });

  it("allows only visibility changes and unlocking from a locked before snapshot", () => {
    const locked = pointLight("point-01", { locked: true });

    const visibility = executeHistoryCommand(
      createDocumentHistory(withLights(loadFixture(), locked)),
      {
        type: "update-light-entity",
        before: locked,
        after: { ...locked, visible: false },
      },
    );
    expect(lightById(visibility.document, locked.id)).toMatchObject({
      visible: false,
      locked: true,
    });

    const unlocked = executeHistoryCommand(
      createDocumentHistory(withLights(loadFixture(), locked)),
      {
        type: "update-light-entity",
        before: locked,
        after: { ...locked, visible: false, locked: false },
      },
    );
    expect(lightById(unlocked.document, locked.id)).toMatchObject({
      visible: false,
      locked: false,
    });

    const forbiddenAfter: readonly LightEntity[] = [
      { ...locked, name: "Renamed" },
      { ...locked, light: { ...locked.light, intensity: 26 } },
      {
        ...locked,
        transform: { ...locked.transform, position: [1, 2, 3] },
      },
      { ...locked, locked: false, name: "Unlock and rename" },
    ];
    for (const after of forbiddenAfter) {
      const history = createDocumentHistory(withLights(loadFixture(), locked));
      const beforeHistory = structuredClone(history);
      expect(() =>
        executeHistoryCommand(history, { type: "update-light-entity", before: locked, after }),
      ).toThrow(/locked/i);
      expect(history).toEqual(beforeHistory);
      expect(lightById(history.document, locked.id)).toEqual(locked);
    }
  });

  it("removes an exact unlocked snapshot and restores it through Undo/Redo", () => {
    const light = pointLight("point-01");
    const original = withLights(loadFixture(), light);
    const applied = executeHistoryCommand(createDocumentHistory(original), {
      type: "remove-light-entity",
      before: light,
    });

    expect(applied.document.entities.some((entity) => entity.id === light.id)).toBe(false);
    expect(applied.document.revision).toBe(original.revision + 1);
    expect(applied.undoStack).toHaveLength(1);

    const undone = undoHistoryCommand(applied);
    expect(lightById(undone.document, light.id)).toEqual(light);
    const redone = redoHistoryCommand(undone);
    expect(redone.document.entities.some((entity) => entity.id === light.id)).toBe(false);
    expect(redone.document.revision).toBe(original.revision + 3);
  });

  it("rejects stale, invalid, locked removal, duplicate IDs, and a ninth light atomically", () => {
    const point = pointLight("point-01");
    const original = withLights(loadFixture(), point);
    const invalid = { ...point, light: { ...point.light, intensity: 1001 } };
    const cases: readonly DocumentCommand[] = [
      {
        type: "update-light-entity",
        before: { ...point, name: "stale" },
        after: { ...point, name: "next" },
      },
      { type: "update-light-entity", before: point, after: invalid },
      { type: "remove-light-entity", before: { ...point, name: "stale" } },
      { type: "add-light-entity", after: point },
    ];

    for (const command of cases) expectRejectedWithoutHistoryMutation(original, command);

    const locked = pointLight("locked-point", { locked: true });
    expectRejectedWithoutHistoryMutation(withLights(loadFixture(), locked), {
      type: "remove-light-entity",
      before: locked,
    });

    const eight = withLights(
      loadFixture(),
      ...Array.from({ length: 8 }, (_, index) => pointLight(`point-${index + 1}`)),
    );
    expectRejectedWithoutHistoryMutation(eight, {
      type: "add-light-entity",
      after: pointLight("point-09"),
    });
  });
});

describe("generic command light rejection", () => {
  it("rejects every generic light mutation route atomically without clearing redo", () => {
    const point = pointLight("point-01");
    const document = withLights(loadFixture(), point);
    const moved = transform([2, 3, 4]);
    const commands: readonly DocumentCommand[] = [
      { type: "rename-entity", entityId: point.id, name: "Generic rename" },
      { type: "set-entity-visibility", entityId: point.id, visible: false },
      { type: "set-entity-lock", entityId: point.id, locked: true },
      { type: "transform-entity", entityId: point.id, before: point.transform, after: moved },
      {
        type: "transform-entities",
        changes: [{ entityId: point.id, before: point.transform, after: moved }],
      },
      { type: "delete-subtree", rootEntityId: point.id },
      {
        type: "duplicate-subtree",
        rootEntityId: point.id,
        entityIdMap: { [point.id]: "point-02" },
        targetIdMap: {},
        rootPlacement: {
          before: { parentId: null, transform: point.transform },
          after: { parentId: null, transform: moved },
        },
      },
      {
        type: "duplicate-subtrees",
        items: [
          {
            rootEntityId: point.id,
            entityIdMap: { [point.id]: "point-02" },
            targetIdMap: {},
            rootPlacement: {
              before: { parentId: null, transform: point.transform },
              after: { parentId: null, transform: moved },
            },
          },
        ],
      },
      {
        type: "create-group",
        group: groupEntity("light-group"),
        members: [
          {
            entityId: point.id,
            before: { parentId: null, transform: point.transform },
            after: { parentId: "light-group", transform: point.transform },
          },
        ],
      },
      {
        type: "reparent-entities",
        changes: [
          {
            entityId: point.id,
            before: { parentId: null, transform: point.transform },
            after: { parentId: null, transform: moved },
          },
        ],
      },
    ];

    for (const command of commands) {
      const history = historyWithRedo(document);
      const before = structuredClone(history);
      expect(() => executeHistoryCommand(history, command)).toThrow(/light/i);
      expect(history).toEqual(before);
      expect(history.redoStack).toHaveLength(1);
    }
  });

  it("rejects a light as a create-group or reparent destination", () => {
    const point = pointLight("point-01");
    const document = withLights(loadFixture(), point);
    const asset = document.entities.find((entity) => entity.type === "asset")!;
    const destinationCommands: readonly DocumentCommand[] = [
      {
        type: "create-group",
        group: { ...groupEntity("nested-group"), parentId: point.id },
        members: [],
      },
      {
        type: "reparent-entities",
        changes: [
          {
            entityId: asset.id,
            before: { parentId: asset.parentId, transform: asset.transform },
            after: { parentId: point.id, transform: asset.transform },
          },
        ],
      },
    ];

    for (const command of destinationCommands) {
      const history = historyWithRedo(document);
      const before = structuredClone(history);
      expect(() => executeHistoryCommand(history, command)).toThrow(/light/i);
      expect(history).toEqual(before);
    }
  });
});

function loadFixture(): SceneDocument {
  const result = parseSceneDocument(readFileSync(fixtureUrl, "utf8"));
  if (!result.ok) throw new Error(`Fixture migration failed: ${result.diagnostics[0]?.code}`);
  return result.value;
}

function withLights(document: SceneDocument, ...lights: readonly LightEntity[]): SceneDocument {
  const next = { ...document, entities: [...document.entities, ...lights] };
  const result = validateSceneDocument(next);
  if (!result.ok) throw new Error(`Light fixture failed: ${result.diagnostics[0]?.code}`);
  return result.value;
}

function pointLight(
  id: string,
  options: { readonly locked?: boolean; readonly position?: Transform["position"] } = {},
): LightEntity {
  return {
    id,
    type: "light",
    parentId: null,
    name: `Point ${id}`,
    visible: true,
    locked: options.locked ?? false,
    transform: transform(options.position ?? [0, 2, 0]),
    metadata: {},
    light: { kind: "point", color: "#FFFFFF", intensity: 25, range: null },
  };
}

function spotLight(id: string): LightEntity & { readonly light: { readonly kind: "spot" } } {
  return {
    ...pointLight(id),
    name: `Spot ${id}`,
    light: {
      kind: "spot",
      color: "#FFFFFF",
      intensity: 10,
      range: null,
      angleRadians: Math.PI / 4,
      penumbra: 1 / 3,
    },
  };
}

function transform(position: Transform["position"]): Transform {
  return { position, rotation: [0, 0, 0, 1], scale: [1, 1, 1] };
}

function groupEntity(id: string): SceneDocument["entities"][number] & { readonly type: "group" } {
  return {
    id,
    type: "group",
    parentId: null,
    name: id,
    visible: true,
    locked: false,
    transform: transform([0, 0, 0]),
    metadata: {},
  };
}

function lightById(document: SceneDocument, id: string): LightEntity {
  const entity = document.entities.find((candidate) => candidate.id === id);
  if (entity?.type !== "light") throw new Error(`Missing light '${id}'.`);
  return entity;
}

function expectRejectedWithoutHistoryMutation(
  document: SceneDocument,
  command: DocumentCommand,
): void {
  const history = createDocumentHistory(document);
  const before = structuredClone(history);
  expect(() => executeHistoryCommand(history, command)).toThrow();
  expect(history).toEqual(before);
}

function historyWithRedo(document: SceneDocument): DocumentHistoryState {
  const changed = executeHistoryCommand(createDocumentHistory(document), {
    type: "rename-document",
    name: `${document.name} changed`,
  });
  const undone = undoHistoryCommand(changed);
  expect(undone.redoStack).toHaveLength(1);
  return undone;
}
