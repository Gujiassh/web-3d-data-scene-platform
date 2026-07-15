import { describe, expect, it } from "vitest";

import {
  EMPTY_ENTITY_SELECTION,
  normalizeEntitySelection,
  retainEntitySelection,
} from "./entity-selection";

describe("entity selection", () => {
  it("deduplicates and stably sorts ids while preserving the explicit primary", () => {
    expect(normalizeEntitySelection(["zeta", "alpha", "zeta"], "zeta")).toEqual({
      entityIds: ["alpha", "zeta"],
      primaryEntityId: "zeta",
    });
  });

  it("rejects invalid primary ids before producing a replacement", () => {
    expect(() => normalizeEntitySelection(["alpha"], "missing")).toThrow(
      "must belong to the selection",
    );
    expect(() => normalizeEntitySelection([], "alpha")).toThrow("must belong to the selection");
  });

  it("retains surviving ids and promotes the first stable id when primary disappears", () => {
    const selection = normalizeEntitySelection(["zeta", "alpha", "middle"], "zeta");
    expect(retainEntitySelection(selection, (id) => id !== "zeta")).toEqual({
      entityIds: ["alpha", "middle"],
      primaryEntityId: "alpha",
    });
    expect(retainEntitySelection(selection, () => false)).toBe(EMPTY_ENTITY_SELECTION);
  });
});
