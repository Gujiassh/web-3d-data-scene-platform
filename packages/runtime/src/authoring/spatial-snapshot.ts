import type { SceneDocument, Transform, Vec3 } from "@web3d/document";
import {
  Box3,
  InstancedMesh,
  Line,
  Mesh,
  Points,
  Vector3,
  type BufferGeometry,
  type Object3D,
} from "three";

import type { EntitySpatialSnapshot, EntityWorldBounds, WorldMatrix } from "../types";
import type { RuntimeGeneration } from "../viewer/runtime-generation";
import { normalizeEntityIds } from "./entity-selection";

const TRANSFORM_EPSILON = 1e-9;

export class StaleSpatialMeasurementError extends Error {
  readonly documentId: string;
  readonly documentRevision: number;

  constructor(document: SceneDocument) {
    super(
      "Spatial measurements are stale because runtime transforms do not match the document revision.",
    );
    this.name = "StaleSpatialMeasurementError";
    this.documentId = document.id;
    this.documentRevision = document.revision;
  }
}

export function createEntitySpatialSnapshots(
  document: SceneDocument,
  generation: RuntimeGeneration,
  requestedEntityIds: readonly string[],
): readonly EntitySpatialSnapshot[] {
  const entityIds = normalizeEntityIds(requestedEntityIds);
  const runtimeEntities = entityIds.map((entityId) => {
    const runtimeEntity = generation.entities.get(entityId);
    if (runtimeEntity === undefined) throw new Error(`Entity '${entityId}' is not loaded.`);
    return runtimeEntity;
  });

  const authoritativeEntities = assertRevisionBound(document, generation);
  generation.root.updateMatrixWorld(true);
  return Object.freeze(
    runtimeEntities.map(({ entity: runtimeEntity, object }) => {
      const entity = authoritativeEntities.get(runtimeEntity.id);
      if (entity === undefined) throw new StaleSpatialMeasurementError(document);
      return Object.freeze({
        documentId: document.id,
        documentRevision: document.revision,
        entityId: entity.id,
        parentId: entity.parentId,
        localTransform: freezeTransform(entity.transform),
        worldMatrix: readWorldMatrix(object),
        worldBounds: readVisibleWorldBounds(object, generation.root),
        worldPivot: freezeVec3(new Vector3().setFromMatrixPosition(object.matrixWorld)),
        visible: isEffectivelyVisible(object, generation.root),
        locked: entity.locked,
      });
    }),
  );
}

function assertRevisionBound(
  document: SceneDocument,
  generation: RuntimeGeneration,
): ReadonlyMap<string, SceneDocument["entities"][number]> {
  const authoritativeEntities = new Map(document.entities.map((entity) => [entity.id, entity]));
  if (authoritativeEntities.size !== generation.entities.size) {
    throw new StaleSpatialMeasurementError(document);
  }
  for (const [entityId, runtimeEntity] of generation.entities) {
    if (!belongsToGeneration(runtimeEntity.object, generation.root)) {
      throw new Error("The runtime generation has been disposed.");
    }
    const authoritative = authoritativeEntities.get(entityId);
    const expectedParent =
      authoritative?.parentId === null
        ? generation.root
        : generation.entities.get(authoritative?.parentId ?? "")?.object;
    if (
      authoritative === undefined ||
      runtimeEntity.object.parent !== expectedParent ||
      !objectMatchesTransform(runtimeEntity.object, authoritative.transform)
    ) {
      throw new StaleSpatialMeasurementError(document);
    }
  }
  return authoritativeEntities;
}

function belongsToGeneration(object: Object3D, root: Object3D): boolean {
  let current: Object3D | null = object;
  while (current !== null) {
    if (current === root) return true;
    current = current.parent;
  }
  return false;
}

function freezeTransform(transform: Transform): Transform {
  return Object.freeze({
    position: Object.freeze([...transform.position]) as Transform["position"],
    rotation: Object.freeze([...transform.rotation]) as Transform["rotation"],
    scale: Object.freeze([...transform.scale]) as Transform["scale"],
  });
}

function readWorldMatrix(object: Object3D): WorldMatrix {
  const elements = object.matrixWorld.elements;
  return Object.freeze([
    elements[0],
    elements[1],
    elements[2],
    elements[3],
    elements[4],
    elements[5],
    elements[6],
    elements[7],
    elements[8],
    elements[9],
    elements[10],
    elements[11],
    elements[12],
    elements[13],
    elements[14],
    elements[15],
  ]);
}

function readVisibleWorldBounds(object: Object3D, root: Object3D): EntityWorldBounds | null {
  if (!isEffectivelyVisible(object, root)) return null;
  const bounds = new Box3();
  expandVisibleGeometryBounds(object, bounds);
  if (bounds.isEmpty()) return null;
  return Object.freeze({
    min: freezeVec3(bounds.min),
    max: freezeVec3(bounds.max),
  });
}

function expandVisibleGeometryBounds(object: Object3D, bounds: Box3): void {
  if (!object.visible) return;
  const geometryBounds = localGeometryBounds(object);
  if (geometryBounds !== null && !geometryBounds.isEmpty()) {
    bounds.union(geometryBounds.clone().applyMatrix4(object.matrixWorld));
  }
  object.children.forEach((child) => expandVisibleGeometryBounds(child, bounds));
}

function localGeometryBounds(object: Object3D): Box3 | null {
  if (object instanceof InstancedMesh) {
    if (object.boundingBox === null) object.computeBoundingBox();
    return object.boundingBox;
  }
  if (!(object instanceof Mesh || object instanceof Line || object instanceof Points)) return null;
  const geometry: BufferGeometry = object.geometry;
  if (geometry.boundingBox === null) geometry.computeBoundingBox();
  return geometry.boundingBox;
}

function isEffectivelyVisible(object: Object3D, root: Object3D): boolean {
  let current: Object3D | null = object;
  while (current !== null) {
    if (!current.visible) return false;
    if (current === root) return true;
    current = current.parent;
  }
  return false;
}

function objectMatchesTransform(object: Object3D, transform: Transform): boolean {
  return (
    valuesMatch([object.position.x, object.position.y, object.position.z], transform.position) &&
    valuesMatch(
      [object.quaternion.x, object.quaternion.y, object.quaternion.z, object.quaternion.w],
      transform.rotation,
    ) &&
    valuesMatch([object.scale.x, object.scale.y, object.scale.z], transform.scale)
  );
}

function valuesMatch(left: readonly number[], right: readonly number[]): boolean {
  return left.every(
    (value, index) => Math.abs(value - (right[index] ?? Number.NaN)) <= TRANSFORM_EPSILON,
  );
}

function freezeVec3(value: { readonly x: number; readonly y: number; readonly z: number }): Vec3 {
  return Object.freeze([value.x, value.y, value.z]);
}
