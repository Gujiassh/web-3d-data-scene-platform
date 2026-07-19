import { describe, expect, it } from "vitest";

import { nextAnnotationId } from "./annotation-id";

describe("nextAnnotationId", () => {
  it("chooses the lowest free deterministic ID across the complete document namespace", () => {
    const document = {
      id: "annotation-1",
      assets: [{ id: "annotation-2" }],
      entities: [{ id: "annotation-3" }],
      targets: [{ id: "annotation-4" }],
      dataSources: [{ id: "annotation-5" }],
      bindings: [{ id: "annotation-6" }],
      ruleSets: [{ id: "annotation-7", rules: [{ id: "annotation-8" }] }],
      annotations: [{ id: "annotation-9" }],
      views: [{ id: "annotation-10" }],
    };

    expect(nextAnnotationId(document)).toBe("annotation-11");
    expect(nextAnnotationId(document)).toBe("annotation-11");
  });

  it("fills the lowest gap instead of depending on collection order", () => {
    const document = {
      id: "scene-a",
      assets: [],
      entities: [],
      targets: [],
      dataSources: [],
      bindings: [],
      ruleSets: [],
      annotations: [{ id: "annotation-3" }, { id: "annotation-1" }],
      views: [],
    };

    expect(nextAnnotationId(document)).toBe("annotation-2");
  });
});
