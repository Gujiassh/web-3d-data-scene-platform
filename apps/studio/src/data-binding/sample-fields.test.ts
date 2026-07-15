import { describe, expect, it } from "vitest";

import { enumerateSampleFields, isCanonicalJsonPointer } from "./sample-fields";

describe("sample field enumeration", () => {
  it("sorts primitive leaves and escapes RFC 6901 segments", () => {
    expect(
      enumerateSampleFields({
        z: [true, null],
        "a/b~c": { value: 4 },
      }),
    ).toEqual([
      { pointer: "/a~1b~0c/value", value: 4, valueType: "number" },
      { pointer: "/z/0", value: true, valueType: "boolean" },
      { pointer: "/z/1", value: null, valueType: "null" },
    ]);
  });

  it.each([
    ["", true],
    ["/telemetry/status", true],
    ["/a~0b~1c", true],
    ["telemetry/status", false],
    ["/a~2b", false],
    ["/a~", false],
  ])("recognizes canonical pointer %s", (pointer, valid) => {
    expect(isCanonicalJsonPointer(pointer)).toBe(valid);
  });
});
