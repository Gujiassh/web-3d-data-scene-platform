import { describe, expect, it } from "vitest";

import type { MockDataSource } from "@web3d/document";

import { effectiveMockSourceId } from "./source-selection";

const sources: readonly MockDataSource[] = [source("source-a"), source("source-b")];

describe("effectiveMockSourceId", () => {
  it("keeps an existing request and otherwise selects the first Mock source", () => {
    expect(effectiveMockSourceId(sources, "source-b")).toBe("source-b");
    expect(effectiveMockSourceId(sources, "")).toBe("source-a");
    expect(effectiveMockSourceId(sources, "removed-source")).toBe("source-a");
  });

  it("returns an empty selection when there are no Mock sources", () => {
    expect(effectiveMockSourceId([], "source-a")).toBe("");
  });
});

function source(id: string): MockDataSource {
  return {
    id,
    name: id,
    adapter: "mock",
    staleAfterMs: 2_000,
    offlineAfterMs: 5_000,
    options: { scenario: "status-cycle" },
  };
}
