import { validateSceneDocument, type Annotation, type SceneDocument } from "@web3d/document";

import { sha256Hex } from "./hash.js";
import type { PublishSurfaceEvidence } from "./types.js";

export const TEST_ASSET_BYTES = new Uint8Array([1, 2, 3, 4, 5, 6]);

export async function publishFixture(
  options: {
    readonly anchor?: "none" | "surface" | "legacy";
    readonly revision?: number;
  } = {},
): Promise<{
  readonly document: SceneDocument;
  readonly assetBytes: Uint8Array;
  readonly evidence: readonly PublishSurfaceEvidence[];
}> {
  const sha256 = await sha256Hex(TEST_ASSET_BYTES);
  const annotation = fixtureAnnotation(options.anchor ?? "surface", sha256);
  const candidate: SceneDocument = {
    schemaVersion: "1.4.0",
    id: "publish-scene",
    name: "Publish scene",
    revision: options.revision ?? 7,
    assets: [
      {
        id: "asset-1",
        name: "Fixture asset",
        uri: `asset://${sha256}`,
        mediaType: "model/gltf-binary",
        sha256,
        byteLength: TEST_ASSET_BYTES.byteLength,
      },
    ],
    entities: [
      {
        id: "entity-1",
        type: "asset",
        assetId: "asset-1",
        parentId: null,
        name: "Fixture entity",
        visible: true,
        locked: false,
        transform: {
          position: [0, 0, 0],
          rotation: [0, 0, 0, 1],
          scale: [1, 1, 1],
        },
        metadata: {},
      },
    ],
    targets: [
      {
        id: "target-1",
        entityId: "entity-1",
        name: "Fixture target",
        businessId: "fixture-target",
        assetHash: sha256,
        nodeIndex: 0,
        metadata: {},
      },
    ],
    dataSources: [
      {
        id: "source-z",
        name: "Second source",
        adapter: "websocket",
        staleAfterMs: 1000,
        offlineAfterMs: 2000,
        options: { channel: "fixture" },
      },
      {
        id: "source-a",
        name: "First source",
        adapter: "mock",
        staleAfterMs: 1000,
        offlineAfterMs: 2000,
        options: { scenario: "steady" },
      },
    ],
    bindings: [],
    ruleSets: [],
    annotations: annotation === null ? [] : [annotation],
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
  const validation = validateSceneDocument(candidate);
  if (!validation.ok) throw new Error(validation.diagnostics[0]?.message ?? "Fixture is invalid.");
  return {
    document: validation.value,
    assetBytes: TEST_ASSET_BYTES,
    evidence:
      annotation?.anchor.kind === "surface"
        ? [
            {
              annotationId: annotation.id,
              documentId: validation.value.id,
              documentRevision: validation.value.revision,
              resolution: "resolved",
            },
          ]
        : [],
  };
}

function fixtureAnnotation(
  anchor: "none" | "surface" | "legacy",
  assetHash: string,
): Annotation | null {
  if (anchor === "none") return null;
  return {
    id: "annotation-1",
    title: "Inspection",
    visible: true,
    locked: false,
    anchor:
      anchor === "surface"
        ? {
            kind: "surface",
            entityId: "entity-1",
            assetHash,
            nodeIndex: 0,
            nodeLocalPosition: [0, 0, 0],
            nodeLocalNormal: [0, 1, 0],
          }
        : { kind: "legacy", targetId: "target-1", localOffset: [0, 0, 0] },
    content: { kind: "host-content", key: "inspection-card" },
    action: { type: "show-content" },
  };
}
