import { Euler, MathUtils, Quaternion as ThreeQuaternion } from "three";

import type { Quaternion, Vec3 } from "@web3d/document";

export function quaternionToEulerXyzDegrees(rotation: Quaternion): Vec3 {
  const quaternion = new ThreeQuaternion(...rotation);
  if (!quaternion.toArray().every(Number.isFinite) || quaternion.lengthSq() === 0) {
    throw new TypeError("Rotation must be a finite non-zero quaternion.");
  }
  quaternion.normalize();
  const euler = new Euler().setFromQuaternion(quaternion, "XYZ");
  return [
    cleanDegrees(MathUtils.radToDeg(euler.x)),
    cleanDegrees(MathUtils.radToDeg(euler.y)),
    cleanDegrees(MathUtils.radToDeg(euler.z)),
  ];
}

export function eulerXyzDegreesToQuaternion(degrees: Vec3): Quaternion {
  if (!degrees.every(Number.isFinite)) throw new TypeError("Rotation degrees must be finite.");
  const euler = new Euler(
    MathUtils.degToRad(degrees[0]),
    MathUtils.degToRad(degrees[1]),
    MathUtils.degToRad(degrees[2]),
    "XYZ",
  );
  const quaternion = new ThreeQuaternion().setFromEuler(euler).normalize();
  return [quaternion.x, quaternion.y, quaternion.z, quaternion.w];
}

function cleanDegrees(value: number): number {
  return Math.abs(value) <= 1e-12 ? 0 : value;
}
