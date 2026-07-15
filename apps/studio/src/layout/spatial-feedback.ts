import { Matrix4, Quaternion, Vector3 } from "three";

import type { Transform, Vec3 } from "@web3d/document";
import type {
  AuthoringTool,
  AuthoringTransformSettings,
  EntitySpatialSnapshot,
} from "@web3d/runtime";

import type { LayoutAxis } from "./layout-selection";
import {
  boundsAnchorPosition,
  combinedWorldBounds,
  inferParentWorldMatrix,
  matrixFromTransform,
} from "./spatial-math";
import type { SpatialFeedback } from "./types";

export function selectionPivot(
  snapshots: readonly EntitySpatialSnapshot[],
  primaryEntityId: string | null,
): Pick<SpatialFeedback, "pivotKind" | "pivotWorld"> {
  if (snapshots.length > 1 && snapshots.every((snapshot) => snapshot.worldBounds !== null)) {
    return {
      pivotKind: "selection-bounds-center",
      pivotWorld: boundsAnchorPosition(combinedWorldBounds(snapshots), "center"),
    };
  }
  const primary =
    snapshots.find((snapshot) => snapshot.entityId === primaryEntityId) ?? snapshots[0] ?? null;
  return { pivotKind: "entity-origin", pivotWorld: primary?.worldPivot ?? null };
}

export function positionDelta(before: Transform, after: Transform): Vec3 {
  return [
    after.position[0] - before.position[0],
    after.position[1] - before.position[1],
    after.position[2] - before.position[2],
  ];
}

export function activeAxis(delta: Vec3): LayoutAxis | "free" {
  const changed = delta
    .map((value, index) => ({ value: Math.abs(value), axis: (["x", "y", "z"] as const)[index]! }))
    .filter((item) => item.value > 1e-9);
  return changed.length === 1 ? changed[0]!.axis : "free";
}

export function transformSpatialFeedback(
  tool: AuthoringTool,
  before: Transform,
  after: Transform,
  current: SpatialFeedback,
  settings: AuthoringTransformSettings,
  snapshot: EntitySpatialSnapshot,
): SpatialFeedback {
  const parentWorld = inferParentWorldMatrix(snapshot);
  const beforeWorld = parentWorld.clone().multiply(matrixFromTransform(before));
  const afterWorld = parentWorld.clone().multiply(matrixFromTransform(after));
  const beforeWorldPosition = new Vector3().setFromMatrixPosition(beforeWorld);
  const afterWorldPosition = new Vector3().setFromMatrixPosition(afterWorld);
  const deltaPosition: Vec3 = [
    afterWorldPosition.x - beforeWorldPosition.x,
    afterWorldPosition.y - beforeWorldPosition.y,
    afterWorldPosition.z - beforeWorldPosition.z,
  ];
  const deltaScale: Vec3 = [
    after.scale[0] - before.scale[0],
    after.scale[1] - before.scale[1],
    after.scale[2] - before.scale[2],
  ];
  const beforeRotation = worldQuaternion(beforeWorld);
  const rotationDelta = worldQuaternion(afterWorld)
    .multiply(beforeRotation.clone().invert())
    .normalize();
  const deltaRotationRadians = 2 * Math.acos(Math.min(1, Math.abs(rotationDelta.w)));
  const rotationAxis = quaternionAxis(rotationDelta, deltaRotationRadians);
  const nextAxis =
    tool === "translate"
      ? activeAxis(deltaPosition)
      : tool === "scale"
        ? activeAxis(deltaScale)
        : tool === "rotate"
          ? rotationAxis
          : "free";
  return {
    ...current,
    activity: "active",
    pivotKind: "entity-origin",
    pivotWorld: [afterWorldPosition.x, afterWorldPosition.y, afterWorldPosition.z],
    activeAxis: nextAxis,
    deltaPosition,
    deltaRotationRadians,
    deltaScale,
    settings,
    sourceAnchor: null,
    targetAnchor: null,
  };
}

function worldQuaternion(matrix: Matrix4): Quaternion {
  const elements = matrix.elements;
  const x = new Vector3(elements[0], elements[1], elements[2]).normalize();
  const y = new Vector3(elements[4], elements[5], elements[6]);
  y.addScaledVector(x, -y.dot(x));
  if (y.lengthSq() <= 1e-18) return new Quaternion();
  y.normalize();
  const z = new Vector3().crossVectors(x, y).normalize();
  const sourceZ = new Vector3(elements[8], elements[9], elements[10]);
  if (z.dot(sourceZ) < 0) {
    y.negate();
    z.crossVectors(x, y).normalize();
  }
  return new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(x, y, z)).normalize();
}

function quaternionAxis(quaternion: Quaternion, angle: number): LayoutAxis | "free" {
  if (angle <= 1e-9) return "free";
  const length = Math.hypot(quaternion.x, quaternion.y, quaternion.z);
  if (length <= 1e-9) return "free";
  const components: Vec3 = [
    Math.abs(quaternion.x / length),
    Math.abs(quaternion.y / length),
    Math.abs(quaternion.z / length),
  ];
  const dominant = components
    .map((value, index) => ({ value, axis: (["x", "y", "z"] as const)[index]! }))
    .sort((left, right) => right.value - left.value);
  return dominant[0]!.value >= 1 - 1e-6 && dominant[1]!.value <= 1e-6 ? dominant[0]!.axis : "free";
}
