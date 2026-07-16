import { validateSceneDocument } from "../validate.js";
import type {
  AssetEntity,
  GroupEntity,
  SceneAsset,
  SceneDocument,
  SceneEntity,
  SceneEnvironment,
  SceneLighting,
  SceneTarget,
  Transform,
} from "../types.js";
import type {
  DocumentCommand,
  ImportAssetInstanceCommand,
  SceneBackgroundSettings,
  SetSceneBackgroundCommand,
  SetSceneEnvironmentCommand,
} from "./types.js";
import { applyDataBindingDocumentCommand } from "./data-binding-command.js";
import { applyLayoutDocumentCommand } from "./layout-command.js";
import {
  assertTransformInvariant,
  cloneTransform,
  transformsEqual,
} from "./transform-invariants.js";

export function executeDocumentCommand(
  document: SceneDocument,
  command: DocumentCommand,
): SceneDocument {
  const candidate = applyCommand(document, command);
  return validateCommandResult(candidate);
}

function applyCommand(document: SceneDocument, command: DocumentCommand): SceneDocument {
  switch (command.type) {
    case "rename-document": {
      const name = command.name.trim();
      if (name.length === 0) throw new Error("Document name must not be empty.");
      if (name === document.name) return document;
      return reviseDocument(document, { name });
    }
    case "set-scene-background":
      return applySceneBackgroundCommand(document, command);
    case "set-scene-environment":
      return applySceneEnvironmentCommand(document, command);
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
    case "create-group":
    case "reparent-entities":
    case "transform-entities":
    case "duplicate-subtree":
    case "duplicate-subtrees":
      return applyLayoutDocumentCommand(document, command);
    case "delete-subtree":
      return deleteSubtree(document, command.rootEntityId);
    case "import-asset-instance":
      return importAssetInstance(document, command);
    case "set-target-business-id":
    case "upsert-mock-data-source":
    case "configure-binding-rule-set":
    case "remove-binding":
    case "remove-mock-data-source":
      return applyDataBindingDocumentCommand(document, command);
  }
}

const COLOR_PATTERN = /^#[A-Fa-f0-9]{6}$/u;
const CANONICAL_COLOR_PATTERN = /^#[A-F0-9]{6}$/u;

function applySceneBackgroundCommand(
  document: SceneDocument,
  command: SetSceneBackgroundCommand,
): SceneDocument {
  assertSceneBackgroundSettings(command.before, "Background before snapshot");
  assertSceneBackgroundSettings(command.after, "Background after snapshot");
  const current: SceneBackgroundSettings = {
    mode: document.environment.backgroundMode,
    color: document.environment.background,
  };
  if (!sceneBackgroundSettingsEqual(current, command.before)) {
    throw new Error("Background before snapshot does not match the document environment.");
  }
  if (sceneBackgroundSettingsEqual(command.before, command.after)) return document;
  return reviseDocument(document, {
    environment: {
      ...document.environment,
      backgroundMode: command.after.mode,
      background: command.after.color,
    },
  });
}

function assertSceneBackgroundSettings(settings: SceneBackgroundSettings, label: string): void {
  if (settings.mode !== "theme" && settings.mode !== "custom") {
    throw new Error(`${label} mode must be theme or custom.`);
  }
  if (!COLOR_PATTERN.test(settings.color)) {
    throw new Error(`${label} color must be a six-digit hex color.`);
  }
}

function sceneBackgroundSettingsEqual(
  left: SceneBackgroundSettings,
  right: SceneBackgroundSettings,
): boolean {
  return left.mode === right.mode && left.color === right.color;
}

function applySceneEnvironmentCommand(
  document: SceneDocument,
  command: SetSceneEnvironmentCommand,
): SceneDocument {
  assertSceneEnvironment(command.before, "Scene environment before snapshot");
  assertSceneEnvironment(command.after, "Scene environment after snapshot");
  if (!sceneEnvironmentsEqual(document.environment, command.before)) {
    throw new Error("Scene environment before snapshot does not match the document environment.");
  }
  if (sceneEnvironmentsEqual(command.before, command.after)) return document;
  return reviseDocument(document, { environment: cloneSceneEnvironment(command.after) });
}

function assertSceneEnvironment(value: SceneEnvironment, label: string): void {
  assertRecordWithKeys(value, label, [
    "backgroundMode",
    "background",
    "grid",
    "unit",
    "upAxis",
    "lighting",
  ]);
  if (value.backgroundMode !== "theme" && value.backgroundMode !== "custom") {
    throw new Error(`${label} backgroundMode must be theme or custom.`);
  }
  if (typeof value.background !== "string" || !CANONICAL_COLOR_PATTERN.test(value.background)) {
    throw new Error(`${label} background must be a canonical #RRGGBB color.`);
  }
  if (typeof value.grid !== "boolean") throw new Error(`${label} grid must be boolean.`);
  if (value.unit !== "mm" && value.unit !== "cm" && value.unit !== "m") {
    throw new Error(`${label} unit must be mm, cm or m.`);
  }
  if (value.upAxis !== "Y") throw new Error(`${label} upAxis must be Y.`);
  assertSceneLighting(value.lighting, `${label} lighting`);
}

function assertSceneLighting(value: SceneLighting, label: string): void {
  assertRecordWithKeys(value, label, ["fill", "key"]);
  assertRecordWithKeys(value.fill, `${label} fill`, ["skyColor", "groundColor", "intensity"]);
  assertRecordWithKeys(value.key, `${label} key`, ["color", "intensity", "directionToLight"]);
  assertCanonicalColor(value.fill.skyColor, `${label} fill skyColor`);
  assertCanonicalColor(value.fill.groundColor, `${label} fill groundColor`);
  assertIntensity(value.fill.intensity, `${label} fill intensity`);
  assertCanonicalColor(value.key.color, `${label} key color`);
  assertIntensity(value.key.intensity, `${label} key intensity`);
  const direction = value.key.directionToLight;
  if (
    !Array.isArray(direction) ||
    direction.length !== 3 ||
    direction.some((component) => !Number.isFinite(component))
  ) {
    throw new Error(`${label} key directionToLight must contain three finite numbers.`);
  }
  const length = Math.hypot(...direction);
  if (!Number.isFinite(length) || Math.abs(length - 1) > 1e-6) {
    throw new Error(`${label} key directionToLight must be a finite unit vector within 1e-6.`);
  }
}

function assertCanonicalColor(value: string, label: string): void {
  if (typeof value !== "string" || !CANONICAL_COLOR_PATTERN.test(value)) {
    throw new Error(`${label} must be a canonical #RRGGBB color.`);
  }
}

function assertIntensity(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 5) {
    throw new Error(`${label} must be a finite number between 0 and 5.`);
  }
}

function assertRecordWithKeys(value: unknown, label: string, keys: readonly string[]): void {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`${label} must contain exactly ${expected.join(", ")}.`);
  }
}

function sceneEnvironmentsEqual(left: SceneEnvironment, right: SceneEnvironment): boolean {
  return (
    left.backgroundMode === right.backgroundMode &&
    left.background === right.background &&
    left.grid === right.grid &&
    left.unit === right.unit &&
    left.upAxis === right.upAxis &&
    left.lighting.fill.skyColor === right.lighting.fill.skyColor &&
    left.lighting.fill.groundColor === right.lighting.fill.groundColor &&
    left.lighting.fill.intensity === right.lighting.fill.intensity &&
    left.lighting.key.color === right.lighting.key.color &&
    left.lighting.key.intensity === right.lighting.key.intensity &&
    left.lighting.key.directionToLight.every(
      (value, index) => value === right.lighting.key.directionToLight[index],
    )
  );
}

function cloneSceneEnvironment(environment: SceneEnvironment): SceneEnvironment {
  return {
    ...environment,
    lighting: {
      fill: { ...environment.lighting.fill },
      key: {
        ...environment.lighting.key,
        directionToLight: [...environment.lighting.key.directionToLight],
      },
    },
  };
}

function applyTransformCommand(
  document: SceneDocument,
  entityId: string,
  before: Transform,
  after: Transform,
): SceneDocument {
  const entity = document.entities.find((candidate) => candidate.id === entityId);
  if (entity === undefined) throw new Error(`Entity '${entityId}' does not exist.`);
  if (entity.locked) throw new Error(`Locked entity '${entityId}' cannot be transformed.`);
  assertTransformInvariant(before, `Transform before '${entityId}'`);
  assertTransformInvariant(after, `Transform after '${entityId}'`);
  if (!transformsEqual(entity.transform, before)) {
    throw new Error(`Transform before snapshot does not match entity '${entityId}'.`);
  }
  if (transformsEqual(before, after)) return document;
  return reviseDocument(document, {
    entities: document.entities.map((candidate) =>
      candidate.id === entityId ? { ...candidate, transform: cloneTransform(after) } : candidate,
    ),
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
