import { describe, expect, it } from "vitest";

import { createNewStudioProject } from "../session/new-project";
import {
  synchronizeRecentProjectName,
  withProjectDocument,
  withSavedProjectRecord,
} from "./project-name";

describe("project name synchronization", () => {
  it("mirrors a history document name into the active project record", () => {
    const project = fixtureProject("Assembly Review", 1);
    const next = withProjectDocument(project, {
      ...project.document,
      name: "Line A Commissioning",
      revision: 2,
    });

    expect(next.document.name).toBe("Line A Commissioning");
    expect(next.record.name).toBe("Line A Commissioning");
  });

  it("keeps a newer in-memory document name when an older save completes", () => {
    const project = fixtureProject("Latest name", 2);
    const next = withSavedProjectRecord(project, {
      ...project.record,
      name: "Earlier name",
      lastSavedRevision: 1,
    });

    expect(next.document.name).toBe("Latest name");
    expect(next.record.name).toBe("Latest name");
    expect(next.record.lastSavedRevision).toBe(1);
  });

  it("updates only the active recent-project name", () => {
    const active = fixtureProject("Old active name", 1).record;
    const other = { ...fixtureProject("Other scene", 4).record, id: "other-project" };

    expect(synchronizeRecentProjectName([active, other], active.id, "Renamed scene")).toEqual([
      { ...active, name: "Renamed scene" },
      other,
    ]);
  });
});

function fixtureProject(name: string, revision: number) {
  const project = createNewStudioProject({
    id: "project-a",
    name,
    createdAt: "2026-07-15T08:00:00.000Z",
  });
  return {
    ...project,
    document: { ...project.document, revision },
    record: { ...project.record, lastSavedRevision: revision },
  };
}
