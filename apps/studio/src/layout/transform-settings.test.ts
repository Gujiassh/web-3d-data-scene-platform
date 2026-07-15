import { describe, expect, it } from "vitest";

import { validateTransformSettingsDraft } from "./transform-settings";

describe("validateTransformSettingsDraft", () => {
  it("accepts blank disabled steps and finite positive values", () => {
    expect(
      validateTransformSettingsDraft({
        translationSnap: "0.25",
        rotationSnapDegrees: "90",
        scaleSnap: " ",
      }),
    ).toEqual({
      valid: true,
      settings: {
        translationSnap: 0.25,
        rotationSnapRadians: Math.PI / 2,
        scaleSnap: null,
      },
    });
  });

  it("accepts one full turn as the maximum angle", () => {
    expect(
      validateTransformSettingsDraft({
        translationSnap: "",
        rotationSnapDegrees: "360",
        scaleSnap: "1",
      }),
    ).toEqual({
      valid: true,
      settings: {
        translationSnap: null,
        rotationSnapRadians: Math.PI * 2,
        scaleSnap: 1,
      },
    });
  });

  it("rejects zero, non-finite and overlong-angle drafts together", () => {
    expect(
      validateTransformSettingsDraft({
        translationSnap: "0",
        rotationSnapDegrees: "361",
        scaleSnap: "Infinity",
      }),
    ).toEqual({
      valid: false,
      invalidFields: ["translationSnap", "rotationSnapDegrees", "scaleSnap"],
    });
  });

  it("rejects negative and non-numeric drafts", () => {
    expect(
      validateTransformSettingsDraft({
        translationSnap: "-1",
        rotationSnapDegrees: "not-a-number",
        scaleSnap: "-0.5",
      }),
    ).toEqual({
      valid: false,
      invalidFields: ["translationSnap", "rotationSnapDegrees", "scaleSnap"],
    });
  });
});
