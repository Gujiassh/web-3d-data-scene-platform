import { describe, expect, it } from "vitest";

import { inspectorTabForKey } from "./inspector-tabs";

describe("inspectorTabForKey", () => {
  it("implements roving arrow navigation", () => {
    expect(inspectorTabForKey("object", "ArrowRight")).toBe("data");
    expect(inspectorTabForKey("data", "ArrowLeft")).toBe("object");
  });

  it("maps Home and End to stable endpoints", () => {
    expect(inspectorTabForKey("data", "Home")).toBe("object");
    expect(inspectorTabForKey("object", "End")).toBe("data");
    expect(inspectorTabForKey("object", "Enter")).toBeNull();
  });
});
