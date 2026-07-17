import type { GroupEntity, SceneDocument, SceneEntity, SceneTarget } from "../types.js";
import type {
  CreateGroupCommand,
  DuplicateSubtreeCommand,
  DuplicateSubtreeItem,
  DuplicateSubtreesCommand,
  EntityPlacement,
  EntityPlacementChange,
  LayoutDocumentCommand,
  ReparentEntitiesCommand,
  TransformEntitiesCommand,
} from "./types.js";
import {
  assertTransformInvariant,
  cloneTransform,
  transformsEqual,
} from "./transform-invariants.js";

export function applyLayoutDocumentCommand(
  document: SceneDocument,
  command: LayoutDocumentCommand,
): SceneDocument {
  switch (command.type) {
    case "create-group":
      return createGroup(document, command);
    case "reparent-entities":
      return reparentEntities(document, command);
    case "transform-entities":
      return transformEntities(document, command);
    case "duplicate-subtree":
      return duplicateSubtree(document, command);
    case "duplicate-subtrees":
      return duplicateSubtrees(document, command);
  }
}

function createGroup(document: SceneDocument, command: CreateGroupCommand): SceneDocument {
  if (command.group.type !== "group") throw new Error("Created entity must be a group.");
  assertUnusedId(document, command.group.id, "group");
  assertTransformInvariant(command.group.transform, `Group '${command.group.id}'`);
  assertUnlockedGroupDestination(document.entities, command.group.parentId);
  preflightPlacementChanges(document, command.members, new Set([command.group.id]));
  if (command.members.length > 0) {
    if (command.group.locked) throw new Error(`New group '${command.group.id}' must be unlocked.`);
    const commonParentId = commonPlacementParent(command.members, "before");
    if (command.group.parentId !== commonParentId) {
      throw new Error(`New group '${command.group.id}' must use the members' common parent.`);
    }
  }
  for (const member of command.members) {
    if (member.after.parentId !== command.group.id) {
      throw new Error(`Grouped entity '${member.entityId}' must use group '${command.group.id}'.`);
    }
  }

  const changes = new Map(command.members.map((change) => [change.entityId, change.after]));
  const entities = [
    ...document.entities.map((entity) => applyPlacement(entity, changes.get(entity.id))),
    cloneGroup(command.group),
  ];
  assertAcyclicHierarchy(entities);
  return reviseDocument(document, { entities });
}

function reparentEntities(
  document: SceneDocument,
  command: ReparentEntitiesCommand,
): SceneDocument {
  preflightPlacementChanges(document, command.changes);
  if (command.changes.length === 0) return document;
  commonPlacementParent(command.changes, "before");
  const destinationId = commonPlacementParent(command.changes, "after");
  assertUnlockedGroupDestination(document.entities, destinationId);
  if (command.changes.every((change) => placementsEqual(change.before, change.after))) {
    return document;
  }
  const changes = new Map(command.changes.map((change) => [change.entityId, change.after]));
  const entities = document.entities.map((entity) =>
    applyPlacement(entity, changes.get(entity.id)),
  );
  assertAcyclicHierarchy(entities);
  return reviseDocument(document, { entities });
}

function transformEntities(
  document: SceneDocument,
  command: TransformEntitiesCommand,
): SceneDocument {
  assertUniqueEntityIds(command.changes);
  const entitiesById = new Map(document.entities.map((entity) => [entity.id, entity]));
  for (const change of command.changes) {
    const entity = requireEntity(entitiesById, change.entityId);
    if (entity.type === "light") {
      throw new Error(`LightEntity '${change.entityId}' cannot use generic transform-entities.`);
    }
    if (entity.locked) throw new Error(`Locked entity '${change.entityId}' cannot be transformed.`);
    assertTransformInvariant(change.before, `Transform before '${change.entityId}'`);
    assertTransformInvariant(change.after, `Transform after '${change.entityId}'`);
    if (!transformsEqual(entity.transform, change.before)) {
      throw new Error(`Transform before snapshot does not match entity '${change.entityId}'.`);
    }
  }
  if (command.changes.every((change) => transformsEqual(change.before, change.after))) {
    return document;
  }
  const changes = new Map(command.changes.map((change) => [change.entityId, change.after]));
  return reviseDocument(document, {
    entities: document.entities.map((entity) => {
      const transform = changes.get(entity.id);
      return transform === undefined ? entity : { ...entity, transform: cloneTransform(transform) };
    }),
  });
}

function duplicateSubtree(
  document: SceneDocument,
  command: DuplicateSubtreeCommand,
): SceneDocument {
  return applyDuplicatePlan(document, [command], false);
}

function duplicateSubtrees(
  document: SceneDocument,
  command: DuplicateSubtreesCommand,
): SceneDocument {
  if (command.items.length === 0) throw new Error("Duplicate subtrees command requires items.");
  return applyDuplicatePlan(document, command.items, true);
}

type DuplicatePlanItem = Omit<DuplicateSubtreeItem, "rootPlacement"> & {
  readonly rootPlacement?: DuplicateSubtreeItem["rootPlacement"];
};

interface DuplicatePlan {
  readonly entities: readonly SceneEntity[];
  readonly targets: readonly SceneTarget[];
}

function applyDuplicatePlan(
  document: SceneDocument,
  items: readonly DuplicatePlanItem[],
  requireRootPlacement: boolean,
): SceneDocument {
  const plan = planDuplicateSubtrees(document, items, requireRootPlacement);
  const entities = [...document.entities, ...plan.entities];
  assertAcyclicHierarchy(entities);
  return reviseDocument(document, {
    entities,
    targets: [...document.targets, ...plan.targets],
  });
}

function planDuplicateSubtrees(
  document: SceneDocument,
  items: readonly DuplicatePlanItem[],
  requireRootPlacement: boolean,
): DuplicatePlan {
  assertDistinctNonOverlappingRoots(document.entities, items);
  const entitiesById = new Map(document.entities.map((entity) => [entity.id, entity]));
  const roots = items.map((item) => {
    const root = requireEntity(entitiesById, item.rootEntityId);
    if (root.type === "light") {
      throw new Error(`LightEntity '${root.id}' cannot use generic duplicate-subtree.`);
    }
    if (requireRootPlacement && item.rootPlacement === undefined) {
      throw new Error(`Duplicate root placement is required for '${root.id}'.`);
    }
    preflightDuplicateRootPlacement(document, root, item.rootPlacement);
    return root;
  });
  if (requireRootPlacement) {
    const commonParentId = items[0]?.rootPlacement?.before.parentId;
    if (items.some((item) => item.rootPlacement?.before.parentId !== commonParentId)) {
      throw new Error("All duplicate subtree root before placements must use the same parent.");
    }
  }
  const usedIds = collectDocumentIds(document);
  const duplicatedEntities: SceneEntity[] = [];
  const duplicatedTargets: SceneTarget[] = [];

  for (const [itemIndex, item] of items.entries()) {
    const root = roots[itemIndex];
    if (root === undefined) throw new Error(`Entity '${item.rootEntityId}' does not exist.`);
    const subtreeIds = collectSubtreeEntityIds(document.entities, item.rootEntityId);
    const subtreeIdSet = new Set(subtreeIds);

    for (const sourceId of subtreeIds) {
      const source = requireEntity(entitiesById, sourceId);
      if (source.type === "light") {
        throw new Error(`LightEntity '${source.id}' cannot use generic duplicate-subtree.`);
      }
      const nextId = requireMappedId(item.entityIdMap, sourceId, "entity");
      claimDuplicateId(usedIds, nextId, "entity");
      const nextParentId =
        source.parentId !== null && subtreeIdSet.has(source.parentId)
          ? requireMappedId(item.entityIdMap, source.parentId, "entity")
          : source.parentId;
      const duplicate = cloneEntityForDuplicate(source, nextId, nextParentId);
      duplicatedEntities.push(
        sourceId === item.rootEntityId && item.rootPlacement !== undefined
          ? applyPlacement(duplicate, item.rootPlacement.after)
          : duplicate,
      );
    }

    for (const target of document.targets) {
      if (!subtreeIdSet.has(target.entityId)) continue;
      const nextId = requireMappedId(item.targetIdMap, target.id, "target");
      claimDuplicateId(usedIds, nextId, "target");
      duplicatedTargets.push(
        cloneTargetForDuplicate(
          target,
          nextId,
          requireMappedId(item.entityIdMap, target.entityId, "entity"),
        ),
      );
    }
  }

  return { entities: duplicatedEntities, targets: duplicatedTargets };
}

function preflightDuplicateRootPlacement(
  document: SceneDocument,
  root: SceneEntity,
  rootPlacement: DuplicatePlanItem["rootPlacement"],
): void {
  if (rootPlacement === undefined) return;
  assertFinitePlacement(rootPlacement.before, `Duplicate before '${root.id}'`);
  assertFinitePlacement(rootPlacement.after, `Duplicate after '${root.id}'`);
  if (!placementMatches(root, rootPlacement.before)) {
    throw new Error(`Placement before snapshot does not match entity '${root.id}'.`);
  }
  if (rootPlacement.after.parentId !== rootPlacement.before.parentId) {
    throw new Error("Duplicate root placement must not change parent.");
  }
  assertParentExists(document.entities, rootPlacement.after.parentId);
}

function assertDistinctNonOverlappingRoots(
  entities: readonly SceneEntity[],
  items: readonly DuplicatePlanItem[],
): void {
  const rootIds = new Set<string>();
  for (const item of items) {
    if (rootIds.has(item.rootEntityId)) {
      throw new Error(`Duplicate root entity '${item.rootEntityId}' appears more than once.`);
    }
    rootIds.add(item.rootEntityId);
  }

  const subtrees = items.map((item) => ({
    rootEntityId: item.rootEntityId,
    entityIds: new Set(collectSubtreeEntityIds(entities, item.rootEntityId)),
  }));
  for (let leftIndex = 0; leftIndex < subtrees.length; leftIndex += 1) {
    const left = subtrees[leftIndex];
    if (left === undefined) continue;
    for (let rightIndex = leftIndex + 1; rightIndex < subtrees.length; rightIndex += 1) {
      const right = subtrees[rightIndex];
      if (right === undefined) continue;
      if (left.entityIds.has(right.rootEntityId) || right.entityIds.has(left.rootEntityId)) {
        throw new Error(
          `Duplicate subtree roots '${left.rootEntityId}' and '${right.rootEntityId}' overlap.`,
        );
      }
    }
  }
}

function claimDuplicateId(usedIds: Set<string>, id: string, label: "entity" | "target"): void {
  if (usedIds.has(id)) throw new Error(`Duplicate ${label} ID '${id}' is already in use.`);
  usedIds.add(id);
}

function preflightPlacementChanges(
  document: SceneDocument,
  changes: readonly EntityPlacementChange[],
  additionalParentIds: ReadonlySet<string> = new Set(),
): void {
  assertUniqueEntityIds(changes);
  const entitiesById = new Map(document.entities.map((entity) => [entity.id, entity]));
  for (const change of changes) {
    const entity = requireEntity(entitiesById, change.entityId);
    if (entity.type === "light") {
      throw new Error(`LightEntity '${change.entityId}' cannot use generic layout commands.`);
    }
    if (entity.locked) throw new Error(`Locked entity '${change.entityId}' cannot be reparented.`);
    assertFinitePlacement(change.before, `Placement before '${change.entityId}'`);
    assertFinitePlacement(change.after, `Placement after '${change.entityId}'`);
    if (!placementMatches(entity, change.before)) {
      throw new Error(`Placement before snapshot does not match entity '${change.entityId}'.`);
    }
    if (
      change.after.parentId !== null &&
      !entitiesById.has(change.after.parentId) &&
      !additionalParentIds.has(change.after.parentId)
    ) {
      throw new Error(`Parent entity '${change.after.parentId}' does not exist.`);
    }
    for (const parentId of [change.before.parentId, change.after.parentId]) {
      if (parentId !== null && entitiesById.get(parentId)?.type === "light") {
        throw new Error(`LightEntity '${parentId}' cannot be a layout destination.`);
      }
    }
  }
}

function assertUniqueEntityIds(changes: readonly { readonly entityId: string }[]): void {
  const ids = new Set<string>();
  for (const change of changes) {
    if (ids.has(change.entityId)) {
      throw new Error(`Entity '${change.entityId}' appears more than once in the command.`);
    }
    ids.add(change.entityId);
  }
}

function commonPlacementParent(
  changes: readonly EntityPlacementChange[],
  side: "before" | "after",
): string | null {
  const common = changes[0]?.[side].parentId ?? null;
  if (changes.some((change) => change[side].parentId !== common)) {
    throw new Error(`All ${side} placements must use the same parent.`);
  }
  return common;
}

function assertAcyclicHierarchy(entities: readonly SceneEntity[]): void {
  const parentById = new Map(entities.map((entity) => [entity.id, entity.parentId]));
  for (const entity of entities) {
    const path = new Set<string>();
    let current: string | null = entity.id;
    while (current !== null) {
      if (path.has(current))
        throw new Error(`Entity hierarchy would contain a cycle at '${current}'.`);
      path.add(current);
      current = parentById.get(current) ?? null;
    }
  }
}

function assertFinitePlacement(placement: EntityPlacement, label: string): void {
  assertTransformInvariant(placement.transform, label);
}

function placementMatches(entity: SceneEntity, placement: EntityPlacement): boolean {
  return (
    entity.parentId === placement.parentId && transformsEqual(entity.transform, placement.transform)
  );
}

function placementsEqual(left: EntityPlacement, right: EntityPlacement): boolean {
  return left.parentId === right.parentId && transformsEqual(left.transform, right.transform);
}

function applyPlacement(entity: SceneEntity, placement: EntityPlacement | undefined): SceneEntity {
  if (placement === undefined) return entity;
  if (entity.type === "light") {
    throw new Error(`LightEntity '${entity.id}' cannot use generic layout commands.`);
  }
  return {
    ...entity,
    parentId: placement.parentId,
    transform: cloneTransform(placement.transform),
  };
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

function requireEntity(
  entitiesById: ReadonlyMap<string, SceneEntity>,
  entityId: string,
): SceneEntity {
  const entity = entitiesById.get(entityId);
  if (entity === undefined) throw new Error(`Entity '${entityId}' does not exist.`);
  return entity;
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
  if (collectDocumentIds(document).has(id)) {
    throw new Error(`${label} ID '${id}' is already in use.`);
  }
}

function collectDocumentIds(document: SceneDocument): Set<string> {
  const ids = new Set<string>([document.id]);
  const add = (values: readonly { readonly id: string }[]): void => {
    values.forEach((value) => ids.add(value.id));
  };
  add(document.assets);
  add(document.entities);
  add(document.targets);
  add(document.dataSources);
  add(document.bindings);
  add(document.ruleSets);
  document.ruleSets.forEach((ruleSet) => add(ruleSet.rules));
  add(document.annotations);
  add(document.views);
  return ids;
}

function assertParentExists(entities: readonly SceneEntity[], parentId: string | null): void {
  if (parentId === null) return;
  if (!entities.some((entity) => entity.id === parentId)) {
    throw new Error(`Parent entity '${parentId}' does not exist.`);
  }
}

function assertUnlockedGroupDestination(
  entities: readonly SceneEntity[],
  parentId: string | null,
): void {
  if (parentId === null) return;
  const parent = entities.find((entity) => entity.id === parentId);
  if (parent === undefined) throw new Error(`Parent entity '${parentId}' does not exist.`);
  if (parent.type === "light") {
    throw new Error(`LightEntity '${parentId}' cannot be a group or reparent destination.`);
  }
  if (parent.type !== "group") throw new Error(`Destination entity '${parentId}' must be a group.`);
  if (parent.locked) throw new Error(`Destination group '${parentId}' must be unlocked.`);
}

function cloneEntityForDuplicate(
  entity: SceneEntity,
  nextId: string,
  nextParentId: string | null,
): SceneEntity {
  if (entity.type === "light") {
    throw new Error(`LightEntity '${entity.id}' cannot use generic duplicate-subtree.`);
  }
  return entity.type === "asset"
    ? {
        ...entity,
        id: nextId,
        parentId: nextParentId,
        transform: cloneTransform(entity.transform),
        metadata: { ...entity.metadata },
      }
    : {
        ...entity,
        id: nextId,
        parentId: nextParentId,
        transform: cloneTransform(entity.transform),
        metadata: { ...entity.metadata },
      };
}

function cloneGroup(group: GroupEntity): GroupEntity {
  return {
    ...group,
    transform: cloneTransform(group.transform),
    metadata: { ...group.metadata },
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

function reviseDocument(
  document: SceneDocument,
  overrides: Partial<Omit<SceneDocument, "revision">>,
): SceneDocument {
  return { ...document, ...overrides, revision: document.revision + 1 };
}
