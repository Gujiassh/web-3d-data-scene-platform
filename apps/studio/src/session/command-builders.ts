import type {
  DocumentCommand,
  DuplicateSubtreeCommand,
  ImportAssetInstanceCommand,
  SceneAsset,
  SceneDocument,
} from "@web3d/document";

import { studioAppErrors } from "../errors";

export interface StableIdFactory {
  next(kind: "asset" | "entity" | "target", sourceId?: string): string;
}

export interface ImportModelDescriptor {
  readonly fileName: string;
  readonly mediaType: SceneAsset["mediaType"];
  readonly byteLength: number;
  readonly sha256: string;
  readonly stats: NonNullable<SceneAsset["stats"]>;
  readonly parentId: string | null;
}

export interface ImportModelNaming {
  readonly fallbackName?: string;
}

export function buildDuplicateSubtreeCommand(
  document: SceneDocument,
  rootEntityId: string,
  ids: StableIdFactory,
): DuplicateSubtreeCommand {
  const entityIds = collectSubtreeIds(document, rootEntityId);
  if (
    document.entities.some((entity) => entityIds.includes(entity.id) && entity.type === "light")
  ) {
    throw new TypeError("LightEntity must be duplicated through add-light-entity.");
  }
  const entitySet = new Set(entityIds);
  const entityIdMap = Object.fromEntries(
    entityIds.map((entityId) => [entityId, ids.next("entity", entityId)]),
  );
  const targetIdMap = Object.fromEntries(
    document.targets
      .filter((target) => entitySet.has(target.entityId))
      .map((target) => [target.id, ids.next("target", target.id)]),
  );
  return { type: "duplicate-subtree", rootEntityId, entityIdMap, targetIdMap };
}

export function buildImportAssetCommand(
  document: SceneDocument,
  descriptor: ImportModelDescriptor,
  ids: StableIdFactory,
  naming: ImportModelNaming = {},
): ImportAssetInstanceCommand {
  const matchingAssets = document.assets.filter((asset) => asset.sha256 === descriptor.sha256);
  if (matchingAssets.length > 1) {
    throw studioAppErrors.assetHashAmbiguous(descriptor.sha256, matchingAssets.length);
  }

  const asset = matchingAssets[0] ?? createAsset(descriptor, ids, naming);
  if (
    asset.mediaType !== descriptor.mediaType ||
    asset.byteLength !== descriptor.byteLength ||
    (asset.stats !== undefined && !sameStats(asset.stats, descriptor.stats))
  ) {
    throw studioAppErrors.assetHashConflict(descriptor.sha256);
  }

  const entityId = ids.next("entity");
  const targetId = ids.next("target");
  const name = modelDisplayName(descriptor.fileName, naming.fallbackName);
  return {
    type: "import-asset-instance",
    asset,
    entity: {
      id: entityId,
      type: "asset",
      parentId: descriptor.parentId,
      name,
      visible: true,
      locked: false,
      transform: {
        position: [0, 0, 0],
        rotation: [0, 0, 0, 1],
        scale: [1, 1, 1],
      },
      assetId: asset.id,
      metadata: {},
    },
    target: {
      id: targetId,
      entityId,
      name,
      assetHash: descriptor.sha256,
      nodeIndex: null,
      metadata: {},
    },
  };
}

export function createBrowserIdFactory(): StableIdFactory {
  return {
    next(kind) {
      return `${kind}-${globalThis.crypto.randomUUID()}`;
    },
  };
}

export function commandEntityId(command: DocumentCommand): string | null {
  if (command.type === "add-light-entity" || command.type === "update-light-entity") {
    return command.after.id;
  }
  if (command.type === "remove-light-entity") return command.before.id;
  if ("entityId" in command) return command.entityId;
  if (command.type === "duplicate-subtree" || command.type === "delete-subtree") {
    return command.rootEntityId;
  }
  return command.type === "import-asset-instance" ? command.entity.id : null;
}

function createAsset(
  descriptor: ImportModelDescriptor,
  ids: StableIdFactory,
  naming: ImportModelNaming,
): SceneAsset {
  return {
    id: ids.next("asset"),
    name: modelDisplayName(descriptor.fileName, naming.fallbackName),
    uri: `asset://${descriptor.sha256}`,
    mediaType: descriptor.mediaType,
    sha256: descriptor.sha256,
    byteLength: descriptor.byteLength,
    stats: { ...descriptor.stats },
  };
}

function collectSubtreeIds(document: SceneDocument, rootEntityId: string): readonly string[] {
  if (!document.entities.some((entity) => entity.id === rootEntityId)) {
    throw studioAppErrors.entityNotFound(rootEntityId);
  }
  const output: string[] = [];
  const queue = [rootEntityId];
  while (queue.length > 0) {
    const entityId = queue.shift();
    if (entityId === undefined) continue;
    output.push(entityId);
    queue.push(
      ...document.entities
        .filter((entity) => entity.parentId === entityId)
        .map((entity) => entity.id),
    );
  }
  return output;
}

function modelDisplayName(fileName: string, fallbackName = "Imported model"): string {
  const name = fileName.replaceAll("\\", "/").split("/").at(-1) ?? fileName;
  return name.replace(/\.(glb|gltf)$/iu, "").trim() || fallbackName;
}

function sameStats(
  left: NonNullable<SceneAsset["stats"]>,
  right: NonNullable<SceneAsset["stats"]>,
): boolean {
  return (
    left.nodeCount === right.nodeCount &&
    left.meshCount === right.meshCount &&
    left.materialCount === right.materialCount &&
    left.triangleCount === right.triangleCount
  );
}
