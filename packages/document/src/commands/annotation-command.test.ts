import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  createDocumentHistory,
  executeDocumentCommand,
  executeHistoryCommand,
  parseSceneDocument,
  redoHistoryCommand,
  serializeSceneDocument,
  undoHistoryCommand,
  type Annotation,
  type DocumentCommand,
  type DocumentHistoryState,
  type SceneDocument,
} from "../index.js";

const fixtureUrl = new URL(
  "../../../../specs/001-product-foundation/contracts/scene.example.json",
  import.meta.url,
);

describe("Annotation snapshot commands", () => {
  it("adds, updates, removes, undoes and redoes complete snapshots with monotonic revisions", () => {
    const original = loadFixture();
    const added = surfaceAnnotation("annotation-01");
    let history = executeHistoryCommand(createDocumentHistory(original), {
      type: "add-annotation",
      after: added,
    });
    expect(history.document.annotations).toEqual([added]);
    expect(history.document.annotations[0]).not.toBe(added);

    const updated = { ...added, title: "Updated", action: { type: "focus-hotspot" } } as const;
    history = executeHistoryCommand(history, {
      type: "update-annotation",
      before: added,
      after: updated,
    });
    expect(history.document.annotations).toEqual([updated]);

    history = executeHistoryCommand(history, { type: "remove-annotation", before: updated });
    expect(history.document.annotations).toEqual([]);
    expect(history.document.revision).toBe(original.revision + 3);
    expect(history.undoStack).toHaveLength(3);

    history = undoHistoryCommand(undoHistoryCommand(undoHistoryCommand(history)));
    expect(history.document.annotations).toEqual([]);
    expect(history.document.revision).toBe(original.revision + 6);

    history = redoHistoryCommand(redoHistoryCommand(redoHistoryCommand(history)));
    expect(history.document.annotations).toEqual([]);
    expect(history.document.revision).toBe(original.revision + 9);
  });

  it("rejects stale, ID-changing, duplicate, invalid and no-op snapshots atomically", () => {
    const annotation = surfaceAnnotation("annotation-01");
    const document = withAnnotations(loadFixture(), annotation);
    const changed = { ...annotation, title: "Changed" };
    const stale = { ...annotation, title: "Stale" };
    const commands: readonly DocumentCommand[] = [
      { type: "add-annotation", after: { ...annotation } },
      { type: "update-annotation", before: stale, after: changed },
      {
        type: "update-annotation",
        before: annotation,
        after: { ...changed, id: "annotation-02" },
      },
      { type: "update-annotation", before: annotation, after: annotation },
      { type: "remove-annotation", before: stale },
      {
        type: "update-annotation",
        before: annotation,
        after: {
          ...annotation,
          anchor: { ...annotation.anchor, entityId: "missing-entity" },
        } as Annotation,
      },
    ];

    for (const command of commands) {
      expectHistoryRejectsWithRedo(document, command);
    }
  });

  it("allows only visibility and unlock changes from a locked annotation", () => {
    const locked = { ...surfaceAnnotation("annotation-locked"), locked: true };
    const document = withAnnotations(loadFixture(), locked);

    const hidden = executeDocumentCommand(document, {
      type: "update-annotation",
      before: locked,
      after: { ...locked, visible: false },
    });
    const hiddenAnnotation = hidden.annotations[0]!;
    const unlocked = executeDocumentCommand(hidden, {
      type: "update-annotation",
      before: hiddenAnnotation,
      after: { ...hiddenAnnotation, locked: false },
    });
    expect(unlocked.annotations[0]).toMatchObject({ visible: false, locked: false });

    expectRejectedUnchanged(document, {
      type: "update-annotation",
      before: locked,
      after: { ...locked, title: "Forbidden" },
    });
    expectRejectedUnchanged(document, { type: "remove-annotation", before: locked });
  });

  it("rejects whitespace-only authored titles while retaining migrated whitespace on unrelated updates", () => {
    const original = loadFixture();
    expectRejectedUnchanged(original, {
      type: "add-annotation",
      after: { ...surfaceAnnotation("annotation-space"), title: "  \t" },
    });

    const whitespace = { ...surfaceAnnotation("annotation-space"), title: "  \t" };
    const legacyDocument = withAnnotations(original, whitespace);
    const next = executeDocumentCommand(legacyDocument, {
      type: "update-annotation",
      before: whitespace,
      after: { ...whitespace, visible: false },
    });
    expect(next.annotations[0]?.title).toBe("  \t");

    expectRejectedUnchanged(legacyDocument, {
      type: "update-annotation",
      before: whitespace,
      after: { ...whitespace, title: " \n " },
    });
  });
});

function surfaceAnnotation(id: string): Annotation {
  return {
    id,
    title: "Inspection",
    visible: true,
    locked: false,
    anchor: {
      kind: "surface",
      entityId: "press-01",
      assetHash: "a".repeat(64),
      nodeIndex: 2,
      nodeLocalPosition: [1, 2, 3],
      nodeLocalNormal: [0, 1, 0],
    },
    content: { kind: "plain-text", text: "Check pressure." },
    action: { type: "show-content" },
  };
}

function loadFixture(): SceneDocument {
  const result = parseSceneDocument(readFileSync(fixtureUrl, "utf8"));
  if (!result.ok) throw new Error(`Fixture is invalid: ${result.diagnostics[0]?.code}`);
  return result.value;
}

function withAnnotations(document: SceneDocument, ...annotations: Annotation[]): SceneDocument {
  return { ...document, annotations };
}

function expectRejectedUnchanged(document: SceneDocument, command: DocumentCommand): void {
  const before = serializeSceneDocument(document);
  expect(() => executeDocumentCommand(document, command)).toThrow();
  expect(serializeSceneDocument(document)).toBe(before);
}

function expectHistoryRejectsWithRedo(document: SceneDocument, command: DocumentCommand): void {
  const history = historyWithRedo(document);
  const before = structuredClone(history);
  expect(() => executeHistoryCommand(history, command)).toThrow();
  expect(history).toEqual(before);
  expect(serializeSceneDocument(history.document)).toBe(serializeSceneDocument(before.document));
}

function historyWithRedo(document: SceneDocument): DocumentHistoryState {
  const renamed = executeHistoryCommand(createDocumentHistory(document), {
    type: "rename-document",
    name: `${document.name} changed`,
  });
  return undoHistoryCommand(renamed);
}
