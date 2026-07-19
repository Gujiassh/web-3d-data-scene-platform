import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

const fixture = JSON.parse(
  readFileSync(resolve(process.cwd(), "tests/fixtures/m0-factory/public/m0-scene.json"), "utf8"),
) as SceneFixture;

const storeNames = ["assets", "projects", "settings"] as const;
const runtimeErrorsByPage = new WeakMap<Page, string[]>();

test.describe("native IndexedDB SceneDocument migration", () => {
  test.beforeEach(({ page }) => {
    runtimeErrorsByPage.set(page, observeRuntimeErrors(page));
  });

  test.afterEach(({ page }) => {
    expect(runtimeErrorsByPage.get(page)).toEqual([]);
    runtimeErrorsByPage.delete(page);
  });

  test("atomically migrates mixed persisted versions 1.0 through 1.3 to 1.4", async ({ page }) => {
    const dbName = databaseName();
    const original = [
      storedProject("legacy-1-0", "Legacy 1.0", "1.0.0", 4),
      storedProject("legacy-1-1", "Legacy 1.1", "1.1.0", 9),
      storedProject("legacy-1-2", "Legacy 1.2", "1.2.0", 12),
      storedProject("legacy-1-3", "Legacy 1.3", "1.3.0", 15),
    ];

    await openStudio(page);
    try {
      await seedStoredProjects(page, dbName, original);
      const initialization = await initializeProductionRepository(page, dbName);

      expect(initialization).toEqual({
        ok: true,
        error: null,
        projectCount: 4,
        putIds: original.map((record) => record.id),
        prototypeRestored: true,
      });

      const migrated = await readStoredDatabase(page, dbName);
      expect(migrated.version).toBe(1);
      expect(migrated.stores).toEqual(storeNames);
      expect(migrated.records).toHaveLength(original.length);

      for (const before of original) {
        const beforeDocument = parseDocument(before.documentJson);
        const expectedDocument = migrateExpectedDocument(beforeDocument);
        const expectedDocumentJson = canonicalJson(expectedDocument);
        const after = migrated.records.find((record) => record.id === before.id);

        expect(after).toEqual({
          ...before,
          lastExportedRevision: null,
          documentJson: expectedDocumentJson,
        });
        expect(after?.documentJson).toBe(expectedDocumentJson);
        expect(parseDocument(after?.documentJson ?? "")).toEqual(
          parseDocument(expectedDocumentJson),
        );
      }

      const migratedAnnotation = parseDocument(
        migrated.records.find((record) => record.id === "legacy-1-3")?.documentJson ?? "",
      )["annotations"];
      expect(migratedAnnotation).toEqual([
        {
          id: "legacy-status-note",
          title: "Press status",
          visible: true,
          locked: false,
          anchor: {
            kind: "legacy",
            targetId: "press-01",
            localOffset: [0.25, 0.5, -0.75],
          },
          content: { kind: "host-content", key: "press.status" },
          action: { type: "show-content" },
        },
      ]);
    } finally {
      await deleteDatabase(page, dbName);
    }
  });

  test("preserves valid noncanonical current 1.4 bytes without a project put", async ({ page }) => {
    const dbName = databaseName();
    const current = currentStoredProject("current-1-4", "Current bytes", 18);
    const parsed = parseDocument(current.documentJson);

    expect(current.documentJson).toMatch(/^\{\n {4}"revision":/u);
    expect(current.documentJson).toContain('"name": "\\u0043urrent bytes"');
    expect(current.documentJson).not.toBe(canonicalJson(parsed));

    await openStudio(page);
    try {
      await seedStoredProjects(page, dbName, [current]);
      const initialization = await initializeProductionRepository(page, dbName);

      expect(initialization).toEqual({
        ok: true,
        error: null,
        projectCount: 1,
        putIds: [],
        prototypeRestored: true,
      });

      const stored = await readStoredDatabase(page, dbName);
      expect(stored.records).toEqual([current]);
      expect(Object.keys(stored.records[0] ?? {}).sort()).toEqual([
        "createdAt",
        "documentJson",
        "id",
        "lastExportedRevision",
        "lastOpenedAt",
        "lastSavedRevision",
        "name",
        "updatedAt",
      ]);
      expect(stored.records[0]?.documentJson).toBe(current.documentJson);
    } finally {
      await deleteDatabase(page, dbName);
    }
  });

  test("rolls back every record when one persisted document is invalid", async ({ page }) => {
    const dbName = databaseName();
    const invalid = storedProject("b-invalid", "Invalid", "1.1.0", 9);
    const invalidDocument = parseDocument(invalid.documentJson);
    invalidDocument["environment"] = {
      ...(invalidDocument["environment"] as Record<string, unknown>),
      background: "#BAD",
    };
    const original = [
      storedProject("a-valid-legacy", "Valid legacy", "1.0.0", 4),
      { ...invalid, documentJson: JSON.stringify(invalidDocument) },
      currentStoredProject("c-valid-current", "Current control", 12),
    ];

    await openStudio(page);
    try {
      await seedStoredProjects(page, dbName, original);
      const initialization = await initializeProductionRepository(page, dbName);

      expect(initialization.ok).toBe(false);
      expect(initialization.error).toMatch(/background|pattern|valid/u);
      expect(initialization.projectCount).toBeNull();
      expect(initialization.putIds).toEqual([]);
      expect(initialization.prototypeRestored).toBe(true);

      const afterFailure = await readStoredDatabase(page, dbName);
      expect(afterFailure.version).toBe(1);
      expect(afterFailure.stores).toEqual(storeNames);
      expect(afterFailure.records).toEqual(sortRecords(original));
      for (const before of original) {
        expect(afterFailure.records.find((record) => record.id === before.id)?.documentJson).toBe(
          before.documentJson,
        );
      }
    } finally {
      await deleteDatabase(page, dbName);
    }
  });

  test("rolls back an enqueued first put when a later migration put throws", async ({ page }) => {
    const dbName = databaseName();
    const original = [
      storedProject("a-first-write", "First write", "1.0.0", 4),
      storedProject("b-failing-write", "Failing write", "1.2.0", 9),
      storedProject("c-never-committed", "Never committed", "1.3.0", 12),
    ];

    await openStudio(page);
    try {
      await seedStoredProjects(page, dbName, original);
      const initialization = await initializeProductionRepository(page, dbName, "b-failing-write");

      expect(initialization.ok).toBe(false);
      expect(initialization.error).toContain("Injected migration put failure");
      expect(initialization.projectCount).toBeNull();
      expect(initialization.putIds).toEqual(["a-first-write", "b-failing-write"]);
      expect(initialization.prototypeRestored).toBe(true);

      const afterFailure = await readStoredDatabase(page, dbName);
      expect(afterFailure.records).toEqual(sortRecords(original));
      for (const before of original) {
        const after = afterFailure.records.find((record) => record.id === before.id);
        expect(after).toEqual(before);
        expect(after?.documentJson).toBe(before.documentJson);
      }
    } finally {
      await deleteDatabase(page, dbName);
    }
  });
});

interface StoredProject {
  readonly id: string;
  readonly name: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly lastOpenedAt: string;
  readonly lastSavedRevision: number;
  readonly lastExportedRevision: number | null;
  readonly documentJson: string;
}

interface SceneFixture extends Record<string, unknown> {
  readonly assets: readonly (Record<string, unknown> & { readonly sha256: string })[];
  readonly environment: Readonly<Record<string, unknown>>;
}

interface BrowserRepository {
  listRecent(): Promise<readonly unknown[]>;
  close(): Promise<void>;
}

interface BrowserProjectModule {
  createIndexedDbProjectRepository(options: {
    readonly dbName: string;
    readonly indexedDB: IDBFactory;
  }): BrowserRepository;
}

interface InitializationResult {
  readonly ok: boolean;
  readonly error: string | null;
  readonly projectCount: number | null;
  readonly putIds: readonly string[];
  readonly prototypeRestored: boolean;
}

function storedProject(
  id: string,
  name: string,
  schemaVersion: "1.0.0" | "1.1.0" | "1.2.0" | "1.3.0",
  revision: number,
): StoredProject {
  const timestamp = `2026-07-${String(revision).padStart(2, "0")}T08:00:00.000Z`;
  const document = legacyDocument(id, name, schemaVersion, revision);
  return {
    id,
    name,
    createdAt: timestamp,
    updatedAt: timestamp,
    lastOpenedAt: timestamp,
    lastSavedRevision: revision,
    lastExportedRevision: revision - 1,
    documentJson: JSON.stringify(document),
  };
}

function currentStoredProject(id: string, name: string, revision: number): StoredProject {
  const legacy = storedProject(id, name, "1.3.0", revision);
  const current = migrateExpectedDocument(parseDocument(legacy.documentJson));
  const { revision: currentRevision, schemaVersion, name: currentName, ...remaining } = current;
  const reordered = JSON.stringify(
    { revision: currentRevision, schemaVersion, name: currentName, ...remaining },
    null,
    4,
  );
  const escapedName = `"\\u${name.charCodeAt(0).toString(16).padStart(4, "0")}${JSON.stringify(name.slice(1)).slice(1)}`;
  return {
    ...legacy,
    lastExportedRevision: revision - 1,
    documentJson: reordered.replace(JSON.stringify(name), escapedName),
  };
}

function legacyDocument(
  id: string,
  name: string,
  schemaVersion: "1.0.0" | "1.1.0" | "1.2.0" | "1.3.0",
  revision: number,
): Record<string, unknown> {
  const environment: Record<string, unknown> = { ...fixture.environment };
  if (schemaVersion === "1.0.0") {
    delete environment["backgroundMode"];
    delete environment["lighting"];
  } else if (schemaVersion === "1.1.0") {
    environment["backgroundMode"] = "theme";
    delete environment["lighting"];
  }

  return {
    ...structuredClone(fixture),
    schemaVersion,
    id,
    name,
    revision,
    assets: fixture.assets.map((asset) => ({
      ...asset,
      uri: `asset://${asset.sha256}`,
    })),
    annotations:
      schemaVersion === "1.3.0"
        ? [
            {
              id: "legacy-status-note",
              targetId: "press-01",
              title: "Press status",
              contentKey: "press.status",
              localOffset: [0.25, 0.5, -0.75],
            },
          ]
        : [],
    environment,
  };
}

function migrateExpectedDocument(source: Record<string, unknown>): Record<string, unknown> {
  let document = structuredClone(source);
  const sourceVersion = document["schemaVersion"];
  if (sourceVersion === "1.0.0") {
    document = {
      ...document,
      schemaVersion: "1.1.0",
      environment: {
        ...(document["environment"] as Record<string, unknown>),
        backgroundMode: "custom",
      },
    };
  }
  if (document["schemaVersion"] === "1.1.0") {
    const environment = document["environment"] as Record<string, unknown>;
    document = {
      ...document,
      schemaVersion: "1.2.0",
      environment: {
        ...environment,
        background: String(environment["background"]).toUpperCase(),
        lighting: standardLighting(),
      },
    };
  }
  if (document["schemaVersion"] === "1.2.0") {
    document = { ...document, schemaVersion: "1.3.0" };
  }
  if (document["schemaVersion"] === "1.3.0") {
    const annotations = document["annotations"] as readonly Record<string, unknown>[];
    document = {
      ...document,
      schemaVersion: "1.4.0",
      annotations: annotations.map((annotation) => ({
        id: annotation["id"],
        title: annotation["title"],
        visible: true,
        locked: false,
        anchor: {
          kind: "legacy",
          targetId: annotation["targetId"],
          localOffset: annotation["localOffset"],
        },
        content: { kind: "host-content", key: annotation["contentKey"] },
        action: { type: "show-content" },
      })),
    };
  }
  return document;
}

function standardLighting(): Record<string, unknown> {
  return {
    fill: { skyColor: "#FFFFFF", groundColor: "#65706A", intensity: 1.8 },
    key: {
      color: "#FFFFFF",
      intensity: 2.2,
      directionToLight: [0.37904902178945177, 0.7580980435789035, 0.5306686305052324],
    },
  };
}

function parseDocument(documentJson: string): Record<string, unknown> {
  return JSON.parse(documentJson) as Record<string, unknown>;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value, true), null, 2);
}

function canonicalize(value: unknown, root = false): unknown {
  if (Array.isArray(value)) return value.map((item) => canonicalize(item));
  if (value === null || typeof value !== "object") return value;

  const input = value as Readonly<Record<string, unknown>>;
  const output: Record<string, unknown> = {};
  const idSortedRootArrays = new Set([
    "assets",
    "entities",
    "targets",
    "dataSources",
    "bindings",
    "ruleSets",
    "annotations",
    "views",
  ]);
  for (const key of Object.keys(input).sort()) {
    const child = input[key];
    if (root && idSortedRootArrays.has(key) && Array.isArray(child)) {
      output[key] = [...child]
        .sort((left, right) => compareText(idOf(left), idOf(right)))
        .map((item) => canonicalize(item));
    } else {
      output[key] = canonicalize(child);
    }
  }
  return output;
}

function idOf(value: unknown): string {
  return value !== null && typeof value === "object" && "id" in value ? String(value.id) : "";
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function databaseName(): string {
  return `studio-native-migration-${globalThis.crypto.randomUUID()}`;
}

function sortRecords(records: readonly StoredProject[]): readonly StoredProject[] {
  return [...records].sort((left, right) => left.id.localeCompare(right.id));
}

function observeRuntimeErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror:${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console:${message.text()}`);
  });
  return errors;
}

async function openStudio(page: Page): Promise<void> {
  await page.goto("/");
}

async function initializeProductionRepository(
  page: Page,
  dbName: string,
  failOnProjectId?: string,
): Promise<InitializationResult> {
  return page.evaluate(
    async ({ databaseName: targetDatabase, failingProjectId }) => {
      const originalPut = IDBObjectStore.prototype.put;
      const putIds: string[] = [];
      let outcome: Omit<InitializationResult, "putIds" | "prototypeRestored">;

      IDBObjectStore.prototype.put = function patchedPut(
        value: unknown,
        key?: IDBValidKey,
      ): IDBRequest<IDBValidKey> {
        if (
          this.transaction.db.name === targetDatabase &&
          this.name === "projects" &&
          value !== null &&
          typeof value === "object" &&
          "id" in value &&
          typeof value.id === "string"
        ) {
          putIds.push(value.id);
          if (value.id === failingProjectId) {
            throw new DOMException("Injected migration put failure", "QuotaExceededError");
          }
        }
        return arguments.length === 1
          ? originalPut.call(this, value)
          : originalPut.call(this, value, key as IDBValidKey);
      };

      try {
        const modulePath = "/src/project/index.ts";
        const projectModule = (await import(/* @vite-ignore */ modulePath)) as BrowserProjectModule;
        const repository = projectModule.createIndexedDbProjectRepository({
          dbName: targetDatabase,
          indexedDB,
        });
        try {
          const projects = await repository.listRecent();
          await repository.close();
          outcome = { ok: true, error: null, projectCount: projects.length };
        } catch (error) {
          outcome = {
            ok: false,
            error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
            projectCount: null,
          };
        }
      } finally {
        IDBObjectStore.prototype.put = originalPut;
      }

      return {
        ...outcome,
        putIds,
        prototypeRestored: IDBObjectStore.prototype.put === originalPut,
      };
    },
    { databaseName: dbName, failingProjectId: failOnProjectId },
  );
}

async function seedStoredProjects(
  page: Page,
  dbName: string,
  records: readonly StoredProject[],
): Promise<void> {
  await page.evaluate(
    async ({ databaseName: targetDatabase, projects }) => {
      const database = await openDatabase(targetDatabase);
      try {
        const transaction = database.transaction("projects", "readwrite");
        const completed = transactionComplete(transaction);
        const store = transaction.objectStore("projects");
        for (const project of projects) store.put(project);
        await completed;
      } finally {
        database.close();
      }

      function openDatabase(name: string): Promise<IDBDatabase> {
        return new Promise((resolveDatabase, rejectDatabase) => {
          const request = indexedDB.open(name, 1);
          request.onupgradeneeded = () => {
            const upgraded = request.result;
            if (!upgraded.objectStoreNames.contains("projects")) {
              upgraded.createObjectStore("projects", { keyPath: "id" });
            }
            if (!upgraded.objectStoreNames.contains("assets")) {
              upgraded.createObjectStore("assets", { keyPath: "sha256" });
            }
            if (!upgraded.objectStoreNames.contains("settings")) {
              upgraded.createObjectStore("settings", { keyPath: "key" });
            }
          };
          request.onsuccess = () => resolveDatabase(request.result);
          request.onerror = () =>
            rejectDatabase(request.error ?? new Error("Test database open failed."));
        });
      }

      function transactionComplete(transaction: IDBTransaction): Promise<void> {
        return new Promise((resolveTransaction, rejectTransaction) => {
          transaction.oncomplete = () => resolveTransaction();
          transaction.onabort = () =>
            rejectTransaction(transaction.error ?? new Error("Test seed transaction aborted."));
          transaction.onerror = () =>
            rejectTransaction(transaction.error ?? new Error("Test seed transaction failed."));
        });
      }
    },
    { databaseName: dbName, projects: records },
  );
}

async function readStoredDatabase(
  page: Page,
  dbName: string,
): Promise<{
  readonly version: number;
  readonly stores: readonly string[];
  readonly records: readonly StoredProject[];
}> {
  return page.evaluate(async (databaseName) => {
    const database = await new Promise<IDBDatabase>((resolveDatabase, rejectDatabase) => {
      const request = indexedDB.open(databaseName, 1);
      request.onsuccess = () => resolveDatabase(request.result);
      request.onerror = () =>
        rejectDatabase(request.error ?? new Error("Test database inspection open failed."));
    });
    try {
      const transaction = database.transaction("projects", "readonly");
      const records = await new Promise<StoredProject[]>((resolveRecords, rejectRecords) => {
        const request = transaction.objectStore("projects").getAll();
        request.onsuccess = () => resolveRecords(request.result as StoredProject[]);
        request.onerror = () =>
          rejectRecords(request.error ?? new Error("Test project inspection failed."));
      });
      return {
        version: database.version,
        stores: [...database.objectStoreNames].sort(),
        records: records.sort((left, right) => left.id.localeCompare(right.id)),
      };
    } finally {
      database.close();
    }
  }, dbName);
}

async function deleteDatabase(page: Page, dbName: string): Promise<void> {
  await page.evaluate(
    (databaseName) =>
      new Promise<void>((resolveDelete, rejectDelete) => {
        const request = indexedDB.deleteDatabase(databaseName);
        request.onsuccess = () => resolveDelete();
        request.onerror = () =>
          rejectDelete(request.error ?? new Error("Test database deletion failed."));
        request.onblocked = () => rejectDelete(new Error("Test database deletion was blocked."));
      }),
    dbName,
  );
}
