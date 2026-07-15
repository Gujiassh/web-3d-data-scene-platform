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

import type { SceneDocument } from "@web3d/document";

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
  const document = JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as SceneDocument;
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
