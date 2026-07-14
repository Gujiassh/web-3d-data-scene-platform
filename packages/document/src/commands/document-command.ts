import { validateSceneDocument } from "../validate.js";
import type {
  AssetEntity,
  GroupEntity,
  SceneAsset,
  SceneDocument,
  SceneEntity,
  SceneTarget,
  Transform,
} from "../types.js";
import type { DocumentCommand, ImportAssetInstanceCommand } from "./types.js";

export function executeDocumentCommand(
  document: SceneDocument,
  command: DocumentCommand,
): SceneDocument {
  const candidate = applyCommand(document, command);
  return validateCommandResult(candidate);
}

function applyCommand(document: SceneDocument, command: DocumentCommand): SceneDocument {
  switch (command.type) {
    case "rename-entity":
      return reviseDocument(document, {
        entities: replaceEntity(document.entities, command.entityId, (entity) => ({
          ...entity,
          name: command.name,
        })),
      });
    case "set-entity-visibility":
      return reviseDocument(document, {
        entities: replaceEntity(document.entities, command.entityId, (entity) => ({
          ...entity,
          visible: command.visible,
        })),
      });
    case "set-entity-lock":
      return reviseDocument(document, {
        entities: replaceEntity(document.entities, command.entityId, (entity) => ({
          ...entity,
          locked: command.locked,
        })),
      });
    case "transform-entity":
      return applyTransformCommand(document, command.entityId, command.before, command.after);
    case "duplicate-subtree":
      return duplicateSubtree(document, command);
    case "delete-subtree":
      return deleteSubtree(document, command.rootEntityId);
    case "import-asset-instance":
      return importAssetInstance(document, command);
  }
}

function applyTransformCommand(
  document: SceneDocument,
  entityId: string,
  before: Transform,
  after: Transform,
): SceneDocument {
  return reviseDocument(document, {
    entities: replaceEntity(document.entities, entityId, (entity) => {
      if (entity.locked) {
        throw new Error(`Locked entity '${entityId}' cannot be transformed.`);
      }
      if (!transformsEqual(entity.transform, before)) {
        throw new Error(`Transform before snapshot does not match entity '${entityId}'.`);
      }
      return {
        ...entity,
        transform: cloneTransform(after),
      };
    }),
  });
}

function duplicateSubtree(
  document: SceneDocument,
  command: Extract<DocumentCommand, { type: "duplicate-subtree" }>,
): SceneDocument {
  const subtreeIds = collectSubtreeEntityIds(document.entities, command.rootEntityId);
  const subtreeIdSet = new Set(subtreeIds);
  const documentEntityIds = new Set(document.entities.map((entity) => entity.id));
  const documentTargetIds = new Set(document.targets.map((target) => target.id));
  const usedNewEntityIds = new Set<string>();
  const usedNewTargetIds = new Set<string>();
  const entitiesById = new Map(document.entities.map((entity) => [entity.id, entity]));

  const duplicatedEntities = subtreeIds.map((sourceId) => {
    const source = entitiesById.get(sourceId);
    const nextId = command.entityIdMap[sourceId];
    if (source === undefined) throw new Error(`Entity '${sourceId}' does not exist.`);
    if (nextId === undefined) throw new Error(`Missing duplicate entity ID for '${sourceId}'.`);
    if (documentEntityIds.has(nextId) || usedNewEntityIds.has(nextId)) {
      throw new Error(`Duplicate entity ID '${nextId}' is already in use.`);
    }
    usedNewEntityIds.add(nextId);

    const nextParentId =
      source.parentId !== null && subtreeIdSet.has(source.parentId)
        ? requireMappedId(command.entityIdMap, source.parentId, "entity")
        : source.parentId;
    return cloneEntityForDuplicate(source, nextId, nextParentId);
  });

  const duplicatedTargets = document.targets
    .filter((target) => subtreeIdSet.has(target.entityId))
    .map((target) => {
      const nextId = command.targetIdMap[target.id];
      if (nextId === undefined) throw new Error(`Missing duplicate target ID for '${target.id}'.`);
      if (documentTargetIds.has(nextId) || usedNewTargetIds.has(nextId)) {
        throw new Error(`Duplicate target ID '${nextId}' is already in use.`);
      }
      usedNewTargetIds.add(nextId);
      return cloneTargetForDuplicate(
        target,
        nextId,
        requireMappedId(command.entityIdMap, target.entityId, "entity"),
      );
    });

  return reviseDocument(document, {
    entities: [...document.entities, ...duplicatedEntities],
    targets: [...document.targets, ...duplicatedTargets],
  });
}

function deleteSubtree(document: SceneDocument, rootEntityId: string): SceneDocument {
  const subtreeIds = new Set(collectSubtreeEntityIds(document.entities, rootEntityId));
  const removedTargetIds = new Set(
    document.targets.filter((target) => subtreeIds.has(target.entityId)).map((target) => target.id),
  );

  return reviseDocument(document, {
    entities: document.entities.filter((entity) => !subtreeIds.has(entity.id)),
    targets: document.targets.filter((target) => !removedTargetIds.has(target.id)),
    bindings: document.bindings.filter((binding) => !removedTargetIds.has(binding.targetId)),
    annotations: document.annotations.filter(
      (annotation) => !removedTargetIds.has(annotation.targetId),
    ),
  });
}

function importAssetInstance(
  document: SceneDocument,
  command: ImportAssetInstanceCommand,
): SceneDocument {
  const existingAsset = document.assets.find((asset) => asset.id === command.asset.id);
  if (existingAsset === undefined) {
    assertUnusedId(document, command.asset.id, "asset");
  } else if (!assetsEqual(existingAsset, command.asset)) {
    throw new Error(`Asset ID '${command.asset.id}' conflicts with an existing asset.`);
  }
  assertUnusedId(document, command.entity.id, "entity");
  assertUnusedId(document, command.target.id, "target");

  if (command.entity.type !== "asset") {
    throw new Error("Imported instance entity must be an asset entity.");
  }
  if (command.entity.assetId !== command.asset.id) {
    throw new Error("Imported instance entity must reference the imported asset.");
  }
  if (command.target.entityId !== command.entity.id) {
    throw new Error("Imported instance target must reference the imported entity.");
  }
  if (command.target.assetHash !== command.asset.sha256) {
    throw new Error("Imported instance target must use the imported asset hash.");
  }
  assertParentExists(document.entities, command.entity.parentId);

  return reviseDocument(document, {
    assets:
      existingAsset === undefined
        ? [...document.assets, cloneAsset(command.asset)]
        : document.assets,
    entities: [...document.entities, cloneEntity(command.entity)],
    targets: [...document.targets, cloneTarget(command.target)],
  });
}

function reviseDocument(
  document: SceneDocument,
  overrides: Partial<Omit<SceneDocument, "revision">>,
): SceneDocument {
  return {
    ...document,
    ...overrides,
    revision: document.revision + 1,
  };
}

function validateCommandResult(document: SceneDocument): SceneDocument {
  const result = validateSceneDocument(document);
  if (result.ok) return result.value;

  const detail = result.diagnostics
    .map((diagnostic) => `${diagnostic.code}@${diagnostic.path}`)
    .join(", ");
  throw new Error(`Document command produced an invalid SceneDocument: ${detail}`);
}

function replaceEntity(
  entities: readonly SceneEntity[],
  entityId: string,
  update: (entity: SceneEntity) => SceneEntity,
): readonly SceneEntity[] {
  let found = false;
  const next = entities.map((entity) => {
    if (entity.id !== entityId) return entity;
    found = true;
    return update(entity);
  });
  if (!found) throw new Error(`Entity '${entityId}' does not exist.`);
  return next;
}

function collectSubtreeEntityIds(entities: readonly SceneEntity[], rootEntityId: string): string[] {
  const byParent = new Map<string | null, string[]>();
  const byId = new Map<string, SceneEntity>();
  for (const entity of entities) {
    byId.set(entity.id, entity);
    const siblings = byParent.get(entity.parentId) ?? [];
    siblings.push(entity.id);
    byParent.set(entity.parentId, siblings);
  }
  if (!byId.has(rootEntityId)) throw new Error(`Entity '${rootEntityId}' does not exist.`);

  const ordered: string[] = [];
  const stack = [rootEntityId];
  while (stack.length > 0) {
    const entityId = stack.pop();
    if (entityId === undefined) continue;
    ordered.push(entityId);
    const children = byParent.get(entityId);
    if (children === undefined) continue;
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const childId = children[index];
      if (childId !== undefined) stack.push(childId);
    }
  }

  return ordered;
}

function requireMappedId(
  map: Readonly<Record<string, string>>,
  sourceId: string,
  label: string,
): string {
  const nextId = map[sourceId];
  if (nextId === undefined) throw new Error(`Missing duplicate ${label} ID for '${sourceId}'.`);
  return nextId;
}

function assertUnusedId(document: SceneDocument, id: string, label: string): void {
  const used =
    document.id === id ||
    document.assets.some((asset) => asset.id === id) ||
    document.entities.some((entity) => entity.id === id) ||
    document.targets.some((target) => target.id === id) ||
    document.dataSources.some((source) => source.id === id) ||
    document.bindings.some((binding) => binding.id === id) ||
    document.ruleSets.some((ruleSet) => ruleSet.id === id) ||
    document.ruleSets.some((ruleSet) => ruleSet.rules.some((rule) => rule.id === id)) ||
    document.annotations.some((annotation) => annotation.id === id) ||
    document.views.some((view) => view.id === id);
  if (used) throw new Error(`${label} ID '${id}' is already in use.`);
}

function assertParentExists(entities: readonly SceneEntity[], parentId: string | null): void {
  if (parentId === null) return;
  if (!entities.some((entity) => entity.id === parentId)) {
    throw new Error(`Parent entity '${parentId}' does not exist.`);
  }
}

function cloneAsset(asset: SceneAsset): SceneAsset {
  return asset.stats === undefined
    ? { ...asset }
    : {
        ...asset,
        stats: { ...asset.stats },
      };
}

function cloneEntity(entity: SceneEntity): SceneEntity {
  return entity.type === "asset" ? cloneAssetEntity(entity) : cloneGroupEntity(entity);
}

function cloneEntityForDuplicate(
  entity: SceneEntity,
  nextId: string,
  nextParentId: string | null,
): SceneEntity {
  return entity.type === "asset"
    ? cloneAssetEntity(entity, { id: nextId, parentId: nextParentId })
    : cloneGroupEntity(entity, { id: nextId, parentId: nextParentId });
}

function cloneGroupEntity(entity: GroupEntity, overrides: Partial<GroupEntity> = {}): GroupEntity {
  return {
    ...entity,
    transform: cloneTransform(entity.transform),
    metadata: { ...entity.metadata },
    ...overrides,
  };
}

function cloneAssetEntity(entity: AssetEntity, overrides: Partial<AssetEntity> = {}): AssetEntity {
  return {
    ...entity,
    transform: cloneTransform(entity.transform),
    metadata: { ...entity.metadata },
    ...overrides,
  };
}

function cloneTarget(target: SceneTarget, overrides: Partial<SceneTarget> = {}): SceneTarget {
  return {
    ...target,
    metadata: { ...target.metadata },
    ...overrides,
  };
}

function cloneTargetForDuplicate(target: SceneTarget, id: string, entityId: string): SceneTarget {
  return {
    id,
    entityId,
    name: target.name,
    assetHash: target.assetHash,
    nodeIndex: target.nodeIndex,
    metadata: { ...target.metadata },
  };
}

function cloneTransform(transform: Transform): Transform {
  return {
    position: [...transform.position] as Transform["position"],
    rotation: [...transform.rotation] as Transform["rotation"],
    scale: [...transform.scale] as Transform["scale"],
  };
}

function transformsEqual(left: Transform, right: Transform): boolean {
  return (
    arraysEqual(left.position, right.position) &&
    arraysEqual(left.rotation, right.rotation) &&
    arraysEqual(left.scale, right.scale)
  );
}

function assetsEqual(left: SceneAsset, right: SceneAsset): boolean {
  return (
    left.id === right.id &&
    left.name === right.name &&
    left.uri === right.uri &&
    left.mediaType === right.mediaType &&
    left.sha256 === right.sha256 &&
    left.byteLength === right.byteLength &&
    assetStatsEqual(left.stats, right.stats)
  );
}

function assetStatsEqual(left: SceneAsset["stats"], right: SceneAsset["stats"]): boolean {
  if (left === undefined || right === undefined) return left === right;
  return (
    left.nodeCount === right.nodeCount &&
    left.meshCount === right.meshCount &&
    left.materialCount === right.materialCount &&
    left.triangleCount === right.triangleCount
  );
}

function arraysEqual(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
