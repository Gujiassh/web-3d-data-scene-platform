import { describe, expect, it } from "vitest";

import type { MockDataSource } from "@web3d/document";

import { semanticDataAdapterKey, unsupportedSourcePreviewActions } from "./useStudioDataBinding";

describe("semanticDataAdapterKey", () => {
  it("is stable across source order and non-adapter source fields", () => {
    const first = source("source-a");
    const second = source("source-b");
    expect(semanticDataAdapterKey([first, second])).toBe(
      semanticDataAdapterKey([
        { ...second, name: "Renamed", staleAfterMs: 4_000, offlineAfterMs: 9_000 },
        { ...first, options: { ...first.options, seed: 99 } },
      ]),
    );
  });

  it("changes when adapter behavior changes", () => {
    const value = source("source-a");
    expect(semanticDataAdapterKey([value])).not.toBe(
      semanticDataAdapterKey([
        { ...value, options: { ...value.options, scenario: "boolean-cycle" } },
      ]),
    );
    expect(semanticDataAdapterKey([value])).not.toBe(
      semanticDataAdapterKey([{ ...value, options: { ...value.options, defaultSpeed: 2 } }]),
    );
  });

  it("changes when an unsupported source adapter changes", () => {
    const value = source("source-a");
    expect(semanticDataAdapterKey([value])).not.toBe(
      semanticDataAdapterKey([
        {
          id: value.id,
          name: value.name,
          adapter: "websocket",
          staleAfterMs: value.staleAfterMs,
          offlineAfterMs: value.offlineAfterMs,
          options: {},
        },
      ]),
    );
  });
});

describe("unsupportedSourcePreviewActions", () => {
  it("derives transient error connection and diagnostic actions", () => {
    const diagnostic = {
      code: "DATASOURCE_CONNECTION_FAILED" as const,
      severity: "error" as const,
      source: "adapter" as const,
      sourceId: "socket-a",
      message: "source-adapter-unsupported sourceId=socket-a adapter=websocket",
    };
    expect(unsupportedSourcePreviewActions([{ sourceId: "socket-a", diagnostic }])).toEqual([
      { type: "connection-changed", sourceId: "socket-a", status: "error" },
      { type: "diagnostic-added", diagnostic },
    ]);
  });
});

function source(id: string): MockDataSource {
  return {
    id,
    name: id,
    adapter: "mock",
    staleAfterMs: 2_000,
    offlineAfterMs: 5_000,
    options: { scenario: "status-cycle", defaultSpeed: 1 },
  };
}
