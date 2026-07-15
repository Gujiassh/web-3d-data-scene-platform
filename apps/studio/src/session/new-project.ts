import { validateSceneDocument, type SceneDocument } from "@web3d/document";

import { studioAppErrors } from "../errors";
import type { ProjectRecord, StudioProjectSnapshot } from "../project";

export interface NewProjectInput {
  readonly id: string;
  readonly name: string;
  readonly createdAt: string;
}

export function createNewStudioProject(input: NewProjectInput): StudioProjectSnapshot {
  const name = input.name.trim();
  if (name === "") throw studioAppErrors.projectNameRequired();
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
    const diagnostic = validation.diagnostics[0];
    throw diagnostic === undefined
      ? studioAppErrors.newProjectInvalid()
      : new Error(diagnostic.message);
  }
  return validation.value;
}

function assertTimestamp(value: string): void {
  if (Number.isNaN(Date.parse(value))) throw studioAppErrors.projectTimestampInvalid();
}
