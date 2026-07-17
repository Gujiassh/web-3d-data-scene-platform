import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";
import { unzipSync } from "fflate";

import type { SceneDocument } from "../types.js";
import { exportSceneArchive, importSceneArchive } from "./codec.js";
import { sha256Hex } from "./hash.js";
import { exportCanonicalSceneJson, importCanonicalSceneJson } from "./json.js";
import { buildArchiveManifest, parseArchiveManifest } from "./manifest.js";
import { encodeDeterministicZip } from "./zip.js";

const fixtureUrl = new URL(
  "../../../../specs/001-product-foundation/contracts/scene.example.json",
  import.meta.url,
);
const manifestSchemaUrl = new URL(
  "../../../../specs/001-product-foundation/contracts/archive-manifest.schema.json",
  import.meta.url,
);
const manifestExampleUrl = new URL(
  "../../../../specs/001-product-foundation/contracts/archive-manifest.example.json",
  import.meta.url,
);
const manifestContractUrl = new URL(
  "../../../../specs/001-product-foundation/contracts/archive-manifest.md",
  import.meta.url,
);
const createdAt = "2026-07-14T08:00:00Z";

describe("archive codec", () => {
  it("keeps the canonical manifest SSoT aligned with SceneDocument 1.3", () => {
    const schema = JSON.parse(readFileSync(manifestSchemaUrl, "utf8")) as {
      properties: { sceneSchemaVersion: { enum: string[] } };
    };
    const example = JSON.parse(readFileSync(manifestExampleUrl, "utf8")) as unknown;
    const contract = readFileSync(manifestContractUrl, "utf8");

    expect(schema.properties.sceneSchemaVersion.enum).toEqual(["1.0.0", "1.1.0", "1.2.0", "1.3.0"]);
    expect(parseArchiveManifest(example)).toMatchObject({
      archiveVersion: "1.0.0",
      sceneSchemaVersion: "1.3.0",
    });
    expect(contract).toContain(
      "Import accepts raw SceneDocument 1.0.0, 1.1.0, 1.2.0 and 1.3.0 payloads",
    );
    expect(contract).toContain("Export accepts and writes only current SceneDocument 1.3.0");
    expect(contract).toContain("`archiveVersion` remains\n  1.0.0");
  });

  it("round-trips canonical JSON without mutating the document", () => {
    const document = loadLocalFixture();

    const bytes = exportCanonicalSceneJson(document);
    const imported = importCanonicalSceneJson(bytes);

    expect(imported).toEqual(document);
  });

  it("exports only current documents and writes the requested scene schema version", () => {
    const current = loadLocalFixture();
    const legacy = legacyDocument(current, "1.2.0");

    expect(() => exportCanonicalSceneJson(legacy as unknown as SceneDocument)).toThrow();
    const manifest = buildArchiveManifest({
      createdAt,
      sceneBytes: new Uint8Array([1]),
      sceneSha256: "a".repeat(64),
      sceneSchemaVersion: "1.3.0",
      assets: [],
    });
    expect(manifest.archiveVersion).toBe("1.0.0");
    expect(manifest.sceneSchemaVersion).toBe("1.3.0");

    const imported = importCanonicalSceneJson(new TextEncoder().encode(JSON.stringify(legacy)));
    expect(imported).toMatchObject({
      schemaVersion: "1.3.0",
      revision: current.revision,
      environment: {
        backgroundMode: current.environment.backgroundMode,
        background: current.environment.background,
        lighting: current.environment.lighting,
      },
    });
  });

  it("exports and imports a deterministic archive with local URI normalization", async () => {
    const { document, assetBytes } = await loadFixtureWithAsset();
    const assets = new Map([[document.assets[0]!.sha256, assetBytes]]);

    const first = await exportSceneArchive({ document, createdAt, resolveAssetBytes: assets });
    const second = await exportSceneArchive({ document, createdAt, resolveAssetBytes: assets });

    expect(first).toEqual(second);

    const imported = await importSceneArchive(first);
    expect(imported.document).toEqual(document);
    expect(imported.assets).toHaveLength(1);
    expect(imported.assets[0]?.bytes).toEqual(assetBytes);

    const zip = unzipSync(first);
    const sceneJson = new TextDecoder().decode(zip["scene.json"]!);
    expect(sceneJson).toContain(`"uri": "assets/${document.assets[0]!.sha256}.glb"`);
    expect(JSON.parse(sceneJson)).toMatchObject({ schemaVersion: "1.3.0" });
    expect(JSON.parse(new TextDecoder().decode(zip["manifest.json"]!))).toMatchObject({
      archiveVersion: "1.0.0",
      sceneSchemaVersion: "1.3.0",
    });
  });

  it("deduplicates shared asset payloads while preserving every SceneAsset record", async () => {
    const { document, assetBytes } = await loadFixtureWithAsset();
    const duplicateDocument = withDuplicateAsset(document);
    let resolveCount = 0;

    const archive = await exportSceneArchive({
      document: duplicateDocument,
      createdAt,
      resolveAssetBytes: (sha256) => {
        expect(sha256).toBe(document.assets[0]!.sha256);
        resolveCount += 1;
        return assetBytes;
      },
    });

    expect(resolveCount).toBe(1);
    const zip = unzipSync(archive);
    expect(Object.keys(zip).filter((path) => path.startsWith("assets/"))).toHaveLength(1);
    const manifest = JSON.parse(new TextDecoder().decode(zip["manifest.json"]!)) as {
      files: Array<{ path: string }>;
    };
    expect(manifest.files.filter((file) => file.path.startsWith("assets/"))).toHaveLength(1);

    const imported = await importSceneArchive(archive);
    expect(imported.document).toEqual(duplicateDocument);
    expect(imported.document.assets).toHaveLength(2);
    expect(imported.assets).toHaveLength(1);
    expect(imported.assets[0]?.bytes).toEqual(assetBytes);
  });

  it("rejects conflicting metadata for assets sharing a SHA during export", async () => {
    const { document, assetBytes } = await loadFixtureWithAsset();
    const resolver = new Map([[document.assets[0]!.sha256, assetBytes]]);
    const mediaTypeConflict = withDuplicateAsset(document, {
      mediaType: "model/gltf+json",
    });
    const byteLengthConflict = withDuplicateAsset(document, {
      byteLength: assetBytes.byteLength + 1,
    });

    await expect(
      exportSceneArchive({ document: mediaTypeConflict, createdAt, resolveAssetBytes: resolver }),
    ).rejects.toThrow(/conflicting media types/);
    await expect(
      exportSceneArchive({ document: byteLengthConflict, createdAt, resolveAssetBytes: resolver }),
    ).rejects.toThrow(/conflicting byte lengths/);
  });

  it("rejects conflicting metadata for assets sharing a SHA during import", async () => {
    const mediaTypeConflict = await archiveWithDuplicateAsset({
      mediaType: "model/gltf+json",
    });
    const byteLengthConflict = await archiveWithDuplicateAsset({ byteLengthDelta: 1 });

    await expect(importSceneArchive(mediaTypeConflict)).rejects.toThrow(/conflicting media types/);
    await expect(importSceneArchive(byteLengthConflict)).rejects.toThrow(
      /conflicting byte lengths/,
    );
  });

  it("rejects session and runtime fields in canonical JSON import", () => {
    const payload = JSON.parse(
      new TextDecoder().decode(exportCanonicalSceneJson(loadLocalFixture())),
    ) as Record<string, unknown>;
    payload["lastExportedRevision"] = 9;
    payload["activeTool"] = "move";

    expect(() =>
      importCanonicalSceneJson(new TextEncoder().encode(JSON.stringify(payload))),
    ).toThrow(/SCHEMA_ADDITIONAL_PROPERTY/);
  });

  it("rejects duplicate and extra ZIP payload paths", async () => {
    const zip = await exportFixtureArchive();
    const files = unzipSync(zip);
    files["extra.bin"] = new Uint8Array([9]);

    await expect(importSceneArchive(zipFromFiles(files))).rejects.toThrow(
      /payload count does not match|payload mismatch/,
    );
  });

  it("rejects a manifest scene version that differs from raw scene.json", async () => {
    const zip = await exportFixtureArchive();
    const files = unzipSync(zip);
    const scene = JSON.parse(new TextDecoder().decode(files["scene.json"]!)) as {
      schemaVersion: string;
    };
    const manifest = JSON.parse(new TextDecoder().decode(files["manifest.json"]!)) as Record<
      string,
      unknown
    >;
    manifest["sceneSchemaVersion"] = scene.schemaVersion === "1.0.0" ? "1.1.0" : "1.0.0";
    files["manifest.json"] = new TextEncoder().encode(JSON.stringify(manifest));

    await expect(importSceneArchive(zipFromFiles(files))).rejects.toThrow(/does not match/);
  });

  it.each(["1.0.0", "1.1.0", "1.2.0"] as const)(
    "imports a %s archive as a current 1.3 document",
    async (legacyVersion) => {
      const zip = await exportFixtureArchive();
      const files = unzipSync(zip);
      const current = importCanonicalSceneJson(files["scene.json"]!);
      const legacy = legacyDocument(current, legacyVersion);
      files["scene.json"] = new TextEncoder().encode(JSON.stringify(legacy));
      const manifest = JSON.parse(new TextDecoder().decode(files["manifest.json"]!)) as {
        sceneSchemaVersion: string;
        files: Array<Record<string, unknown>>;
      };
      manifest.sceneSchemaVersion = legacyVersion;
      manifest.files = await Promise.all(
        manifest.files.map(async (file) =>
          file["path"] === "scene.json"
            ? {
                ...file,
                byteLength: files["scene.json"]!.byteLength,
                sha256: await sha256Hex(files["scene.json"]!),
              }
            : file,
        ),
      );
      files["manifest.json"] = new TextEncoder().encode(JSON.stringify(manifest));

      const imported = await importSceneArchive(zipFromFiles(files));
      expect(imported.manifest.sceneSchemaVersion).toBe(legacyVersion);
      expect(imported.document).toMatchObject({
        schemaVersion: "1.3.0",
        revision: current.revision,
        environment: {
          backgroundMode: legacyVersion === "1.0.0" ? "custom" : current.environment.backgroundMode,
          background: current.environment.background,
          lighting: current.environment.lighting,
        },
      });
    },
  );

  it("rejects unsafe asset paths from the manifest", async () => {
    const zip = await exportFixtureArchive();
    const files = unzipSync(zip);
    const manifest = JSON.parse(new TextDecoder().decode(files["manifest.json"]!)) as {
      files: Array<Record<string, unknown>>;
    };
    manifest.files = manifest.files.map((file) =>
      file.path === "scene.json" ? file : { ...file, path: "../escape.glb" },
    );
    files["manifest.json"] = new TextEncoder().encode(JSON.stringify(manifest));

    await expect(importSceneArchive(zipFromFiles(files))).rejects.toThrow(/not safe/);
  });

  it("rejects manifest and payload hash, length, and media type mismatches", async () => {
    const zip = await exportFixtureArchive();
    const files = unzipSync(zip);
    const manifest = JSON.parse(new TextDecoder().decode(files["manifest.json"]!)) as {
      files: Array<Record<string, unknown>>;
    };
    manifest.files = manifest.files.map((file) =>
      file.path === "scene.json"
        ? file
        : { ...file, sha256: "b".repeat(64), byteLength: 123, mediaType: "model/gltf+json" },
    );
    files["manifest.json"] = new TextEncoder().encode(JSON.stringify(manifest));

    await expect(importSceneArchive(zipFromFiles(files))).rejects.toThrow(
      /media type mismatch|length mismatch|hash mismatch/,
    );
  });

  it("rejects missing assets declared by the manifest", async () => {
    const zip = await exportFixtureArchive();
    const files = unzipSync(zip);
    delete files[Object.keys(files).find((path) => path.startsWith("assets/"))!];

    await expect(importSceneArchive(zipFromFiles(files))).rejects.toThrow(
      /payload count does not match|missing/,
    );
  });

  it("rejects runtime fields inside archive scene.json", async () => {
    const zip = await exportFixtureArchive();
    const files = unzipSync(zip);
    const scene = JSON.parse(new TextDecoder().decode(files["scene.json"]!)) as Record<
      string,
      unknown
    >;
    scene["currentSelection"] = "press-01";
    files["scene.json"] = new TextEncoder().encode(JSON.stringify(scene));

    const manifest = JSON.parse(new TextDecoder().decode(files["manifest.json"]!)) as {
      files: Array<Record<string, unknown>>;
    };
    manifest.files = await Promise.all(
      manifest.files.map(async (file) =>
        file.path === "scene.json"
          ? {
              ...file,
              byteLength: files["scene.json"]!.byteLength,
              sha256: await sha256Hex(files["scene.json"]!),
            }
          : file,
      ),
    );
    files["manifest.json"] = new TextEncoder().encode(JSON.stringify(manifest));

    await expect(importSceneArchive(zipFromFiles(files))).rejects.toThrow(
      /SCHEMA_ADDITIONAL_PROPERTY/,
    );
  });
});

function loadLocalFixture(): SceneDocument {
  const fixture = importCanonicalSceneJson(
    new TextEncoder().encode(readFileSync(fixtureUrl, "utf8")),
  );
  return {
    ...fixture,
    assets: fixture.assets.map((asset) => ({
      ...asset,
      uri: `asset://${asset.sha256}`,
    })),
  };
}

function legacyDocument(
  document: SceneDocument,
  version: "1.0.0" | "1.1.0" | "1.2.0",
): Record<string, unknown> {
  const environment = { ...document.environment } as Record<string, unknown>;
  if (version !== "1.2.0") delete environment["lighting"];
  if (version === "1.0.0") delete environment["backgroundMode"];
  return { ...document, schemaVersion: version, environment };
}

async function loadFixtureWithAsset(): Promise<{
  document: SceneDocument;
  assetBytes: Uint8Array;
}> {
  const assetBytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
  const sha = await sha256Hex(assetBytes);
  return {
    document: withAssetPayload(loadLocalFixture(), {
      sha256: sha,
      uri: `asset://${sha}`,
      byteLength: assetBytes.byteLength,
    }),
    assetBytes,
  };
}

function withAssetPayload(
  document: SceneDocument,
  asset: { sha256: string; uri: string; byteLength: number },
): SceneDocument {
  const first = document.assets[0]!;
  const targets = document.targets.map((target) => ({ ...target, assetHash: asset.sha256 }));
  return {
    ...document,
    assets: [
      {
        ...first,
        sha256: asset.sha256,
        uri: asset.uri,
        byteLength: asset.byteLength,
      },
    ],
    targets,
  };
}

function withDuplicateAsset(
  document: SceneDocument,
  overrides: Partial<SceneDocument["assets"][number]> = {},
): SceneDocument {
  const first = document.assets[0]!;
  const mediaType = overrides.mediaType ?? first.mediaType;
  const uri =
    mediaType === first.mediaType
      ? first.uri
      : first.uri.replace(/\.(glb|gltf)$/, mediaType === "model/gltf-binary" ? ".glb" : ".gltf");

  return {
    ...document,
    assets: [
      ...document.assets,
      {
        ...first,
        id: `${first.id}-duplicate`,
        name: `${first.name} duplicate`,
        uri,
        ...overrides,
      },
    ],
  };
}

async function archiveWithDuplicateAsset(options: {
  readonly mediaType?: SceneDocument["assets"][number]["mediaType"];
  readonly byteLengthDelta?: number;
}): Promise<Uint8Array> {
  const zip = await exportFixtureArchive();
  const files = unzipSync(zip);
  const scene = importCanonicalSceneJson(files["scene.json"]!);
  const first = scene.assets[0]!;
  const document = withDuplicateAsset(scene, {
    mediaType: options.mediaType ?? first.mediaType,
    byteLength: first.byteLength + (options.byteLengthDelta ?? 0),
  });
  const sceneBytes = exportCanonicalSceneJson(document);
  files["scene.json"] = new Uint8Array(sceneBytes.byteLength);
  files["scene.json"].set(sceneBytes);

  const manifest = JSON.parse(new TextDecoder().decode(files["manifest.json"]!)) as {
    files: Array<Record<string, unknown>>;
  };
  manifest.files = await Promise.all(
    manifest.files.map(async (file) =>
      file.path === "scene.json"
        ? {
            ...file,
            byteLength: files["scene.json"]!.byteLength,
            sha256: await sha256Hex(files["scene.json"]!),
          }
        : file,
    ),
  );
  files["manifest.json"] = new TextEncoder().encode(JSON.stringify(manifest));
  return zipFromFiles(files);
}

async function exportFixtureArchive(): Promise<Uint8Array> {
  const { document, assetBytes } = await loadFixtureWithAsset();
  return exportSceneArchive({
    document,
    createdAt,
    resolveAssetBytes: new Map([[document.assets[0]!.sha256, assetBytes]]),
  });
}

function zipFromFiles(files: Record<string, Uint8Array>): Uint8Array {
  const entries = new Map<string, Uint8Array>();
  for (const path of Object.keys(files)) {
    entries.set(path, files[path]!);
  }
  return encodeDeterministicZip(entries);
}
