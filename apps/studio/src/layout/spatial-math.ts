import { Box3, Matrix4, Quaternion, Vector3 } from "three";

import type { Transform, Vec3 } from "@web3d/document";
import type { EntitySpatialSnapshot, EntityWorldBounds } from "@web3d/runtime";

import { LayoutPlanningError, type BoundsAnchorKind } from "./types";

export const MATRIX_RESIDUAL_EPSILON = 1e-9;

export function zeroWithinMatrixEpsilon(value: number): number {
  return Math.abs(value) <= MATRIX_RESIDUAL_EPSILON ? 0 : value;
}

export function zeroVectorWithinMatrixEpsilon(value: Vec3): Vec3 {
  return value.map(zeroWithinMatrixEpsilon) as unknown as Vec3;
}

export function exactTransformWhenWithinMatrixEpsilon(
  before: Transform,
  after: Transform,
): Transform {
  const beforeComponents = transformComponents(before);
  const afterComponents = transformComponents(after);
  return beforeComponents.every(
    (value, index) => Math.abs(value - afterComponents[index]!) <= MATRIX_RESIDUAL_EPSILON,
  )
    ? before
    : after;
}

export function isFinitePositiveScaleTransform(transform: Transform): boolean {
  return (
    transform.position.every(Number.isFinite) &&
    transform.rotation.every(Number.isFinite) &&
    transform.scale.every((value) => Number.isFinite(value) && value > 0)
  );
}

export function matrixFromTransform(transform: Transform): Matrix4 {
  return new Matrix4().compose(
    vectorFromTuple(transform.position),
    new Quaternion(...transform.rotation),
    vectorFromTuple(transform.scale),
  );
}

export function matrixFromSnapshot(snapshot: EntitySpatialSnapshot): Matrix4 {
  return new Matrix4().fromArray([...snapshot.worldMatrix]);
}

export function inferParentWorldMatrix(snapshot: EntitySpatialSnapshot): Matrix4 {
  const local = matrixFromTransform(snapshot.localTransform);
  return matrixFromSnapshot(snapshot).multiply(invertMatrix(local));
}

export function transformFromMatrix(matrix: Matrix4): Transform {
  if (!matrix.elements.every(Number.isFinite)) {
    throw new LayoutPlanningError("invalid-transform");
  }
  const position = new Vector3();
  const rotation = new Quaternion();
  const scale = new Vector3();
  matrix.decompose(position, rotation, scale);
  if (
    ![position.x, position.y, position.z, rotation.x, rotation.y, rotation.z, rotation.w].every(
      Number.isFinite,
    ) ||
    ![scale.x, scale.y, scale.z].every((value) => Number.isFinite(value) && value > 0)
  ) {
    throw new LayoutPlanningError("invalid-transform");
  }
  const recomposed = new Matrix4().compose(position, rotation, scale);
  if (matrixResidual(matrix, recomposed) > MATRIX_RESIDUAL_EPSILON) {
    throw new LayoutPlanningError("non-representable-transform");
  }
  return {
    position: tupleFromVector(position),
    rotation: [rotation.x, rotation.y, rotation.z, rotation.w],
    scale: tupleFromVector(scale),
  };
}

export function localTransformForWorldMatrix(world: Matrix4, parentWorld: Matrix4): Transform {
  return transformFromMatrix(invertMatrix(parentWorld).multiply(world));
}

export function translatedWorldMatrix(world: Matrix4, delta: Vec3): Matrix4 {
  return new Matrix4().makeTranslation(...delta).multiply(world);
}

export function combinedWorldBounds(
  snapshots: readonly EntitySpatialSnapshot[],
): EntityWorldBounds {
  const combined = new Box3();
  combined.makeEmpty();
  for (const snapshot of snapshots) {
    if (snapshot.worldBounds === null) throw new LayoutPlanningError("bounds-unavailable");
    combined.union(
      new Box3(
        vectorFromTuple(snapshot.worldBounds.min),
        vectorFromTuple(snapshot.worldBounds.max),
      ),
    );
  }
  if (combined.isEmpty()) throw new LayoutPlanningError("bounds-unavailable");
  return { min: tupleFromVector(combined.min), max: tupleFromVector(combined.max) };
}

export function boundsAnchorPosition(bounds: EntityWorldBounds, kind: BoundsAnchorKind): Vec3 {
  const center: Vec3 = [
    (bounds.min[0] + bounds.max[0]) / 2,
    (bounds.min[1] + bounds.max[1]) / 2,
    (bounds.min[2] + bounds.max[2]) / 2,
  ];
  switch (kind) {
    case "center":
      return center;
    case "minX":
      return [bounds.min[0], center[1], center[2]];
    case "maxX":
      return [bounds.max[0], center[1], center[2]];
    case "minY":
      return [center[0], bounds.min[1], center[2]];
    case "maxY":
      return [center[0], bounds.max[1], center[2]];
    case "minZ":
      return [center[0], center[1], bounds.min[2]];
    case "maxZ":
      return [center[0], center[1], bounds.max[2]];
  }
}

export function boundsAxisAnchor(
  bounds: EntityWorldBounds,
  axisIndex: 0 | 1 | 2,
  anchor: "min" | "center" | "max",
): number {
  if (anchor === "min") return bounds.min[axisIndex];
  if (anchor === "max") return bounds.max[axisIndex];
  return (bounds.min[axisIndex] + bounds.max[axisIndex]) / 2;
}

export function averageWorldPivot(snapshots: readonly EntitySpatialSnapshot[]): Vec3 {
  if (snapshots.length === 0) throw new LayoutPlanningError("selection-required");
  const total = snapshots.reduce(
    (sum, snapshot) =>
      [
        sum[0] + snapshot.worldPivot[0],
        sum[1] + snapshot.worldPivot[1],
        sum[2] + snapshot.worldPivot[2],
      ] as Vec3,
    [0, 0, 0] as Vec3,
  );
  return [total[0] / snapshots.length, total[1] / snapshots.length, total[2] / snapshots.length];
}

export function matrixResidual(left: Matrix4, right: Matrix4): number {
  return left.elements.reduce(
    (maximum, value, index) => Math.max(maximum, Math.abs(value - right.elements[index]!)),
    0,
  );
}

export function invertMatrix(matrix: Matrix4): Matrix4 {
  const determinant = matrix.determinant();
  if (!Number.isFinite(determinant) || Math.abs(determinant) <= Number.EPSILON) {
    throw new LayoutPlanningError("invalid-transform");
  }
  return matrix.clone().invert();
}

export function tupleFromVector(vector: Vector3): Vec3 {
  return [vector.x, vector.y, vector.z];
}

function vectorFromTuple(tuple: Vec3): Vector3 {
  return new Vector3(...tuple);
}

function transformComponents(transform: Transform): readonly number[] {
  return [...transform.position, ...transform.rotation, ...transform.scale];
}
