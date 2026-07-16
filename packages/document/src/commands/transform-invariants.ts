import type { Transform } from "../types.js";

export const QUATERNION_NORMALIZATION_TOLERANCE = 1e-6;

export function assertTransformInvariant(transform: Transform, label: string): void {
  if (!transform.position.every(Number.isFinite)) {
    throw new Error(`${label} position values must be finite.`);
  }
  if (!transform.rotation.every(Number.isFinite)) {
    throw new Error(`${label} rotation values must be finite.`);
  }
  const quaternionLength = Math.hypot(...transform.rotation);
  if (Math.abs(quaternionLength - 1) > QUATERNION_NORMALIZATION_TOLERANCE) {
    throw new Error(`${label} rotation must be a normalized non-zero quaternion.`);
  }
  if (!transform.scale.every((value) => Number.isFinite(value) && value > 0)) {
    throw new Error(`${label} scale values must be finite and greater than zero.`);
  }
}

export function cloneTransform(transform: Transform): Transform {
  return {
    position: [...transform.position] as Transform["position"],
    rotation: [...transform.rotation] as Transform["rotation"],
    scale: [...transform.scale] as Transform["scale"],
  };
}

export function transformsEqual(left: Transform, right: Transform): boolean {
  return (
    arraysEqual(left.position, right.position) &&
    arraysEqual(left.rotation, right.rotation) &&
    arraysEqual(left.scale, right.scale)
  );
}

function arraysEqual(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
