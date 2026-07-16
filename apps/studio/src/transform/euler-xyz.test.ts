import { Quaternion as ThreeQuaternion } from "three";
import { describe, expect, it } from "vitest";

import { eulerXyzDegreesToQuaternion, quaternionToEulerXyzDegrees } from "./euler-xyz";

describe("intrinsic local XYZ rotation projection", () => {
  it("converts degrees to a normalized quaternion and back", () => {
    const quaternion = eulerXyzDegreesToQuaternion([30, -45, 90]);
    expect(Math.hypot(...quaternion)).toBeCloseTo(1, 12);
    const projected = quaternionToEulerXyzDegrees(quaternion);
    expect(projected[0]).toBeCloseTo(30, 10);
    expect(projected[1]).toBeCloseTo(-45, 10);
    expect(projected[2]).toBeCloseTo(90, 10);
  });

  it("preserves orientation across ambiguous Euler projections", () => {
    const source = eulerXyzDegreesToQuaternion([175, 90, -130]);
    const projected = quaternionToEulerXyzDegrees(source);
    const roundTripped = eulerXyzDegreesToQuaternion(projected);
    const dot = Math.abs(new ThreeQuaternion(...source).dot(new ThreeQuaternion(...roundTripped)));
    expect(dot).toBeCloseTo(1, 10);
  });

  it("rejects non-finite degrees and zero quaternions", () => {
    expect(() => eulerXyzDegreesToQuaternion([Number.NaN, 0, 0])).toThrow("finite");
    expect(() => quaternionToEulerXyzDegrees([0, 0, 0, 0])).toThrow("non-zero");
  });
});
