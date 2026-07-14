import { describe, expect, it } from "vitest";

import { RuntimeValueStore } from "./value-store";

describe("RuntimeValueStore", () => {
  it("requires a Snapshot before accepting Patch envelopes", () => {
    const store = createStore();
    const result = store.accept(
      {
        kind: "patch",
        sourceId: "telemetry",
        streamId: "stream-a",
        sequence: 1,
        quality: "good",
        changes: [{ pointer: "/machine/status", value: "fault" }],
      },
      0,
    );

    expect(result.accepted).toBe(false);
    expect(result.diagnostics[0]?.code).toBe("DATASOURCE_STREAM_UNKNOWN");
  });

  it("applies ordered Patch envelopes and rejects old streams", () => {
    const store = createStore();
    store.accept(snapshot("stream-a", 1, "running"), 0);
    const update = store.accept(patch("stream-a", 2, "fault"), 100);

    expect(update.accepted).toBe(true);
    expect(store.getValue("telemetry", "/machine/status")).toBe("fault");

    store.accept(snapshot("stream-b", 1, "running"), 200);
    const retired = store.accept(patch("stream-a", 3, "fault"), 300);

    expect(retired.accepted).toBe(false);
    expect(retired.diagnostics[0]?.code).toBe("DATASOURCE_STREAM_RETIRED");
    expect(store.getValue("telemetry", "/machine/status")).toBe("running");
  });

  it("moves online data through stale and offline health states", () => {
    const store = createStore();
    store.accept(snapshot("stream-a", 1, "running"), 0);

    store.updateHealth("telemetry", 1001);
    expect(store.getSource("telemetry")?.connection).toBe("stale");

    store.updateHealth("telemetry", 3001);
    expect(store.getSource("telemetry")?.connection).toBe("offline");
  });

  it("does not mark a source online from Connection alone", () => {
    const store = createStore();
    store.accept({ kind: "connection", sourceId: "telemetry", status: "online" }, 0);

    expect(store.getSource("telemetry")?.connection).toBe("connecting");
  });
});

function createStore(): RuntimeValueStore {
  const store = new RuntimeValueStore();
  store.registerSource("telemetry", { staleAfterMs: 1000, offlineAfterMs: 3000 });
  return store;
}

function snapshot(streamId: string, sequence: number, status: string) {
  return {
    kind: "snapshot" as const,
    sourceId: "telemetry",
    streamId,
    sequence,
    quality: "good" as const,
    value: { machine: { status } },
  };
}

function patch(streamId: string, sequence: number, status: string) {
  return {
    kind: "patch" as const,
    sourceId: "telemetry",
    streamId,
    sequence,
    quality: "good" as const,
    changes: [{ pointer: "/machine/status", value: status }],
  };
}
