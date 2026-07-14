import type { SceneDocument } from "@web3d/document";

export interface ProjectRecord {
  readonly id: string;
  readonly name: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly lastOpenedAt: string;
  readonly lastSavedRevision: number;
  readonly lastExportedRevision: number | null;
}

export interface ProjectAssetInput {
  readonly sha256: string;
  readonly mediaType: SceneDocument["assets"][number]["mediaType"];
  readonly blob: Blob;
}

export interface StudioProjectSnapshot {
  readonly record: ProjectRecord;
  readonly document: SceneDocument;
  readonly assets: readonly ProjectAssetInput[];
}

export interface StudioProjectRepository {
  save(snapshot: StudioProjectSnapshot): Promise<StudioProjectSnapshot>;
  open(projectId: string): Promise<StudioProjectSnapshot>;
  listRecent(limit?: number): Promise<readonly ProjectRecord[]>;
  delete(projectId: string): Promise<void>;
  resolveAsset(uri: string): Promise<Blob>;
  close(): Promise<void>;
}

export interface RepositoryClock {
  now(): Date;
}

export interface RepositoryStorageEstimate {
  readonly quota?: number;
  readonly usage?: number;
}

export interface RepositoryOptions {
  readonly dbName?: string;
  readonly indexedDB?: IDBFactory;
  readonly clock?: RepositoryClock;
  readonly storageEstimate?: () => Promise<RepositoryStorageEstimate>;
}

export interface AutosaveState {
  readonly status: "saved" | "saving" | "failed";
  readonly revision: number;
  readonly message?: string;
}

export interface AutosaveClock {
  setTimeout(callback: () => void, delayMs: number): ReturnType<typeof setTimeout>;
  clearTimeout(handle: ReturnType<typeof setTimeout>): void;
}
