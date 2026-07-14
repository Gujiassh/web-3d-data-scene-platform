export { createAutosaveController, type AutosaveController } from "./autosave-controller";
export { createIndexedDbProjectRepository } from "./indexeddb-project-repository";
export {
  canonicalizeSceneDocument,
  serializeProjectDocument,
  validateProjectDocument,
} from "./document-snapshot";
export { systemAutosaveClock, systemRepositoryClock } from "./clock";
export type {
  AutosaveClock,
  AutosaveState,
  ProjectAssetInput,
  ProjectRecord,
  RepositoryClock,
  RepositoryOptions,
  RepositoryStorageEstimate,
  StudioProjectRepository,
  StudioProjectSnapshot,
} from "./types";
