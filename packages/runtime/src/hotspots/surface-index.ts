import type { SurfaceAnchor, Vec3 } from "@web3d/document";
import {
  BatchedMesh,
  InstancedMesh,
  Matrix3,
  Mesh,
  SkinnedMesh,
  Vector3,
  type Object3D,
} from "three";

export type HotspotSurfaceVector = Vec3;

export interface HotspotSurfaceIdentity {
  readonly entityId: string;
  readonly assetHash: string;
  readonly nodeIndex: number;
}

export type HotspotSurfaceAnchorReference = SurfaceAnchor;

export interface HotspotSurfaceEntityRegistration {
  readonly entityId: string;
  readonly assetHash: string;
  readonly nodesByIndex: ReadonlyMap<number, Object3D>;
  readonly nodeIndexByHitObject: ReadonlyMap<Object3D, number>;
}

export type UnsupportedHotspotSurfaceReason =
  "not-mesh" | "skinned-mesh" | "morph-target-mesh" | "instanced-mesh" | "batched-mesh";

export type HotspotSurfaceHitLookup =
  | {
      readonly ok: true;
      readonly identity: HotspotSurfaceIdentity;
      readonly node: Object3D;
      readonly surface: Mesh;
    }
  | { readonly ok: false; readonly reason: "object-not-registered" }
  | {
      readonly ok: false;
      readonly reason: "unsupported-surface";
      readonly unsupportedReason: UnsupportedHotspotSurfaceReason;
    };

export type HotspotSurfaceAnchorResolution =
  | {
      readonly ok: true;
      readonly identity: HotspotSurfaceIdentity;
      readonly node: Object3D;
    }
  | {
      readonly ok: false;
      readonly reason:
        | "entity-not-registered"
        | "asset-hash-mismatch"
        | "node-not-registered"
        | "surface-not-registered"
        | "unsupported-surface"
        | "non-invertible-transform"
        | "invalid-frame";
    };

interface IndexedSurfaceNode {
  readonly identity: HotspotSurfaceIdentity;
  readonly node: Object3D;
  readonly hitObjects: Object3D[];
}

interface IndexedSurfaceEntity {
  readonly assetHash: string;
  readonly nodes: ReadonlyMap<number, IndexedSurfaceNode>;
}

interface ReverseSurfaceEvidence {
  readonly identity: HotspotSurfaceIdentity;
  readonly node: Object3D;
  readonly object: Object3D;
}

type RigidSurfaceClassification =
  | { readonly supported: true; readonly surface: Mesh }
  | {
      readonly supported: false;
      readonly reason: UnsupportedHotspotSurfaceReason;
    };

export class HotspotSurfaceIndex {
  readonly #entities = new Map<string, IndexedSurfaceEntity>();
  readonly #surfaceByObject = new WeakMap<Object3D, ReverseSurfaceEvidence>();
  readonly #worldPosition = new Vector3();
  readonly #worldNormal = new Vector3();
  readonly #normalMatrix = new Matrix3();

  constructor(registrations: readonly HotspotSurfaceEntityRegistration[] = []) {
    for (const registration of registrations) this.#register(registration);
  }

  lookupHitObject(object: Object3D): HotspotSurfaceHitLookup {
    const evidence = this.#surfaceByObject.get(object);
    if (evidence === undefined) return { ok: false, reason: "object-not-registered" };

    const classification = classifyRigidSurface(evidence.object);
    if (!classification.supported) {
      return {
        ok: false,
        reason: "unsupported-surface",
        unsupportedReason: classification.reason,
      };
    }

    return {
      ok: true,
      identity: evidence.identity,
      node: evidence.node,
      surface: classification.surface,
    };
  }

  resolveAnchor(
    anchor: HotspotSurfaceAnchorReference,
    worldPosition: Vector3,
    worldNormal: Vector3,
  ): HotspotSurfaceAnchorResolution {
    const entity = this.#entities.get(anchor.entityId);
    if (entity === undefined) return { ok: false, reason: "entity-not-registered" };
    if (entity.assetHash !== anchor.assetHash) {
      return { ok: false, reason: "asset-hash-mismatch" };
    }

    const indexedNode = entity.nodes.get(anchor.nodeIndex);
    if (indexedNode === undefined) return { ok: false, reason: "node-not-registered" };
    if (indexedNode.hitObjects.length === 0) {
      return { ok: false, reason: "surface-not-registered" };
    }
    if (!indexedNode.hitObjects.some((object) => classifyRigidSurface(object).supported)) {
      return { ok: false, reason: "unsupported-surface" };
    }

    indexedNode.node.updateWorldMatrix(true, false);
    if (!isInvertibleMatrixWorld(indexedNode.node)) {
      return { ok: false, reason: "non-invertible-transform" };
    }
    if (
      !isFiniteVectorTuple(anchor.nodeLocalPosition) ||
      !isUnitVectorTuple(anchor.nodeLocalNormal)
    ) {
      return { ok: false, reason: "invalid-frame" };
    }

    this.#worldPosition
      .fromArray(anchor.nodeLocalPosition)
      .applyMatrix4(indexedNode.node.matrixWorld);
    this.#normalMatrix.getNormalMatrix(indexedNode.node.matrixWorld);
    this.#worldNormal.fromArray(anchor.nodeLocalNormal).applyNormalMatrix(this.#normalMatrix);
    if (!isFiniteVector(this.#worldPosition) || !isUnitVector(this.#worldNormal)) {
      return { ok: false, reason: "invalid-frame" };
    }

    worldPosition.copy(this.#worldPosition);
    worldNormal.copy(this.#worldNormal);
    return { ok: true, identity: indexedNode.identity, node: indexedNode.node };
  }

  #register(registration: HotspotSurfaceEntityRegistration): void {
    if (this.#entities.has(registration.entityId)) {
      throw new Error(`Duplicate hotspot surface entity ${registration.entityId}.`);
    }

    const nodes = new Map<number, IndexedSurfaceNode>();
    for (const [nodeIndex, node] of registration.nodesByIndex) {
      assertNodeIndex(nodeIndex);
      const identity = Object.freeze({
        entityId: registration.entityId,
        assetHash: registration.assetHash,
        nodeIndex,
      });
      nodes.set(nodeIndex, { identity, node, hitObjects: [] });
    }

    for (const [object, nodeIndex] of registration.nodeIndexByHitObject) {
      assertNodeIndex(nodeIndex);
      const indexedNode = nodes.get(nodeIndex);
      if (indexedNode === undefined) {
        throw new Error(
          `Hotspot surface entity ${registration.entityId} associates an object with unknown glTF node ${String(nodeIndex)}.`,
        );
      }
      if (this.#surfaceByObject.has(object)) {
        throw new Error("A hotspot hit object cannot be registered more than once.");
      }
      indexedNode.hitObjects.push(object);
      this.#surfaceByObject.set(object, {
        identity: indexedNode.identity,
        node: indexedNode.node,
        object,
      });
    }

    this.#entities.set(registration.entityId, {
      assetHash: registration.assetHash,
      nodes,
    });
  }
}

function classifyRigidSurface(object: Object3D): RigidSurfaceClassification {
  if (object instanceof SkinnedMesh) return { supported: false, reason: "skinned-mesh" };
  if (object instanceof InstancedMesh) return { supported: false, reason: "instanced-mesh" };
  if (object instanceof BatchedMesh) return { supported: false, reason: "batched-mesh" };
  if (!(object instanceof Mesh)) return { supported: false, reason: "not-mesh" };
  const morphAttributes = object.geometry.morphAttributes as Readonly<Record<string, unknown>>;
  if (Object.values(morphAttributes).some(hasMorphTargetAttributes)) {
    return { supported: false, reason: "morph-target-mesh" };
  }
  return { supported: true, surface: object };
}

function assertNodeIndex(nodeIndex: number): void {
  if (!Number.isSafeInteger(nodeIndex) || nodeIndex < 0) {
    throw new Error(
      `Hotspot surface glTF node index must be a non-negative safe integer: ${String(nodeIndex)}.`,
    );
  }
}

function isInvertibleMatrixWorld(object: Object3D): boolean {
  const determinant = object.matrixWorld.determinant();
  return (
    object.matrixWorld.elements.every(Number.isFinite) &&
    Number.isFinite(determinant) &&
    determinant !== 0
  );
}

function hasMorphTargetAttributes(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0;
}

function isFiniteVectorTuple(value: HotspotSurfaceVector): boolean {
  return value.every(Number.isFinite);
}

function isUnitVectorTuple(value: HotspotSurfaceVector): boolean {
  if (!isFiniteVectorTuple(value)) return false;
  return Math.abs(Math.hypot(...value) - 1) <= 1e-6;
}

function isFiniteVector(value: Vector3): boolean {
  return Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z);
}

function isUnitVector(value: Vector3): boolean {
  return isFiniteVector(value) && Math.abs(value.length() - 1) <= 1e-6;
}
