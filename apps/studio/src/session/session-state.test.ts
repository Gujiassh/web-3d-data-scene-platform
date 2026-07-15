import { describe, expect, it } from "vitest";

import {
  assertCanEdit,
  createStudioSession,
  isDirty,
  isExportOutdated,
  reduceStudioSession,
} from "./session-state";

describe("StudioSessionState", () => {
  it("keeps selection and authoring tools in session state", () => {
    let state = createStudioSession(3);
    state = reduceStudioSession(state, {
      type: "entity-selected",
      entityId: "entity-a",
      operation: "replace",
    });
    state = reduceStudioSession(state, {
      type: "entity-selected",
      entityId: "entity-b",
      operation: "toggle",
    });
    state = reduceStudioSession(state, { type: "tool-changed", tool: "translate" });

    expect(state.selectedEntityIds).toEqual(["entity-a", "entity-b"]);
    expect(state.primaryEntityId).toBe("entity-b");
    expect(state.selectionAnchorId).toBe("entity-a");
    expect(state.tool).toBe("translate");
    expect(state.documentRevision).toBe(3);
  });

  it("sorts selected IDs while keeping the latest explicit addition primary", () => {
    let state = createStudioSession(1);
    state = reduceStudioSession(state, {
      type: "entity-selected",
      entityId: "entity-z",
      operation: "replace",
    });
    state = reduceStudioSession(state, {
      type: "entity-selected",
      entityId: "entity-a",
      operation: "toggle",
    });
    state = reduceStudioSession(state, {
      type: "entity-selected",
      entityId: "entity-m",
      operation: "toggle",
    });

    expect(state.selectedEntityIds).toEqual(["entity-a", "entity-m", "entity-z"]);
    expect(state.primaryEntityId).toBe("entity-m");
    expect(state.selectionAnchorId).toBe("entity-z");
  });

  it("uses a stable ID when toggling the primary out of a multi-selection", () => {
    let state = createStudioSession(1);
    for (const [entityId, operation] of [
      ["entity-z", "replace"],
      ["entity-a", "toggle"],
      ["entity-m", "toggle"],
      ["entity-m", "toggle"],
    ] as const) {
      state = reduceStudioSession(state, { type: "entity-selected", entityId, operation });
    }

    expect(state.selectedEntityIds).toEqual(["entity-a", "entity-z"]);
    expect(state.primaryEntityId).toBe("entity-a");
    expect(state.selectionAnchorId).toBe("entity-z");
  });

  it("falls back through explicit selection recency when removing the primary", () => {
    let state = createStudioSession(1);
    for (const [entityId, operation] of [
      ["entity-a", "replace"],
      ["entity-b", "toggle"],
      ["entity-c", "toggle"],
      ["entity-c", "toggle"],
    ] as const) {
      state = reduceStudioSession(state, { type: "entity-selected", entityId, operation });
    }
    expect(state.primaryEntityId).toBe("entity-b");
    expect(state.selectionRecency).toEqual(["entity-a", "entity-b"]);

    state = reduceStudioSession(state, {
      type: "entity-selected",
      entityId: "entity-b",
      operation: "toggle",
    });
    expect(state.primaryEntityId).toBe("entity-a");
    expect(state.selectionRecency).toEqual(["entity-a"]);
  });

  it("reconciles disappeared entities by recency and resets recency with a new session", () => {
    let state = reduceStudioSession(createStudioSession(1), {
      type: "selection-replaced",
      entityIds: ["entity-a", "entity-b", "entity-c"],
      primaryEntityId: "entity-c",
    });
    state = reduceStudioSession(state, {
      type: "selection-reconciled",
      availableEntityIds: ["entity-a", "entity-b"],
    });
    expect(state.primaryEntityId).toBe("entity-b");
    expect(state.selectionRecency).toEqual(["entity-a", "entity-b"]);
    expect(createStudioSession(1).selectionRecency).toEqual([]);
  });

  it("allows selection changes in Run and clears all selection identities together", () => {
    let state = reduceStudioSession(createStudioSession(1), {
      type: "mode-changed",
      mode: "run",
    });
    state = reduceStudioSession(state, {
      type: "entity-selected",
      entityId: "entity-run",
      operation: "replace",
    });

    expect(state.selectedEntityIds).toEqual(["entity-run"]);
    expect(state.primaryEntityId).toBe("entity-run");
    state = reduceStudioSession(state, { type: "selection-cleared" });
    expect(state.selectedEntityIds).toEqual([]);
    expect(state.primaryEntityId).toBeNull();
    expect(state.selectionAnchorId).toBeNull();
  });

  it("replaces a multi-selection atomically with a stable explicit primary", () => {
    const state = reduceStudioSession(createStudioSession(1), {
      type: "selection-replaced",
      entityIds: ["entity-z", "entity-a", "entity-z"],
      primaryEntityId: "entity-z",
    });

    expect(state.selectedEntityIds).toEqual(["entity-a", "entity-z"]);
    expect(state.primaryEntityId).toBe("entity-z");
    expect(state.selectionAnchorId).toBe("entity-z");
  });

  it("emits a new stable selected-ID set when membership changes under the same primary", () => {
    let state = reduceStudioSession(createStudioSession(1), {
      type: "selection-replaced",
      entityIds: ["entity-a", "entity-b"],
      primaryEntityId: "entity-b",
    });
    const previousIds = state.selectedEntityIds;
    state = reduceStudioSession(state, {
      type: "entity-selected",
      entityId: "entity-a",
      operation: "toggle",
    });

    expect(state.primaryEntityId).toBe("entity-b");
    expect(state.selectedEntityIds).toEqual(["entity-b"]);
    expect(state.selectedEntityIds).not.toBe(previousIds);
  });

  it("prevents authoring commands and tools in Run mode", () => {
    let state = createStudioSession(1);
    state = reduceStudioSession(state, { type: "tool-changed", tool: "rotate" });
    state = reduceStudioSession(state, { type: "mode-changed", mode: "run" });
    const unchanged = reduceStudioSession(state, { type: "tool-changed", tool: "scale" });

    expect(state.tool).toBe("select");
    expect(unchanged).toBe(state);
    expect(() => assertCanEdit(state)).toThrow("disabled in Run mode");
  });

  it("tracks local save and export revisions independently", () => {
    let state = createStudioSession(4, 4);
    expect(isDirty(state)).toBe(false);
    expect(isExportOutdated(state)).toBe(false);

    state = reduceStudioSession(state, { type: "document-changed", revision: 5 });
    expect(isDirty(state)).toBe(true);
    expect(isExportOutdated(state)).toBe(true);

    state = reduceStudioSession(state, { type: "save-started", revision: 5 });
    state = reduceStudioSession(state, { type: "save-succeeded", revision: 5 });
    expect(isDirty(state)).toBe(false);
    expect(isExportOutdated(state)).toBe(true);

    state = reduceStudioSession(state, { type: "export-succeeded", revision: 5 });
    expect(isExportOutdated(state)).toBe(false);
  });

  it("keeps a failed save dirty and rejects stale document revisions", () => {
    let state = createStudioSession(8);
    state = reduceStudioSession(state, { type: "document-changed", revision: 9 });
    state = reduceStudioSession(state, {
      type: "save-failed",
      revision: 9,
      message: "quota exceeded",
    });

    expect(isDirty(state)).toBe(true);
    expect(state.save).toEqual({ status: "failed", revision: 9, message: "quota exceeded" });
    expect(() => reduceStudioSession(state, { type: "document-changed", revision: 9 })).toThrow(
      "must increase",
    );
  });
});
