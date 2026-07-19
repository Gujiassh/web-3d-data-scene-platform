import "fake-indexeddb/auto";

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createIndexedDbProjectRepository,
  serializeProjectDocument,
  type ProjectAssetInput,
  type ProjectRecord,
  type StudioProjectSnapshot,
} from "./index";

import { parseSceneDocument, type SceneDocument } from "@web3d/document";

const FIXTURE_PATH = resolve(process.cwd(), "tests/fixtures/m0-factory/public/m0-scene.json");

class FixedClock {
  #current: Date;

  constructor(initial: string) {
    this.#current = new Date(initial);
  }

  now(): Date {
    return new Date(this.#current);
  }

  set(iso: string): void {
    this.#current = new Date(iso);
  }
}

describe("createIndexedDbProjectRepository", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rewrites every legacy project to 1.4 in one transaction and leaves current bytes untouched", async () => {
    const dbName = createDbName();
    const currentSeed = {
      ...nonCanonicalCurrentStoredProject(
        legacyStoredProject("current", "Current", "2026-07-14T12:30:00.000Z", 18),
      ),
      lastExportedRevision: 17,
    };
    expect(currentSeed.documentJson).toMatch(/^\{\n {4}"revision":/u);
    expect(currentSeed.documentJson).toContain('"name": "\\u0043urrent"');
    const parsedCurrentSeed = parseSceneDocument(currentSeed.documentJson);
    if (!parsedCurrentSeed.ok) throw new Error("Current test project must be valid.");
    expect(currentSeed.documentJson).not.toBe(serializeProjectDocument(parsedCurrentSeed.value));

    const original = [
      {
        ...legacyStoredProject("legacy-1-0", "Legacy 1.0", "2026-07-10T08:00:00.000Z", 4),
        lastExportedRevision: 3,
      },
      {
        ...legacy1_1StoredProject("legacy-1-1", "Legacy 1.1", "2026-07-11T09:30:00.000Z", 9),
        lastExportedRevision: 8,
      },
      {
        ...legacy1_2StoredProject("legacy-1-2", "Legacy 1.2", "2026-07-12T10:45:00.000Z", 12),
        lastExportedRevision: 11,
      },
      {
        ...legacy1_3StoredProject("legacy-1-3", "Legacy 1.3", "2026-07-13T11:15:00.000Z", 15),
        lastExportedRevision: 14,
      },
      currentSeed,
    ];
    await seedStoredProjects(dbName, original);

    const rewrittenIds: string[] = [];
    const migrationTransactions: string[] = [];
    const originalTransaction = IDBDatabase.prototype.transaction;
    const transactionSpy = vi
      .spyOn(IDBDatabase.prototype, "transaction")
      .mockImplementation(function (
        this: IDBDatabase,
        storeNames: string | Iterable<string>,
        mode?: IDBTransactionMode,
        options?: IDBTransactionOptions,
      ): IDBTransaction {
        if (this.name === dbName && mode === "readwrite") {
          migrationTransactions.push(
            typeof storeNames === "string" ? storeNames : [...storeNames].sort().join(","),
          );
        }
        return originalTransaction.call(this, storeNames, mode, options);
      });
    const originalPut = IDBObjectStore.prototype.put;
    const putSpy = vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (
      this: IDBObjectStore,
      value: unknown,
      key?: IDBValidKey,
    ): IDBRequest<IDBValidKey> {
      if (this.name === "projects" && isStoredProject(value)) rewrittenIds.push(value.id);
      return originalPut.call(this, value, key);
    });

    const repository = createIndexedDbProjectRepository({ dbName, indexedDB });
    await expect(repository.listRecent()).resolves.toHaveLength(5);
    await repository.close();
    expect(rewrittenIds.sort()).toEqual(["legacy-1-0", "legacy-1-1", "legacy-1-2", "legacy-1-3"]);
    expect(rewrittenIds).not.toContain(currentSeed.id);
    expect(migrationTransactions).toEqual(["projects"]);
    putSpy.mockRestore();
    transactionSpy.mockRestore();

    const migrated = await readStoredProjects(dbName);
    expect(migrated.version).toBe(1);
    expect(migrated.stores).toEqual(["assets", "projects", "settings"]);
    expect(migrated.records).toHaveLength(5);
    const currentAfterInitialization = migrated.records.find(
      (record) => record.id === currentSeed.id,
    );
    expect(currentAfterInitialization).toEqual(currentSeed);
    expect(Object.keys(currentAfterInitialization ?? {})).toHaveLength(8);
    expect(currentAfterInitialization?.documentJson).toBe(currentSeed.documentJson);
    for (const before of original) {
      const after = migrated.records.find((record) => record.id === before.id)!;
      const beforeDocument = storedDocument(before);
      expect(Object.keys(after).sort()).toEqual(Object.keys(before).sort());
      expect(Object.keys(after)).toHaveLength(8);
      if (beforeDocument.schemaVersion === "1.4.0") {
        expect(after).toEqual(before);
        expect(after.documentJson).toBe(before.documentJson);
      } else {
        expect(stripStoredDocument(after)).toEqual({
          ...stripStoredDocument(before),
          lastExportedRevision: null,
        });
        const parsedBefore = parseSceneDocument(before.documentJson);
        if (!parsedBefore.ok) throw new Error("Legacy test project could not be migrated.");
        expect(after.documentJson).toBe(serializeProjectDocument(parsedBefore.value));
      }
      const afterDocument = storedDocument(after);
      expect(afterDocument).toMatchObject({
        schemaVersion: "1.4.0",
        revision: beforeDocument.revision,
        environment: {
          background: beforeDocument.environment.background,
          backgroundMode:
            beforeDocument.schemaVersion === "1.0.0"
              ? "custom"
              : beforeDocument.environment.backgroundMode,
          lighting: {
            fill: standardLighting().fill,
            key: { color: "#FFFFFF", intensity: 2.2 },
          },
        },
      });
      const direction = afterDocument.environment.lighting?.key.directionToLight;
      expect(direction?.[0]).toBeCloseTo(0.37904902178945177, 15);
      expect(direction?.[1]).toBeCloseTo(0.7580980435789035, 15);
      expect(direction?.[2]).toBeCloseTo(0.5306686305052324, 15);
    }

    const secondRewrites: string[] = [];
    const idempotentSpy = vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (
      this: IDBObjectStore,
      value: unknown,
      key?: IDBValidKey,
    ): IDBRequest<IDBValidKey> {
      if (this.name === "projects" && isStoredProject(value)) secondRewrites.push(value.id);
      return originalPut.call(this, value, key);
    });
    const reopened = createIndexedDbProjectRepository({ dbName, indexedDB });
    await expect(reopened.listRecent()).resolves.toHaveLength(5);
    await reopened.close();
    expect(secondRewrites).toEqual([]);
    idempotentSpy.mockRestore();
  });

  it("rolls back every stored project when one migration rewrite fails", async () => {
    const dbName = createDbName();
    const original = [
      legacyStoredProject("legacy-a", "Legacy A", "2026-07-10T08:00:00.000Z", 4),
      legacyStoredProject("legacy-b", "Legacy B", "2026-07-11T09:30:00.000Z", 9),
    ];
    await seedStoredProjects(dbName, original);

    const originalPut = IDBObjectStore.prototype.put;
    const putSpy = vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (
      this: IDBObjectStore,
      value: unknown,
      key?: IDBValidKey,
    ): IDBRequest<IDBValidKey> {
      if (
        this.name === "projects" &&
        isStoredProject(value) &&
        value.id === "legacy-b" &&
        storedDocument(value).schemaVersion === "1.4.0"
      ) {
        throw new DOMException("migration write failed", "QuotaExceededError");
      }
      return originalPut.call(this, value, key);
    });

    const repository = createIndexedDbProjectRepository({ dbName, indexedDB });
    await expect(repository.listRecent()).rejects.toThrow(/migration write failed/);
    expect(putSpy).toHaveBeenCalled();
    putSpy.mockRestore();

    const afterFailure = await readStoredProjects(dbName);
    expect(afterFailure.records).toEqual(original);
  });

  it("rejects one mixed initialization atomically when a stored document is invalid", async () => {
    const dbName = createDbName();
    const original = [
      legacyStoredProject("a-valid-legacy", "Valid legacy", "2026-07-10T08:00:00.000Z", 4),
      structurallyInvalidStoredProject(
        legacy1_1StoredProject("b-invalid", "Invalid", "2026-07-11T09:30:00.000Z", 9),
      ),
      nonCanonicalCurrentStoredProject(
        legacyStoredProject("c-valid-current", "Valid current", "2026-07-12T10:45:00.000Z", 12),
      ),
    ];
    await seedStoredProjects(dbName, original);
    const openSpy = vi.spyOn(indexedDB, "open");

    const repository = createIndexedDbProjectRepository({ dbName, indexedDB });
    const firstFailure = await rejectionOf(repository.listRecent());
    const secondFailure = await rejectionOf(repository.open("a-valid-legacy"));
    expect(secondFailure).toBe(firstFailure);
    expect(openSpy).toHaveBeenCalledTimes(1);
    openSpy.mockRestore();

    const afterFailure = await readStoredProjects(dbName);
    expect(afterFailure.version).toBe(1);
    expect(afterFailure.records).toHaveLength(3);
    for (const before of original) {
      const after = afterFailure.records.find((record) => record.id === before.id)!;
      expect(Object.keys(after).sort()).toEqual(Object.keys(before).sort());
      expect(stripStoredDocument(after)).toEqual(stripStoredDocument(before));
      expect(after.documentJson).toBe(before.documentJson);
    }
  });

  it("rolls back every stored project when one stored document cannot be parsed", async () => {
    const dbName = createDbName();
    const malformed = {
      ...legacyStoredProject("b-malformed", "Malformed", "2026-07-11T09:30:00.000Z", 9),
      documentJson: "{not-json",
    };
    const original = [
      legacy1_3StoredProject("a-valid-legacy", "Valid legacy", "2026-07-10T08:00:00.000Z", 4),
      malformed,
      nonCanonicalCurrentStoredProject(
        legacyStoredProject("c-valid-current", "Valid current", "2026-07-12T10:45:00.000Z", 12),
      ),
    ];
    await seedStoredProjects(dbName, original);

    const repository = createIndexedDbProjectRepository({ dbName, indexedDB });
    await expect(repository.listRecent()).rejects.toThrow(/valid JSON/);

    const afterFailure = await readStoredProjects(dbName);
    expect(afterFailure.records).toEqual(original);
  });

  it("saves a validated canonical SceneDocument atomically with new assets", async () => {
    const clock = new FixedClock("2026-07-14T08:00:00.000Z");
    const repository = createIndexedDbProjectRepository({
      dbName: createDbName(),
      indexedDB,
      clock,
    });

    const snapshot = await createFixtureProject({ clock, revision: 3 });
    const saved = await repository.save(snapshot);

    expect(saved.record.lastSavedRevision).toBe(3);
    expect(saved.record.updatedAt).toBe("2026-07-14T08:00:00.000Z");

    clock.set("2026-07-14T08:05:00.000Z");
    const reopened = await repository.open(saved.record.id);
    expect(serializeProjectDocument(reopened.document)).toBe(
      serializeProjectDocument(snapshot.document),
    );

    const resolved = await repository.resolveAsset(reopened.document.assets[0]!.uri);
    await expect(resolved.text()).resolves.toBe("fixture-asset-bytes");

    await repository.close();
  });

  it("uses the document name as the recent-project metadata source", async () => {
    const clock = new FixedClock("2026-07-14T08:00:00.000Z");
    const repository = createIndexedDbProjectRepository({
      dbName: createDbName(),
      indexedDB,
      clock,
    });
    const snapshot = await createFixtureProject({ clock, revision: 3 });
    const renamed = {
      ...snapshot,
      record: { ...snapshot.record, name: "Stale project name" },
      document: { ...snapshot.document, name: "Line A Commissioning" },
    };

    const saved = await repository.save(renamed);
    expect(saved.record.name).toBe("Line A Commissioning");
    expect(saved.document.name).toBe("Line A Commissioning");
    expect((await repository.listRecent())[0]?.name).toBe("Line A Commissioning");
    expect((await repository.open(saved.record.id)).record.name).toBe("Line A Commissioning");

    await repository.close();
  });

  it("rejects session or runtime fields without replacing the old project", async () => {
    const clock = new FixedClock("2026-07-14T08:00:00.000Z");
    const repository = createIndexedDbProjectRepository({
      dbName: createDbName(),
      indexedDB,
      clock,
    });

    const initial = await createFixtureProject({ clock, revision: 1 });
    await repository.save(initial);
    expect(serializeProjectDocument(initial.document)).not.toContain("selectionRecency");

    clock.set("2026-07-14T08:10:00.000Z");
    const invalid = await createFixtureProject({
      clock,
      revision: 2,
      injectForbiddenFields: true,
    });
    await expect(repository.save(invalid)).rejects.toThrow(/SCHEMA_ADDITIONAL_PROPERTY/);

    const reopened = await repository.open(initial.record.id);
    expect(serializeProjectDocument(reopened.document)).toBe(
      serializeProjectDocument(initial.document),
    );
    expect(reopened.record.lastSavedRevision).toBe(1);
    await repository.close();
  });

  it("keeps the old record when an atomic save fails", async () => {
    const clock = new FixedClock("2026-07-14T08:00:00.000Z");
    const repository = createIndexedDbProjectRepository({
      dbName: createDbName(),
      indexedDB,
      clock,
    });

    const initial = await createFixtureProject({ clock, revision: 1 });
    await repository.save(initial);

    const originalPut = IDBObjectStore.prototype.put;
    let shouldFailProjectWrite = true;
    const putSpy = vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (
      this: IDBObjectStore,
      value: unknown,
      key?: IDBValidKey,
    ): IDBRequest<IDBValidKey> {
      if (shouldFailProjectWrite && this.name === "projects") {
        const project = value as { id?: string };
        if (project.id === initial.record.id) {
          shouldFailProjectWrite = false;
          throw new DOMException("write failed", "QuotaExceededError");
        }
      }
      return originalPut.call(this, value, key);
    });

    clock.set("2026-07-14T08:10:00.000Z");
    const failing = await createFixtureProject({
      clock,
      revision: 2,
      assetContents: "replacement-asset-bytes",
    });
    const failingAssetUri = failing.document.assets[0]!.uri;
    expect(failingAssetUri).not.toBe(initial.document.assets[0]!.uri);
    await expect(repository.save(failing)).rejects.toThrow(/write failed/);
    expect(putSpy).toHaveBeenCalled();

    const reopened = await repository.open(initial.record.id);
    expect(serializeProjectDocument(reopened.document)).toBe(
      serializeProjectDocument(initial.document),
    );
    expect(reopened.record.lastSavedRevision).toBe(1);
    await expect(repository.resolveAsset(failingAssetUri)).rejects.toThrow(/does not exist/);
    await repository.close();
  });

  it("rejects insufficient storage before creating a write transaction", async () => {
    const clock = new FixedClock("2026-07-14T08:00:00.000Z");
    let storage = { quota: 1_000_000, usage: 0 };
    const storageEstimate = vi.fn(async () => storage);
    const repository = createIndexedDbProjectRepository({
      dbName: createDbName(),
      indexedDB,
      clock,
      storageEstimate,
    });

    const initial = await createFixtureProject({ clock, revision: 1 });
    await repository.save(initial);

    const transactionSpy = vi.spyOn(IDBDatabase.prototype, "transaction");
    transactionSpy.mockClear();
    storage = { quota: 1, usage: 0 };
    const failing = await createFixtureProject({
      clock,
      revision: 2,
      assetContents: "new-asset-requiring-storage",
    });
    const failingAssetUri = failing.document.assets[0]!.uri;

    await expect(repository.save(failing)).rejects.toThrow(/Insufficient storage capacity/);
    expect(storageEstimate).toHaveBeenCalledTimes(2);
    expect(transactionSpy.mock.calls.some(([, mode]) => mode === "readwrite")).toBe(false);

    const reopened = await repository.open(initial.record.id);
    expect(serializeProjectDocument(reopened.document)).toBe(
      serializeProjectDocument(initial.document),
    );
    await expect(repository.resolveAsset(failingAssetUri)).rejects.toThrow(/does not exist/);
    await repository.close();
  });

  it("tracks recent projects through save, open, and delete", async () => {
    const clock = new FixedClock("2026-07-14T08:00:00.000Z");
    const repository = createIndexedDbProjectRepository({
      dbName: createDbName(),
      indexedDB,
      clock,
    });

    const alpha = await createFixtureProject({ clock, projectId: "alpha", projectName: "Alpha" });
    await repository.save(alpha);

    clock.set("2026-07-14T08:01:00.000Z");
    const beta = await createFixtureProject({ clock, projectId: "beta", projectName: "Beta" });
    await repository.save(beta);

    clock.set("2026-07-14T08:02:00.000Z");
    await repository.open(alpha.record.id);

    const recent = await repository.listRecent();
    expect(recent.map((record) => record.id)).toEqual(["alpha", "beta"]);

    await repository.delete("alpha");
    const afterDelete = await repository.listRecent();
    expect(afterDelete.map((record) => record.id)).toEqual(["beta"]);
    await expect(repository.open("alpha")).rejects.toThrow(/does not exist/);
    await repository.close();
  });

  it("resolves only asset://sha256 blobs", async () => {
    const clock = new FixedClock("2026-07-14T08:00:00.000Z");
    const repository = createIndexedDbProjectRepository({
      dbName: createDbName(),
      indexedDB,
      clock,
    });

    const snapshot = await createFixtureProject({ clock });
    await repository.save(snapshot);

    await expect(repository.resolveAsset("blob:http://example.invalid/123")).rejects.toThrow(
      /Unsupported asset URI/,
    );
    await expect(
      repository.resolveAsset(
        "asset://0000000000000000000000000000000000000000000000000000000000000000",
      ),
    ).rejects.toThrow(/does not exist/);
    await repository.close();
  });

  it("refuses writes after close", async () => {
    const clock = new FixedClock("2026-07-14T08:00:00.000Z");
    const repository = createIndexedDbProjectRepository({
      dbName: createDbName(),
      indexedDB,
      clock,
    });
    await repository.close();
    const snapshot = await createFixtureProject({ clock });
    await expect(repository.save(snapshot)).rejects.toThrow(/closed/);
  });
});

async function createFixtureProject(options: {
  clock: FixedClock;
  revision?: number;
  projectId?: string;
  projectName?: string;
  injectForbiddenFields?: boolean;
  assetContents?: string;
}): Promise<StudioProjectSnapshot> {
  const projectId = options.projectId ?? "factory-project";
  const projectName = options.projectName ?? "Factory Project";
  const revision = options.revision ?? 1;
  const document = loadFixtureDocument(
    projectId,
    projectName,
    revision,
    options.injectForbiddenFields,
  );
  const assetBlob = new Blob([options.assetContents ?? "fixture-asset-bytes"], {
    type: document.assets[0]!.mediaType,
  });
  const assets: readonly ProjectAssetInput[] = [
    {
      sha256: await sha256FromBlob(assetBlob),
      mediaType: document.assets[0]!.mediaType,
      blob: assetBlob,
    },
  ];
  const patchedDocument: SceneDocument = {
    ...document,
    assets: document.assets.map((asset) => ({
      ...asset,
      uri: `asset://${assets[0]!.sha256}`,
      sha256: assets[0]!.sha256,
      byteLength: assetBlob.size,
    })),
    targets: document.targets.map((target) => ({
      ...target,
      assetHash: assets[0]!.sha256,
    })),
  };
  const now = options.clock.now().toISOString();
  return {
    record: createRecord(projectId, projectName, now, revision),
    document: patchedDocument,
    assets,
  };
}

function createRecord(
  id: string,
  name: string,
  isoTimestamp: string,
  revision: number,
): ProjectRecord {
  return {
    id,
    name,
    createdAt: isoTimestamp,
    updatedAt: isoTimestamp,
    lastOpenedAt: isoTimestamp,
    lastSavedRevision: revision,
    lastExportedRevision: null,
  };
}

function loadFixtureDocument(
  projectId: string,
  projectName: string,
  revision: number,
  injectForbiddenFields = false,
): SceneDocument {
  const parsed = parseSceneDocument(readFileSync(FIXTURE_PATH, "utf8"));
  if (!parsed.ok) throw new Error("Fixture SceneDocument could not be migrated.");
  const document = parsed.value;
  const patched: SceneDocument = {
    ...document,
    id: projectId,
    name: projectName,
    revision,
  };
  if (!injectForbiddenFields) {
    return patched;
  }
  const withForbidden = patched as SceneDocument & {
    selectedEntityIds?: readonly string[];
    selectionRecency?: readonly string[];
    entities: Array<SceneDocument["entities"][number] & { runtimeSelection?: boolean }>;
  };
  withForbidden.selectedEntityIds = [patched.entities[0]!.id];
  withForbidden.selectionRecency = [patched.entities[0]!.id];
  withForbidden.entities = patched.entities.map((entity, index) =>
    index === 0 ? { ...entity, runtimeSelection: true } : entity,
  );
  return withForbidden;
}

async function sha256FromBlob(blob: Blob): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function createDbName(): string {
  return `studio-project-tests-${globalThis.crypto.randomUUID()}`;
}

interface StoredProject extends ProjectRecord {
  readonly documentJson: string;
}

interface StoredDocumentShape {
  readonly schemaVersion: string;
  readonly revision: number;
  readonly environment: {
    readonly background: string;
    readonly backgroundMode?: string;
    readonly lighting?: {
      readonly fill: ReturnType<typeof standardLighting>["fill"];
      readonly key: ReturnType<typeof standardLighting>["key"];
    };
  };
}

function legacyStoredProject(
  id: string,
  name: string,
  timestamp: string,
  revision: number,
): StoredProject {
  const document = JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as Record<string, unknown> & {
    readonly assets: readonly (Record<string, unknown> & { readonly sha256: string })[];
    readonly environment: Record<string, unknown>;
  };
  const legacyEnvironment = { ...document.environment };
  delete legacyEnvironment["backgroundMode"];
  delete legacyEnvironment["lighting"];
  return {
    ...createRecord(id, name, timestamp, revision),
    documentJson: JSON.stringify({
      ...document,
      id,
      name,
      revision,
      schemaVersion: "1.0.0",
      assets: document.assets.map((asset) => ({
        ...asset,
        uri: `asset://${asset.sha256}`,
      })),
      environment: legacyEnvironment,
    }),
  };
}

function storedDocument(record: StoredProject): StoredDocumentShape {
  return JSON.parse(record.documentJson) as StoredDocumentShape;
}

function nonCanonicalCurrentStoredProject(record: StoredProject): StoredProject {
  const parsed = parseSceneDocument(record.documentJson);
  if (!parsed.ok) throw new Error("Legacy test project could not be migrated.");
  const canonical = JSON.parse(serializeProjectDocument(parsed.value)) as Record<string, unknown>;
  const { revision, schemaVersion, name, ...remaining } = canonical;
  if (typeof name !== "string" || name.length === 0) {
    throw new Error("Current test project must have a name.");
  }
  const reordered = JSON.stringify({ revision, schemaVersion, name, ...remaining }, null, 4);
  const escapedName = `"\\u${name.charCodeAt(0).toString(16).padStart(4, "0")}${JSON.stringify(name.slice(1)).slice(1)}`;
  return {
    ...record,
    documentJson: reordered.replace(JSON.stringify(name), escapedName),
  };
}

function legacy1_1StoredProject(
  id: string,
  name: string,
  timestamp: string,
  revision: number,
): StoredProject {
  const legacy = legacyStoredProject(id, name, timestamp, revision);
  const document = JSON.parse(legacy.documentJson) as Record<string, unknown> & {
    readonly environment: Record<string, unknown>;
  };
  return {
    ...legacy,
    documentJson: JSON.stringify({
      ...document,
      schemaVersion: "1.1.0",
      environment: { ...document.environment, backgroundMode: "custom" },
    }),
  };
}

function legacy1_2StoredProject(
  id: string,
  name: string,
  timestamp: string,
  revision: number,
): StoredProject {
  const legacy = legacy1_1StoredProject(id, name, timestamp, revision);
  const document = JSON.parse(legacy.documentJson) as Record<string, unknown> & {
    readonly environment: Record<string, unknown>;
  };
  return {
    ...legacy,
    documentJson: JSON.stringify({
      ...document,
      schemaVersion: "1.2.0",
      environment: {
        ...document.environment,
        background: String(document.environment["background"]).toUpperCase(),
        lighting: standardLighting(),
      },
    }),
  };
}

function legacy1_3StoredProject(
  id: string,
  name: string,
  timestamp: string,
  revision: number,
): StoredProject {
  const legacy = legacy1_2StoredProject(id, name, timestamp, revision);
  const document = JSON.parse(legacy.documentJson) as Record<string, unknown>;
  return {
    ...legacy,
    documentJson: JSON.stringify({ ...document, schemaVersion: "1.3.0" }),
  };
}

function standardLighting() {
  return {
    fill: { skyColor: "#FFFFFF", groundColor: "#65706A", intensity: 1.8 },
    key: {
      color: "#FFFFFF",
      intensity: 2.2,
      directionToLight: [0.37904902178945177, 0.7580980435789035, 0.5306686305052324],
    },
  } as const;
}

function structurallyInvalidStoredProject(record: StoredProject): StoredProject {
  const document = JSON.parse(record.documentJson) as Record<string, unknown> & {
    readonly environment: Record<string, unknown>;
  };
  return {
    ...record,
    documentJson: JSON.stringify({
      ...document,
      environment: { ...document.environment, background: "#BAD" },
    }),
  };
}

async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("Expected repository initialization to reject.");
}

function stripStoredDocument(record: StoredProject): ProjectRecord {
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

function isStoredProject(value: unknown): value is StoredProject {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string" &&
    "documentJson" in value &&
    typeof value.documentJson === "string"
  );
}

async function seedStoredProjects(
  dbName: string,
  records: readonly StoredProject[],
): Promise<void> {
  const db = await openRawDatabase(dbName);
  const tx = db.transaction("projects", "readwrite");
  const completed = rawTransactionComplete(tx);
  const store = tx.objectStore("projects");
  for (const record of records) store.put(record);
  await completed;
  db.close();
}

async function readStoredProjects(dbName: string): Promise<{
  readonly version: number;
  readonly stores: readonly string[];
  readonly records: readonly StoredProject[];
}> {
  const db = await openRawDatabase(dbName);
  const tx = db.transaction("projects", "readonly");
  const completed = rawTransactionComplete(tx);
  const records = await rawRequest<StoredProject[]>(tx.objectStore("projects").getAll());
  await completed;
  const result = { version: db.version, stores: [...db.objectStoreNames].sort(), records };
  db.close();
  return result;
}

function openRawDatabase(dbName: string): Promise<IDBDatabase> {
  return new Promise((resolveDatabase, rejectDatabase) => {
    const request = indexedDB.open(dbName, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("projects")) {
        db.createObjectStore("projects", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("assets")) {
        db.createObjectStore("assets", { keyPath: "sha256" });
      }
      if (!db.objectStoreNames.contains("settings")) {
        db.createObjectStore("settings", { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolveDatabase(request.result);
    request.onerror = () =>
      rejectDatabase(request.error ?? new Error("Test database open failed."));
  });
}

function rawRequest<TResult>(source: IDBRequest<TResult>): Promise<TResult> {
  return new Promise((resolveRequest, rejectRequest) => {
    source.onsuccess = () => resolveRequest(source.result);
    source.onerror = () => rejectRequest(source.error ?? new Error("Test request failed."));
  });
}

function rawTransactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolveTransaction, rejectTransaction) => {
    transaction.oncomplete = () => resolveTransaction();
    transaction.onabort = () =>
      rejectTransaction(transaction.error ?? new Error("Test transaction aborted."));
    transaction.onerror = () =>
      rejectTransaction(transaction.error ?? new Error("Test transaction failed."));
  });
}
