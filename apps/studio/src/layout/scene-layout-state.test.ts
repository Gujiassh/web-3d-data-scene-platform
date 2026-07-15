import { describe, expect, it } from "vitest";

import {
  createSceneLayoutState,
  currentSceneLayoutState,
  invalidDuplicateOffsetFields,
  parseDuplicateOffset,
  sceneLayoutProjectKey,
  updateTransformSettingsDraft,
} from "./scene-layout-state";

describe("scene layout transient state", () => {
  it("uses project and document identity without revision, locale, or theme", () => {
    expect(sceneLayoutProjectKey("project-a", "document-a")).toBe(
      sceneLayoutProjectKey("project-a", "document-a"),
    );
    expect(sceneLayoutProjectKey("project-b", "document-a")).not.toBe(
      sceneLayoutProjectKey("project-a", "document-a"),
    );
  });

  it("resets drafts across projects but preserves them for the same project identity", () => {
    const firstKey = sceneLayoutProjectKey("project-a", "document-a");
    const edited = {
      ...createSceneLayoutState(firstKey),
      duplicateOffsetDraft: ["4", "5", "6"] as const,
      targetEntityId: "target-a",
    };

    expect(currentSceneLayoutState(edited, firstKey)).toBe(edited);
    expect(
      currentSceneLayoutState(edited, sceneLayoutProjectKey("project-b", "document-a")),
    ).toMatchObject({
      duplicateOffsetDraft: ["1", "0", "0"],
      targetEntityId: null,
    });
  });

  it("clears preview and anchors when selection or mode changes without clearing settings", () => {
    const key = sceneLayoutProjectKey("project-a", "document-a");
    let state = updateTransformSettingsDraft(
      createSceneLayoutState(key, "a", "edit"),
      "translationSnap",
      "0.5",
    );
    state = {
      ...state,
      feedback: {
        ...state.feedback,
        deltaPosition: [2, 0, 0],
        sourceAnchor: { entityId: "a", anchorKind: "center" },
      },
    };

    const nextSelection = currentSceneLayoutState(state, key, "b", "edit");
    expect(nextSelection.transformSettings.translationSnap).toBe(0.5);
    expect(nextSelection.feedback.deltaPosition).toBeNull();
    expect(nextSelection.feedback.sourceAnchor).toBeNull();

    const run = currentSceneLayoutState(nextSelection, key, "b", "run");
    expect(run.feedback.settings.translationSnap).toBeNull();
    expect(run.feedback.targetAnchor).toBeNull();
    const editAgain = currentSceneLayoutState(run, key, "b", "edit");
    expect(editAgain.feedback.deltaPosition).toBeNull();
    expect(editAgain.feedback.sourceAnchor).toBeNull();
    expect(editAgain.transformSettings.translationSnap).toBe(0.5);
  });

  it("clears stale preview on Undo or Redo revision while preserving snap settings", () => {
    const key = sceneLayoutProjectKey("project-a", "document-a");
    let state = updateTransformSettingsDraft(
      createSceneLayoutState(key, "a", "edit", 4),
      "scaleSnap",
      "0.25",
    );
    state = { ...state, feedback: { ...state.feedback, deltaScale: [0.5, 0, 0] } };

    const next = currentSceneLayoutState(state, key, "a", "edit", 5);
    expect(next.transformSettings.scaleSnap).toBe(0.25);
    expect(next.feedback.deltaScale).toBeNull();
  });

  it("keeps the last complete settings object while a draft is invalid", () => {
    let state = createSceneLayoutState("project");
    state = updateTransformSettingsDraft(state, "translationSnap", "0.5");
    expect(state.transformSettings.translationSnap).toBe(0.5);
    expect(state.feedback.settings.translationSnap).toBe(0.5);

    state = updateTransformSettingsDraft(state, "translationSnap", "0");
    expect(state.invalidTransformFields).toEqual(["translationSnap"]);
    expect(state.transformSettings.translationSnap).toBe(0.5);
    expect(state.feedback.settings.translationSnap).toBe(0.5);

    state = updateTransformSettingsDraft(state, "translationSnap", "");
    expect(state.invalidTransformFields).toEqual([]);
    expect(state.transformSettings.translationSnap).toBeNull();
  });

  it("accepts only complete finite duplicate offsets", () => {
    expect(parseDuplicateOffset(["1", "-2.5", "0"])).toEqual([1, -2.5, 0]);
    expect(parseDuplicateOffset(["", "0", "0"])).toBeNull();
    expect(parseDuplicateOffset(["Infinity", "0", "0"])).toBeNull();
    expect(invalidDuplicateOffsetFields(["bad", "0", ""])).toEqual([0, 2]);
  });
});
