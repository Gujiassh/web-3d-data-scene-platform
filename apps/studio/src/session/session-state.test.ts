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
      extend: false,
    });
    state = reduceStudioSession(state, {
      type: "entity-selected",
      entityId: "entity-b",
      extend: true,
    });
    state = reduceStudioSession(state, { type: "tool-changed", tool: "translate" });

    expect(state.selectedEntityIds).toEqual(["entity-a", "entity-b"]);
    expect(state.tool).toBe("translate");
    expect(state.documentRevision).toBe(3);
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
