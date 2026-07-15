import { describe, expect, it } from "vitest";

import { createStudioSession, reduceStudioSession } from "../session/session-state";
import { viewportSelectionEntityId } from "./useStudioSceneLayout";

describe("useStudioSceneLayout", () => {
  it("treats only viewport selection events as Canvas replace intent", () => {
    expect(
      viewportSelectionEntityId({
        type: "entity-selection-change",
        entityId: "a",
        origin: "viewport",
      }),
    ).toBe("a");
    expect(
      viewportSelectionEntityId({
        type: "entity-selection-change",
        entityId: "a",
        origin: "api",
      }),
    ).toBeUndefined();
  });

  it("keeps tree multi-selection on api notification and replaces only on viewport intent", () => {
    let state = reduceStudioSession(createStudioSession(1), {
      type: "entity-selected",
      entityId: "a",
      operation: "replace",
    });
    state = reduceStudioSession(state, {
      type: "entity-selected",
      entityId: "b",
      operation: "toggle",
    });
    expect(state.selectedEntityIds).toEqual(["a", "b"]);
    expect(state.primaryEntityId).toBe("b");

    const apiEntityId = viewportSelectionEntityId({
      type: "entity-selection-change",
      entityId: "b",
      origin: "api",
    });
    if (typeof apiEntityId === "string") {
      state = reduceStudioSession(state, {
        type: "entity-selected",
        entityId: apiEntityId,
        operation: "replace",
      });
    }
    expect(state.selectedEntityIds).toEqual(["a", "b"]);

    const viewportEntityId = viewportSelectionEntityId({
      type: "entity-selection-change",
      entityId: "b",
      origin: "viewport",
    });
    if (typeof viewportEntityId === "string") {
      state = reduceStudioSession(state, {
        type: "entity-selected",
        entityId: viewportEntityId,
        operation: "replace",
      });
    }
    expect(state.selectedEntityIds).toEqual(["b"]);
    expect(state.primaryEntityId).toBe("b");
  });
});
