import { parseSceneDocument, type SceneDocument } from "@web3d/document";

import { studioAppErrors } from "../errors";
import { systemRepositoryClock } from "./clock";
import { serializeProjectDocument, validateProjectDocument } from "./document-snapshot";
import type {
  ProjectAssetInput,
  ProjectRecord,
  RepositoryOptions,
  RepositoryStorageEstimate,
  StudioProjectRepository,
  StudioProjectSnapshot,
} from "./types";

const DATABASE_NAME = "web3d-studio";
const DATABASE_VERSION = 1;
const PROJECTS_STORE = "projects";
const ASSETS_STORE = "assets";
const SETTINGS_STORE = "settings";
const RECENT_PROJECTS_KEY = "recent-project-ids";
const LAST_PROJECT_KEY = "last-project-id";
const ASSET_URI_PREFIX = "asset://";

interface PersistedProjectRecord extends ProjectRecord {
  readonly documentJson: string;
}

interface PersistedAssetRecord {
  readonly sha256: string;
  readonly mediaType: SceneDocument["assets"][number]["mediaType"];
  readonly byteLength: number;
  readonly blob: Blob;
}

interface SettingRecord<TValue> {
  readonly key: string;
  readonly value: TValue;
}

export function createIndexedDbProjectRepository(
  options: RepositoryOptions = {},
): StudioProjectRepository {
  const indexedDb = options.indexedDB ?? globalThis.indexedDB;
  if (!indexedDb) {
    throw studioAppErrors.indexedDbUnavailable();
  }

  const clock = options.clock ?? systemRepositoryClock;
  const dbName = options.dbName ?? DATABASE_NAME;
  const storageEstimate = options.storageEstimate ?? browserStorageEstimate();
  let databasePromise: Promise<IDBDatabase> | null = null;
  let closed = false;

  return {
    save: async (snapshot) => {
      assertOpen(closed);
      const document = validateProjectDocument(snapshot.document);
      const serializedDocument = serializeProjectDocument(document);
      const persistedAssets = await Promise.all(snapshot.assets.map(toPersistedAssetRecord));
      const referencedHashes = new Set(document.assets.map((asset) => asset.sha256));
      for (const asset of persistedAssets) {
        if (!referencedHashes.has(asset.sha256)) {
          throw studioAppErrors.assetNotReferenced(asset.sha256);
        }
      }

      const db = await openDatabase();
      if (storageEstimate) {
        const newAssetHashes = await findNewAssetHashes(db, persistedAssets);
        await assertStorageCapacity(
          storageEstimate,
          serializedDocument,
          persistedAssets.filter((asset) => newAssetHashes.has(asset.sha256)),
        );
      }
      assertOpen(closed);
      const nowIso = clock.now().toISOString();
      const tx = db.transaction([PROJECTS_STORE, ASSETS_STORE, SETTINGS_STORE], "readwrite");
      const done = transactionComplete(tx);
      try {
        const projectStore = tx.objectStore(PROJECTS_STORE);
        const assetStore = tx.objectStore(ASSETS_STORE);
        const settingsStore = tx.objectStore(SETTINGS_STORE);
        const existing = await request<PersistedProjectRecord | undefined>(
          projectStore.get(snapshot.record.id),
        );
        const providedAssetHashes = new Set(persistedAssets.map((asset) => asset.sha256));

        for (const asset of document.assets) {
          if (providedAssetHashes.has(asset.sha256)) continue;
          const existingAsset = await request<PersistedAssetRecord | undefined>(
            assetStore.get(asset.sha256),
          );
          if (!existingAsset) {
            throw studioAppErrors.assetBytesMissing(asset.sha256);
          }
        }

        for (const asset of persistedAssets) {
          assetStore.put(asset);
        }

        const recentIds = await readRecentIds(settingsStore);
        const record: PersistedProjectRecord = {
          id: snapshot.record.id,
          name: document.name,
          createdAt: existing?.createdAt ?? snapshot.record.createdAt,
          updatedAt: nowIso,
          lastOpenedAt: nowIso,
          lastSavedRevision: document.revision,
          lastExportedRevision: snapshot.record.lastExportedRevision,
          documentJson: serializedDocument,
        };
        projectStore.put(record);
        settingsStore.put(
          settingRecord(RECENT_PROJECTS_KEY, moveProjectToFront(recentIds, record.id)),
        );
        settingsStore.put(settingRecord(LAST_PROJECT_KEY, record.id));
        await done;
        return toStudioProject(record, document, persistedAssets);
      } catch (error) {
        await abortAndWaitForTransaction(tx, done);
        throw error;
      }
    },
    open: async (projectId) => {
      assertOpen(closed);
      const db = await openDatabase();
      const tx = db.transaction([PROJECTS_STORE, SETTINGS_STORE], "readwrite");
      const done = transactionComplete(tx);
      const projectStore = tx.objectStore(PROJECTS_STORE);
      const settingsStore = tx.objectStore(SETTINGS_STORE);
      const existing = await request<PersistedProjectRecord | undefined>(
        projectStore.get(projectId),
      );
      if (!existing) {
        throw studioAppErrors.projectNotFound(projectId);
      }
      const document = parseStoredDocument(existing.documentJson, projectId);
      const nowIso = clock.now().toISOString();
      const updated: PersistedProjectRecord = {
        ...existing,
        lastOpenedAt: nowIso,
        updatedAt: existing.updatedAt,
      };
      projectStore.put(updated);
      const recentIds = await readRecentIds(settingsStore);
      settingsStore.put(
        settingRecord(RECENT_PROJECTS_KEY, moveProjectToFront(recentIds, projectId)),
      );
      settingsStore.put(settingRecord(LAST_PROJECT_KEY, projectId));
      await done;
      return toStudioProject(updated, document, []);
    },
    listRecent: async (limit) => {
      assertOpen(closed);
      const db = await openDatabase();
      const tx = db.transaction([PROJECTS_STORE, SETTINGS_STORE], "readonly");
      const done = transactionComplete(tx);
      const projectStore = tx.objectStore(PROJECTS_STORE);
      const settingsStore = tx.objectStore(SETTINGS_STORE);
      const recentIds = await readRecentIds(settingsStore);
      const allProjects = (await request<PersistedProjectRecord[]>(projectStore.getAll())).map(
        stripDocumentJson,
      );
      const projectsById = new Map(allProjects.map((record) => [record.id, record]));
      const ordered: ProjectRecord[] = [];
      for (const id of recentIds) {
        const project = projectsById.get(id);
        if (!project) continue;
        ordered.push(project);
        projectsById.delete(id);
      }
      const remainder = [...projectsById.values()].sort(compareRecency);
      const result = [...ordered, ...remainder];
      await done;
      return typeof limit === "number" ? result.slice(0, limit) : result;
    },
    delete: async (projectId) => {
      assertOpen(closed);
      const db = await openDatabase();
      const tx = db.transaction([PROJECTS_STORE, SETTINGS_STORE], "readwrite");
      const done = transactionComplete(tx);
      const projectStore = tx.objectStore(PROJECTS_STORE);
      const settingsStore = tx.objectStore(SETTINGS_STORE);
      projectStore.delete(projectId);
      const recentIds = await readRecentIds(settingsStore);
      settingsStore.put(
        settingRecord(
          RECENT_PROJECTS_KEY,
          recentIds.filter((candidate) => candidate !== projectId),
        ),
      );
      const lastProject = await readSetting<string | null>(settingsStore, LAST_PROJECT_KEY);
      if (lastProject === projectId) {
        settingsStore.put(settingRecord(LAST_PROJECT_KEY, null));
      }
      await done;
    },
    resolveAsset: async (uri) => {
      assertOpen(closed);
      const sha256 = parseAssetUri(uri);
      const db = await openDatabase();
      const tx = db.transaction(ASSETS_STORE, "readonly");
      const done = transactionComplete(tx);
      const assetStore = tx.objectStore(ASSETS_STORE);
      const asset = await request<PersistedAssetRecord | undefined>(assetStore.get(sha256));
      await done;
      if (!asset) {
        throw studioAppErrors.assetNotFound(sha256);
      }
      return asset.blob;
    },
    close: async () => {
      if (closed) return;
      closed = true;
      if (databasePromise) {
        const db = await databasePromise;
        db.close();
      }
    },
  };

  function openDatabase(): Promise<IDBDatabase> {
    if (!databasePromise) {
      databasePromise = new Promise((resolve, reject) => {
        const openRequest = indexedDb.open(dbName, DATABASE_VERSION);
        openRequest.onupgradeneeded = () => {
          const db = openRequest.result;
          if (!db.objectStoreNames.contains(PROJECTS_STORE)) {
            db.createObjectStore(PROJECTS_STORE, { keyPath: "id" });
          }
          if (!db.objectStoreNames.contains(ASSETS_STORE)) {
            db.createObjectStore(ASSETS_STORE, { keyPath: "sha256" });
          }
          if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
            db.createObjectStore(SETTINGS_STORE, { keyPath: "key" });
          }
        };
        openRequest.onsuccess = () => {
          const db = openRequest.result;
          void migrateStoredProjects(db).then(
            () => resolve(db),
            (error: unknown) => {
              db.close();
              reject(error);
            },
          );
        };
        openRequest.onerror = () =>
          reject(openRequest.error ?? studioAppErrors.indexedDbOpenFailed());
      });
    }
    return databasePromise;
  }
}

async function migrateStoredProjects(db: IDBDatabase): Promise<void> {
  const tx = db.transaction(PROJECTS_STORE, "readwrite");
  const done = transactionComplete(tx);
  try {
    const projectStore = tx.objectStore(PROJECTS_STORE);
    const records = await request<PersistedProjectRecord[]>(projectStore.getAll());
    const rewrites = records.flatMap((record) => {
      const declaredVersion = readStoredSchemaVersion(record.documentJson);
      const document = parseStoredDocument(record.documentJson, record.id);
      if (declaredVersion === document.schemaVersion) return [];
      const documentJson = serializeProjectDocument(document);
      return [{ ...record, lastExportedRevision: null, documentJson }];
    });
    for (const record of rewrites) projectStore.put(record);
    await done;
  } catch (error) {
    await abortAndWaitForTransaction(tx, done);
    throw error;
  }
}

function readStoredSchemaVersion(documentJson: string): unknown {
  let value: unknown;
  try {
    value = JSON.parse(documentJson);
  } catch {
    return undefined;
  }
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)["schemaVersion"]
    : undefined;
}

function assertOpen(closed: boolean): void {
  if (closed) {
    throw studioAppErrors.projectRepositoryClosed();
  }
}

async function toPersistedAssetRecord(asset: ProjectAssetInput): Promise<PersistedAssetRecord> {
  const buffer = await asset.blob.arrayBuffer();
  const sha256 = await sha256Hex(buffer);
  if (sha256 !== asset.sha256) {
    throw studioAppErrors.assetSha256Mismatch(asset.sha256, sha256);
  }
  return {
    sha256,
    mediaType: asset.mediaType,
    byteLength: buffer.byteLength,
    blob: asset.blob,
  };
}

async function findNewAssetHashes(
  db: IDBDatabase,
  assets: readonly PersistedAssetRecord[],
): Promise<ReadonlySet<string>> {
  if (assets.length === 0) {
    return new Set();
  }

  const tx = db.transaction(ASSETS_STORE, "readonly");
  const done = transactionComplete(tx);
  const assetStore = tx.objectStore(ASSETS_STORE);
  try {
    const existingKeys = await Promise.all(
      assets.map((asset) => request<IDBValidKey | undefined>(assetStore.getKey(asset.sha256))),
    );
    await done;
    return new Set(
      assets.filter((_, index) => existingKeys[index] === undefined).map((asset) => asset.sha256),
    );
  } catch (error) {
    await abortAndWaitForTransaction(tx, done);
    throw error;
  }
}

async function assertStorageCapacity(
  estimateStorage: () => Promise<RepositoryStorageEstimate>,
  serializedDocument: string,
  newAssets: readonly PersistedAssetRecord[],
): Promise<void> {
  const estimate = await estimateStorage();
  if (estimate.quota === undefined || estimate.usage === undefined) {
    return;
  }

  const documentBytes = new TextEncoder().encode(serializedDocument).byteLength;
  const requiredBytes =
    documentBytes + newAssets.reduce((total, asset) => total + asset.byteLength, 0);
  const remainingBytes = estimate.quota - estimate.usage;
  if (remainingBytes < requiredBytes) {
    throw studioAppErrors.insufficientStorageCapacity(remainingBytes, requiredBytes);
  }
}

function browserStorageEstimate(): (() => Promise<RepositoryStorageEstimate>) | undefined {
  const storage = globalThis.navigator?.storage;
  if (!storage?.estimate) {
    return undefined;
  }
  return () => storage.estimate();
}

function stripDocumentJson(record: PersistedProjectRecord): ProjectRecord {
  return {
    id: record.id,
    name: record.name,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    lastOpenedAt: record.lastOpenedAt,
    lastSavedRevision: record.lastSavedRevision,
    lastExportedRevision: record.lastExportedRevision,
  };
}

function toStudioProject(
  record: PersistedProjectRecord,
  document: SceneDocument,
  assets: readonly PersistedAssetRecord[],
): StudioProjectSnapshot {
  return {
    record: stripDocumentJson(record),
    document,
    assets: assets.map((asset) => ({
      sha256: asset.sha256,
      mediaType: asset.mediaType,
      blob: asset.blob,
    })),
  };
}

function parseStoredDocument(documentJson: string, projectId: string): SceneDocument {
  const parsed = parseSceneDocument(documentJson);
  if (!parsed.ok) {
    const diagnostic = parsed.diagnostics[0];
    throw diagnostic === undefined
      ? studioAppErrors.storedProjectInvalid(projectId)
      : new Error(diagnostic.message);
  }
  return validateProjectDocument(parsed.value);
}

function parseAssetUri(uri: string): string {
  if (!uri.startsWith(ASSET_URI_PREFIX)) {
    throw studioAppErrors.unsupportedAssetUri(uri);
  }
  const sha256 = uri.slice(ASSET_URI_PREFIX.length);
  if (!/^[a-f0-9]{64}$/u.test(sha256)) {
    throw studioAppErrors.unsupportedAssetUri(uri);
  }
  return sha256;
}

function compareRecency(left: ProjectRecord, right: ProjectRecord): number {
  return right.lastOpenedAt.localeCompare(left.lastOpenedAt);
}

function moveProjectToFront(projectIds: readonly string[], projectId: string): readonly string[] {
  return [projectId, ...projectIds.filter((candidate) => candidate !== projectId)];
}

function settingRecord<TValue>(key: string, value: TValue): SettingRecord<TValue> {
  return { key, value };
}

async function readRecentIds(settingsStore: IDBObjectStore): Promise<readonly string[]> {
  return (await readSetting<readonly string[] | null>(settingsStore, RECENT_PROJECTS_KEY)) ?? [];
}

async function readSetting<TValue>(
  settingsStore: IDBObjectStore,
  key: string,
): Promise<TValue | undefined> {
  const record = await request<SettingRecord<TValue> | undefined>(settingsStore.get(key));
  return record?.value;
}

function request<TResult>(source: IDBRequest<TResult>): Promise<TResult> {
  return new Promise((resolve, reject) => {
    source.onsuccess = () => resolve(source.result);
    source.onerror = () => reject(source.error ?? studioAppErrors.indexedDbRequestFailed());
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () =>
      reject(transaction.error ?? studioAppErrors.indexedDbTransactionAborted());
    transaction.onerror = () =>
      reject(transaction.error ?? studioAppErrors.indexedDbTransactionFailed());
  });
}

async function abortAndWaitForTransaction(
  transaction: IDBTransaction,
  completion: Promise<void>,
): Promise<void> {
  try {
    transaction.abort();
  } catch {
    // A completed or already-aborted transaction cannot be aborted again.
  }
  try {
    await completion;
  } catch {
    // The original save error is more actionable than the resulting AbortError.
  }
}

async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}
