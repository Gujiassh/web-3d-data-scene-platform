import type { SceneDocument } from "@web3d/document";

import { ownedBytes } from "./hash.js";
import type { PublishRequirements, ReadyPublishAsset, ReadyPublishSnapshot } from "./types.js";

interface ReadyPublishData {
  readonly document: SceneDocument;
  readonly assets: readonly ReadyPublishAsset[];
  readonly requirements: PublishRequirements;
}

const readySnapshots = new WeakMap<ReadyPublishSnapshot, ReadyPublishData>();

export function createReadyPublishSnapshot(data: ReadyPublishData): ReadyPublishSnapshot {
  const publicValue = cloneData(data);
  readySnapshots.set(publicValue, cloneData(data));
  return publicValue;
}

export function requireReadyPublishSnapshot(value: ReadyPublishSnapshot): ReadyPublishData {
  const data = readySnapshots.get(value);
  if (data === undefined) {
    throw new Error("Publish bundle requires a snapshot returned by inspectPublishReadiness.");
  }
  return cloneData(data);
}

function cloneData(data: ReadyPublishData): ReadyPublishData {
  return {
    document: structuredClone(data.document),
    assets: data.assets.map((asset) => ({ ...asset, bytes: ownedBytes(asset.bytes) })),
    requirements: {
      dataSources: data.requirements.dataSources.map((source) => ({ ...source })),
      trustedContentKeys: [...data.requirements.trustedContentKeys],
    },
  };
}
