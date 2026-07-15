import { Matrix4, Quaternion, Vector3 } from "three";
import { describe, expect, it } from "vitest";

import { LayoutPlanningError } from "./types";
import {
  MATRIX_RESIDUAL_EPSILON,
  boundsAnchorPosition,
  matrixFromTransform,
  matrixResidual,
  transformFromMatrix,
} from "./spatial-math";

describe("spatial math", () => {
  it("round-trips finite positive TRS inside the fixed residual epsilon", () => {
    const source = {
      position: [3, -2, 4],
      rotation: [0, Math.sin(Math.PI / 8), 0, Math.cos(Math.PI / 8)],
      scale: [2, 1.5, 0.75],
    } as const;
    const matrix = matrixFromTransform(source);
    const parsed = transformFromMatrix(matrix);

    expect(parsed.position).toEqual(source.position);
    expect(parsed.scale[0]).toBeCloseTo(2);
    expect(matrixResidual(matrix, matrixFromTransform(parsed))).toBeLessThanOrEqual(
      MATRIX_RESIDUAL_EPSILON,
    );
  });

  it("rejects shear and non-positive decomposed scale", () => {
    const shear = new Matrix4().set(1, 0.5, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
    expectPlanningFailure(() => transformFromMatrix(shear), "non-representable-transform");

    const reflected = new Matrix4().compose(new Vector3(), new Quaternion(), new Vector3(-1, 1, 1));
    expectPlanningFailure(() => transformFromMatrix(reflected), "invalid-transform");
  });

  it("uses the contract epsilon for representability boundaries", () => {
    expect(MATRIX_RESIDUAL_EPSILON).toBe(1e-9);
    const inside = new Matrix4().set(1, 1e-10, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
    expect(() => transformFromMatrix(inside)).not.toThrow();

    const outside = new Matrix4().set(1, 1e-7, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
    expectPlanningFailure(() => transformFromMatrix(outside), "non-representable-transform");
  });

  it("derives the fixed center and six face-center anchors", () => {
    const bounds = { min: [-2, -4, -6], max: [2, 4, 6] } as const;
    expect(boundsAnchorPosition(bounds, "center")).toEqual([0, 0, 0]);
    expect(boundsAnchorPosition(bounds, "minX")).toEqual([-2, 0, 0]);
    expect(boundsAnchorPosition(bounds, "maxY")).toEqual([0, 4, 0]);
    expect(boundsAnchorPosition(bounds, "minZ")).toEqual([0, 0, -6]);
  });
});

function expectPlanningFailure(callback: () => unknown, code: LayoutPlanningError["code"]): void {
  try {
    callback();
    throw new Error("Expected layout planning to fail.");
  } catch (error) {
    expect(error).toBeInstanceOf(LayoutPlanningError);
    expect((error as LayoutPlanningError).code).toBe(code);
  }
}
