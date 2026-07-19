import { describe, expect, it } from "vitest";

import { serializeSceneDocument, type SceneDocument } from "@web3d/document";

import { buildStudioPublish } from "./studio-publish";

describe("Studio publish service", () => {
  it("builds without mutating the authoritative document or asset bytes", async () => {
    const document = emptyDocument();
    const beforeDocument = serializeSceneDocument(document);

    const result = await buildStudioPublish({
      document,
      surfaceEvidence: [],
      resolveAssetBytes: () => {
        throw new Error("No assets expected.");
      },
      signal: new AbortController().signal,
    });

    expect(result.status).toBe("ready");
    expect(serializeSceneDocument(document)).toBe(beforeDocument);
  });

  it("returns blockers without an artifact", async () => {
    const document = { ...emptyDocument(), id: "" };
    const result = await buildStudioPublish({
      document,
      surfaceEvidence: [],
      resolveAssetBytes: () => {
        throw new Error("No assets expected.");
      },
      signal: new AbortController().signal,
    });

    expect(result).toMatchObject({
      status: "blocked",
      blockers: [{ code: "PUBLISH_DOCUMENT_INVALID" }],
    });
  });

  it("does not return bytes after cancellation", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      buildStudioPublish({
        document: emptyDocument(),
        surfaceEvidence: [],
        resolveAssetBytes: () => {
          throw new Error("No assets expected.");
        },
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});

function emptyDocument(): SceneDocument {
  return {
    schemaVersion: "1.4.0",
    id: "publish-studio-test",
    name: "Publish Studio test",
    revision: 3,
    assets: [],
    entities: [],
    targets: [],
    dataSources: [],
    bindings: [],
    ruleSets: [],
    annotations: [],
    views: [],
    environment: {
      backgroundMode: "theme",
      background: "#F4F6F5",
      grid: true,
      unit: "m",
      upAxis: "Y",
      lighting: {
        fill: { skyColor: "#FFFFFF", groundColor: "#65706A", intensity: 1.8 },
        key: {
          color: "#FFFFFF",
          intensity: 2.2,
          directionToLight: [0.37904902178945177, 0.7580980435789035, 0.5306686305052324],
        },
      },
    },
  };
}
