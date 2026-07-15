import { describe, expect, it } from "vitest";

import { studioHistoryCapabilities } from "./authoring-capabilities";

describe("studioHistoryCapabilities", () => {
  it("disables Undo and Redo when authoring is unavailable", () => {
    expect(studioHistoryCapabilities(false, 2, 3)).toEqual({
      canUndo: false,
      canRedo: false,
    });
  });

  it("reflects history availability while authoring is enabled", () => {
    expect(studioHistoryCapabilities(true, 1, 0)).toEqual({
      canUndo: true,
      canRedo: false,
    });
  });
});
