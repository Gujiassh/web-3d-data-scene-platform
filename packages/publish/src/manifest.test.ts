import { describe, expect, it } from "vitest";

import {
  buildPublishManifest,
  decodePublishManifest,
  parsePublishManifest,
  serializePublishManifest,
} from "./manifest.js";

const sceneFile = {
  path: "scene.json",
  sha256: "a".repeat(64),
  byteLength: 100,
  mediaType: "application/json" as const,
};
const assetFile = {
  path: `assets/${"b".repeat(64)}.glb`,
  sha256: "b".repeat(64),
  byteLength: 6,
  mediaType: "model/gltf-binary" as const,
};

describe("publish manifest", () => {
  it("builds sorted strict metadata and round-trips canonical bytes", () => {
    const manifest = buildPublishManifest({
      documentId: "scene-1",
      revision: 3,
      files: [sceneFile, assetFile],
      requirements: {
        dataSources: [
          { sourceId: "z", adapter: "websocket" },
          { sourceId: "a", adapter: "mock" },
        ],
        trustedContentKeys: ["z-card", "a-card"],
      },
    });

    expect(manifest.files.map((file) => file.path)).toEqual([assetFile.path, "scene.json"]);
    expect(manifest.requirements.dataSources.map((source) => source.sourceId)).toEqual(["a", "z"]);
    expect(manifest.requirements.trustedContentKeys).toEqual(["a-card", "z-card"]);
    const bytes = serializePublishManifest(manifest);
    expect(new TextDecoder().decode(bytes).endsWith("\n")).toBe(true);
    expect(decodePublishManifest(bytes)).toEqual(manifest);
  });

  it.each([
    ["unknown root property", { extra: true }],
    ["unknown version", { publishVersion: "2.0.0" }],
    ["unsafe path", { files: [{ ...sceneFile, path: "../scene.json" }, assetFile] }],
    ["duplicate path", { files: [sceneFile, sceneFile] }],
    ["unsorted files", { files: [sceneFile, assetFile] }],
  ])("rejects %s", (_label, override) => {
    const value = {
      publishVersion: "1.0.0",
      sceneSchemaVersion: "1.4.0",
      documentId: "scene-1",
      revision: 3,
      entry: "scene.json",
      files: [assetFile, sceneFile],
      requirements: { dataSources: [], trustedContentKeys: [] },
      ...override,
    };
    expect(() => parsePublishManifest(value)).toThrow();
  });

  it("rejects non-canonical manifest bytes", () => {
    const manifest = buildPublishManifest({
      documentId: "scene-1",
      revision: 3,
      files: [sceneFile],
      requirements: { dataSources: [], trustedContentKeys: [] },
    });
    const nonCanonical = new TextEncoder().encode(JSON.stringify(manifest));
    expect(() => decodePublishManifest(nonCanonical)).toThrow("canonical encoding");
  });
});
