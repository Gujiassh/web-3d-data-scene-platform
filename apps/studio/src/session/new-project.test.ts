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
      schemaVersion: "1.4.0",
      id: "project-a",
      name: "Assembly Review",
      revision: 0,
      assets: [],
      entities: [],
      environment: {
        backgroundMode: "theme",
        background: "#F4F6F5",
        lighting: {
          fill: {
            skyColor: "#FFFFFF",
            groundColor: "#65706A",
            intensity: 1.8,
          },
          key: {
            color: "#FFFFFF",
            intensity: 2.2,
            directionToLight: [0.37904902178945177, 0.7580980435789035, 0.5306686305052324],
          },
        },
      },
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
