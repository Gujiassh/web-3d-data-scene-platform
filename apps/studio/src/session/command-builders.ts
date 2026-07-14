import type {
  DocumentCommand,
  DuplicateSubtreeCommand,
  ImportAssetInstanceCommand,
  SceneAsset,
  SceneDocument,
} from "@web3d/document";

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

export function buildDuplicateSubtreeCommand(
  document: SceneDocument,
  rootEntityId: string,
  ids: StableIdFactory,
): DuplicateSubtreeCommand {
  const entityIds = collectSubtreeIds(document, rootEntityId);
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
): ImportAssetInstanceCommand {
  const matchingAssets = document.assets.filter((asset) => asset.sha256 === descriptor.sha256);
  if (matchingAssets.length > 1) {
    throw new Error(`Asset hash ${descriptor.sha256} maps to multiple SceneAsset records.`);
  }

  const asset = matchingAssets[0] ?? createAsset(descriptor, ids);
  if (
    asset.mediaType !== descriptor.mediaType ||
    asset.byteLength !== descriptor.byteLength ||
    (asset.stats !== undefined && !sameStats(asset.stats, descriptor.stats))
  ) {
    throw new Error(`Asset hash ${descriptor.sha256} conflicts with the existing SceneAsset.`);
  }

  const entityId = ids.next("entity");
  const targetId = ids.next("target");
  const name = modelDisplayName(descriptor.fileName);
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
  if ("entityId" in command) return command.entityId;
  if (command.type === "duplicate-subtree" || command.type === "delete-subtree") {
    return command.rootEntityId;
  }
  return command.type === "import-asset-instance" ? command.entity.id : null;
}

function createAsset(descriptor: ImportModelDescriptor, ids: StableIdFactory): SceneAsset {
  return {
    id: ids.next("asset"),
    name: modelDisplayName(descriptor.fileName),
    uri: `asset://${descriptor.sha256}`,
    mediaType: descriptor.mediaType,
    sha256: descriptor.sha256,
    byteLength: descriptor.byteLength,
    stats: { ...descriptor.stats },
  };
}

function collectSubtreeIds(document: SceneDocument, rootEntityId: string): readonly string[] {
  if (!document.entities.some((entity) => entity.id === rootEntityId)) {
    throw new Error(`Entity ${rootEntityId} does not exist.`);
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

function modelDisplayName(fileName: string): string {
  const name = fileName.replaceAll("\\", "/").split("/").at(-1) ?? fileName;
  return name.replace(/\.(glb|gltf)$/iu, "").trim() || "Imported model";
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
