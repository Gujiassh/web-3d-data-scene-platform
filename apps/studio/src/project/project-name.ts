import type { SceneDocument } from "@web3d/document";

import type { ProjectRecord, StudioProjectSnapshot } from "./types";

export function withProjectDocument(
  project: StudioProjectSnapshot,
  document: SceneDocument,
): StudioProjectSnapshot {
  return {
    ...project,
    record: { ...project.record, name: document.name },
    document,
  };
}

export function withSavedProjectRecord(
  project: StudioProjectSnapshot,
  savedRecord: ProjectRecord,
): StudioProjectSnapshot {
  return {
    ...project,
    record: { ...savedRecord, name: project.document.name },
  };
}

export function synchronizeRecentProjectName(
  records: readonly ProjectRecord[],
  projectId: string,
  name: string,
): readonly ProjectRecord[] {
  return records.map((record) => (record.id === projectId ? { ...record, name } : record));
}
