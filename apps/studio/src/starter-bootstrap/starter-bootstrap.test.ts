import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { exportSceneArchive, parseSceneDocument, type SceneDocument } from "@web3d/document";

import { bootstrapStarterProject, parseStarterDescriptor } from "./starter-bootstrap";

const FIXTURE_ROOT = resolve(process.cwd(), "tests/fixtures/m0-factory/public");
const DESCRIPTOR_URL = "https://studio.example/starter/smart-home-90sqm.json";

describe("starter bootstrap", () => {
  it("fetches, verifies and imports one ordinary repository snapshot", async () => {
    const archive = await fixtureArchive();
    const descriptor = await descriptorFor(archive);
    const fetchResource = vi.fn(async (url: string | URL | Request) => {
      const href = String(url);
      if (href === DESCRIPTOR_URL) return Response.json(descriptor);
      if (href === "https://studio.example/starter/smart-home-90sqm.scene.zip") {
        return new Response(ownedArrayBuffer(archive));
      }
      return new Response(null, { status: 404 });
    });

    const snapshot = await bootstrapStarterProject({
      descriptorUrl: DESCRIPTOR_URL,
      signal: new AbortController().signal,
      fetch: fetchResource as typeof fetch,
      now: () => new Date("2026-07-20T08:00:00.000Z"),
    });

    expect(fetchResource.mock.calls.map(([url]) => String(url))).toEqual([
      DESCRIPTOR_URL,
      "https://studio.example/starter/smart-home-90sqm.scene.zip",
    ]);
    expect(snapshot.record).toEqual({
      id: "m0-factory-cell",
      name: "M0 Factory Cell",
      createdAt: "2026-07-20T08:00:00.000Z",
      updatedAt: "2026-07-20T08:00:00.000Z",
      lastOpenedAt: "2026-07-20T08:00:00.000Z",
      lastSavedRevision: 1,
      lastExportedRevision: null,
    });
    expect(snapshot.document.schemaVersion).toBe("1.4.0");
    expect(snapshot.document.assets[0]?.uri).toMatch(/^asset:\/\/[a-f0-9]{64}$/u);
    expect(snapshot.assets).toHaveLength(1);
    await expect(snapshot.assets[0]?.blob.arrayBuffer()).resolves.toEqual(
      ownedArrayBuffer(fixtureAsset()),
    );
  });

  it("fails closed on a descriptor field, length or archive hash mismatch", async () => {
    const descriptorFailure = thrownBy(() =>
      parseStarterDescriptor({
        schemaVersion: "1.0.0",
        projectId: "starter",
        archiveUrl: "starter.zip",
        archiveSha256: "0".repeat(64),
        archiveByteLength: 1,
        extra: true,
      }),
    );
    expect(descriptorFailure).toMatchObject({
      code: "STARTER_BOOTSTRAP_FAILED",
      details: { stage: "descriptor-fields" },
    });

    const archive = await fixtureArchive();
    const valid = await descriptorFor(archive);
    await expect(
      expectBootstrapFailure({ ...valid, archiveByteLength: archive.byteLength + 1 }, archive),
    ).rejects.toMatchObject({
      code: "STARTER_BOOTSTRAP_FAILED",
      details: { stage: "archive-length" },
    });
    await expect(
      expectBootstrapFailure({ ...valid, archiveSha256: "0".repeat(64) }, archive),
    ).rejects.toMatchObject({
      code: "STARTER_BOOTSTRAP_FAILED",
      details: { stage: "archive-hash" },
    });
  });

  it("rejects non-success descriptor and archive responses", async () => {
    await expect(
      bootstrapStarterProject({
        descriptorUrl: DESCRIPTOR_URL,
        signal: new AbortController().signal,
        fetch: vi.fn(async () => new Response(null, { status: 503 })) as typeof fetch,
      }),
    ).rejects.toMatchObject({
      code: "STARTER_BOOTSTRAP_FAILED",
      details: { stage: "descriptor-fetch" },
    });

    const archive = await fixtureArchive();
    const descriptor = await descriptorFor(archive);
    const fetchResource = vi
      .fn()
      .mockResolvedValueOnce(Response.json(descriptor))
      .mockResolvedValueOnce(new Response(null, { status: 502 }));
    await expect(
      bootstrapStarterProject({
        descriptorUrl: DESCRIPTOR_URL,
        signal: new AbortController().signal,
        fetch: fetchResource as typeof fetch,
      }),
    ).rejects.toMatchObject({
      code: "STARTER_BOOTSTRAP_FAILED",
      details: { stage: "archive-fetch" },
    });
  });

  it("honors cancellation before fetching or importing", async () => {
    const controller = new AbortController();
    controller.abort(new DOMException("cancelled", "AbortError"));
    const fetchResource = vi.fn();

    await expect(
      bootstrapStarterProject({
        descriptorUrl: DESCRIPTOR_URL,
        signal: controller.signal,
        fetch: fetchResource as typeof fetch,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchResource).not.toHaveBeenCalled();
  });

  it("rejects an archive whose document does not match the pinned project ID", async () => {
    const archive = await fixtureArchive();
    const descriptor = { ...(await descriptorFor(archive)), projectId: "another-project" };
    await expect(expectBootstrapFailure(descriptor, archive)).rejects.toMatchObject({
      code: "STARTER_BOOTSTRAP_FAILED",
      details: { stage: "project-id" },
    });
  });
});

async function expectBootstrapFailure(
  descriptor: Awaited<ReturnType<typeof descriptorFor>>,
  archive: Uint8Array,
) {
  const fetchResource = vi
    .fn()
    .mockResolvedValueOnce(Response.json(descriptor))
    .mockResolvedValueOnce(new Response(ownedArrayBuffer(archive)));
  return bootstrapStarterProject({
    descriptorUrl: DESCRIPTOR_URL,
    signal: new AbortController().signal,
    fetch: fetchResource as typeof fetch,
  });
}

async function descriptorFor(archive: Uint8Array) {
  return {
    schemaVersion: "1.0.0" as const,
    projectId: "m0-factory-cell",
    archiveUrl: "./smart-home-90sqm.scene.zip",
    archiveSha256: await sha256Hex(archive),
    archiveByteLength: archive.byteLength,
  };
}

async function fixtureArchive(): Promise<Uint8Array> {
  return exportSceneArchive({
    document: fixtureDocument(),
    createdAt: "2026-07-20T00:00:00.000Z",
    resolveAssetBytes: new Map([[fixtureDocument().assets[0]!.sha256, fixtureAsset()]]),
  });
}

function fixtureDocument(): SceneDocument {
  const result = parseSceneDocument(readFileSync(resolve(FIXTURE_ROOT, "m0-scene.json"), "utf8"));
  if (!result.ok) throw new Error("Fixture SceneDocument must be valid.");
  return {
    ...result.value,
    assets: result.value.assets.map((asset) => ({
      ...asset,
      uri: `asset://${asset.sha256}`,
    })),
  };
}

function fixtureAsset(): Uint8Array {
  return readFileSync(resolve(FIXTURE_ROOT, "m0-factory-cell.glb"));
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", ownedArrayBuffer(bytes));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function ownedArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function thrownBy(operation: () => unknown): unknown {
  try {
    operation();
  } catch (error) {
    return error;
  }
  throw new Error("Expected operation to throw.");
}
