import { afterEach, describe, expect, it, vi } from "vitest";
import type { DataEnvelope } from "@web3d/runtime";

import { createHostAdapters } from "./runtime-adapters";

describe("minimal-host adapter boundary", () => {
  afterEach(() => vi.useRealTimers());

  it("creates only the explicitly supported manifest requirement", () => {
    const adapters = createHostAdapters([{ sourceId: "factory-telemetry", adapter: "mock" }]);

    expect(Object.keys(adapters)).toEqual(["factory-telemetry"]);
    expect(adapters["factory-telemetry"]?.sourceId).toBe("factory-telemetry");
  });

  it("rejects unknown source IDs and adapter kinds without guessing", () => {
    expect(() => createHostAdapters([{ sourceId: "other", adapter: "mock" }])).toThrow(
      "unsupported host adapter",
    );
    expect(() =>
      createHostAdapters([{ sourceId: "factory-telemetry", adapter: "websocket" }]),
    ).toThrow("unsupported host adapter");
  });

  it("provides the explicit online ready payload expected by the published fixture", async () => {
    vi.useFakeTimers();
    const adapter = createHostAdapters([{ sourceId: "factory-telemetry", adapter: "mock" }])[
      "factory-telemetry"
    ];
    if (adapter === undefined) throw new Error("Factory adapter is missing.");
    const envelopes: DataEnvelope[] = [];
    adapter.subscribe((envelope) => envelopes.push(envelope));
    await adapter.start({
      signal: new AbortController().signal,
      now: () => 0,
      emitDiagnostic: vi.fn(),
    });
    await vi.advanceTimersByTimeAsync(40);

    expect(envelopes).toEqual([
      { kind: "connection", sourceId: "factory-telemetry", status: "connecting" },
      { kind: "connection", sourceId: "factory-telemetry", status: "online" },
      {
        kind: "snapshot",
        sourceId: "factory-telemetry",
        streamId: "published-factory-status",
        sequence: 1,
        quality: "good",
        value: { telemetry: { status: "ready" } },
      },
    ]);
    await adapter.stop();
  });
});
