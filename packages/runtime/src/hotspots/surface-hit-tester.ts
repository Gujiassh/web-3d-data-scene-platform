import { Matrix3, Matrix4, Vector3, type Object3D } from "three";

import type {
  HotspotSurfaceHitLookup,
  HotspotSurfaceVector,
  HotspotSurfaceIndex,
} from "./surface-index";

export interface HotspotSurfaceRaycastHit {
  readonly object: Object3D;
  readonly point: Vector3;
  readonly face?: { readonly normal: Vector3 } | null;
}

export interface HotspotSurfaceHitAuthority {
  readonly documentId: string;
  readonly revision: number;
}

export interface HotspotSurfaceHitEvidence {
  readonly documentId: string;
  readonly revision: number;
  readonly entityId: string;
  readonly assetHash: string;
  readonly nodeIndex: number;
  readonly worldPosition: HotspotSurfaceVector;
  readonly worldNormal: HotspotSurfaceVector;
  readonly nodeLocalPosition: HotspotSurfaceVector;
  readonly nodeLocalNormal: HotspotSurfaceVector;
}

export type HotspotSurfaceHitTestResult =
  | { readonly ok: true; readonly evidence: HotspotSurfaceHitEvidence }
  | Extract<HotspotSurfaceHitLookup, { readonly ok: false }>
  | {
      readonly ok: false;
      readonly reason: "face-normal-missing" | "non-invertible-transform" | "invalid-frame";
    };

export class HotspotSurfaceHitTester {
  readonly #surfaceIndex: HotspotSurfaceIndex;
  readonly #objectNormalMatrix = new Matrix3();
  readonly #nodeInverse = new Matrix4();
  readonly #nodeInverseNormalMatrix = new Matrix3();
  readonly #worldNormal = new Vector3();
  readonly #nodeLocalPosition = new Vector3();
  readonly #nodeLocalNormal = new Vector3();

  constructor(surfaceIndex: HotspotSurfaceIndex) {
    this.#surfaceIndex = surfaceIndex;
  }

  test(
    hit: HotspotSurfaceRaycastHit,
    authority: HotspotSurfaceHitAuthority,
  ): HotspotSurfaceHitTestResult {
    const lookup = this.#surfaceIndex.lookupHitObject(hit.object);
    if (!lookup.ok) return lookup;
    if (hit.face === null || hit.face === undefined) {
      return { ok: false, reason: "face-normal-missing" };
    }
    if (!isFiniteVector(hit.point) || !isNonZeroFiniteVector(hit.face.normal)) {
      return { ok: false, reason: "invalid-frame" };
    }

    lookup.surface.updateWorldMatrix(true, false);
    lookup.node.updateWorldMatrix(true, false);
    if (
      !isInvertibleMatrix(lookup.surface.matrixWorld) ||
      !isInvertibleMatrix(lookup.node.matrixWorld)
    ) {
      return { ok: false, reason: "non-invertible-transform" };
    }

    this.#objectNormalMatrix.getNormalMatrix(lookup.surface.matrixWorld);
    this.#worldNormal.copy(hit.face.normal).applyNormalMatrix(this.#objectNormalMatrix);

    this.#nodeInverse.copy(lookup.node.matrixWorld).invert();
    this.#nodeLocalPosition.copy(hit.point).applyMatrix4(this.#nodeInverse);
    this.#nodeInverseNormalMatrix.getNormalMatrix(this.#nodeInverse);
    this.#nodeLocalNormal.copy(this.#worldNormal).applyNormalMatrix(this.#nodeInverseNormalMatrix);

    if (
      !isUnitVector(this.#worldNormal) ||
      !isFiniteVector(this.#nodeLocalPosition) ||
      !isUnitVector(this.#nodeLocalNormal)
    ) {
      return { ok: false, reason: "invalid-frame" };
    }

    return {
      ok: true,
      evidence: Object.freeze({
        documentId: authority.documentId,
        revision: authority.revision,
        entityId: lookup.identity.entityId,
        assetHash: lookup.identity.assetHash,
        nodeIndex: lookup.identity.nodeIndex,
        worldPosition: frozenVector(hit.point),
        worldNormal: frozenVector(this.#worldNormal),
        nodeLocalPosition: frozenVector(this.#nodeLocalPosition),
        nodeLocalNormal: frozenVector(this.#nodeLocalNormal),
      }),
    };
  }
}

function isInvertibleMatrix(matrix: Matrix4): boolean {
  const determinant = matrix.determinant();
  return (
    matrix.elements.every(Number.isFinite) && Number.isFinite(determinant) && determinant !== 0
  );
}

function isFiniteVector(value: Vector3): boolean {
  return Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z);
}

function isNonZeroFiniteVector(value: Vector3): boolean {
  return isFiniteVector(value) && value.lengthSq() > 0;
}

function isUnitVector(value: Vector3): boolean {
  return isFiniteVector(value) && Math.abs(value.length() - 1) <= 1e-6;
}

function frozenVector(value: Vector3): HotspotSurfaceVector {
  return Object.freeze([value.x, value.y, value.z]);
}
