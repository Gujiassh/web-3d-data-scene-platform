import { validateSceneDocument, type SceneDocument } from "@web3d/document";

import type { ProjectRecord, StudioProjectSnapshot } from "../project";

export interface NewProjectInput {
  readonly id: string;
  readonly name: string;
  readonly createdAt: string;
}

export function createNewStudioProject(input: NewProjectInput): StudioProjectSnapshot {
  const name = input.name.trim();
  if (name === "") throw new Error("Project name is required.");
  assertTimestamp(input.createdAt);

  const document = createEmptyDocument(input.id, name);
  const record: ProjectRecord = {
    id: input.id,
    name,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    lastOpenedAt: input.createdAt,
    lastSavedRevision: document.revision,
    lastExportedRevision: null,
  };
  return { record, document, assets: [] };
}

function createEmptyDocument(id: string, name: string): SceneDocument {
  const candidate: SceneDocument = {
    schemaVersion: "1.0.0",
    id,
    name,
    revision: 0,
    assets: [],
    entities: [],
    targets: [],
    dataSources: [],
    bindings: [],
    ruleSets: [],
    annotations: [],
    views: [],
    environment: {
      background: "#F4F6F5",
      grid: true,
      unit: "m",
      upAxis: "Y",
    },
  };
  const validation = validateSceneDocument(candidate);
  if (!validation.ok) {
    throw new Error(validation.diagnostics[0]?.message ?? "New project is invalid.");
  }
  return validation.value;
}

function assertTimestamp(value: string): void {
  if (Number.isNaN(Date.parse(value))) throw new Error("Project timestamp is invalid.");
}
