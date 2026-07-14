import { describe, expect, it } from "vitest";

import { validateSceneDocument } from "@web3d/document";

import { createNewStudioProject } from "./new-project";

describe("createNewStudioProject", () => {
  it("creates a valid empty document and separate project metadata", () => {
    const project = createNewStudioProject({
      id: "project-a",
      name: "  Assembly Review  ",
      createdAt: "2026-07-14T10:00:00.000Z",
    });

    expect(project.document).toMatchObject({
      id: "project-a",
      name: "Assembly Review",
      revision: 0,
      assets: [],
      entities: [],
    });
    expect(project.record).toMatchObject({
      id: "project-a",
      name: "Assembly Review",
      lastSavedRevision: 0,
      lastExportedRevision: null,
    });
    expect(Object.hasOwn(project.document, "lastExportedRevision")).toBe(false);
    expect(validateSceneDocument(project.document).ok).toBe(true);
  });

  it("rejects an empty name or invalid timestamp before creating state", () => {
    expect(() =>
      createNewStudioProject({ id: "project-a", name: " ", createdAt: "2026-07-14T10:00:00Z" }),
    ).toThrow("name is required");
    expect(() =>
      createNewStudioProject({ id: "project-a", name: "Project", createdAt: "not-a-date" }),
    ).toThrow("timestamp is invalid");
  });
});
