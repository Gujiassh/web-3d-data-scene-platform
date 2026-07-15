import { describe, expect, it } from "vitest";

import { createNewStudioProject } from "../session/new-project";
import { inspectorAuthoringStateKey } from "./inspector-authoring-state";

describe("inspectorAuthoringStateKey", () => {
  it("is stable across revisions of one project and document", () => {
    const first = document("project-a");

    expect(inspectorAuthoringStateKey("project-a", first.id)).toBe(
      inspectorAuthoringStateKey("project-a", { ...first, revision: first.revision + 1 }.id),
    );
  });

  it("resets drafts for different projects even when their document IDs match", () => {
    expect(inspectorAuthoringStateKey("project-a", "shared-document")).not.toBe(
      inspectorAuthoringStateKey("project-b", "shared-document"),
    );
  });
});

function document(id: string) {
  return createNewStudioProject({
    id,
    name: id,
    createdAt: "2026-07-15T00:00:00.000Z",
  }).document;
}
