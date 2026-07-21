import { describe, expect, it } from "vitest";

import type { MockDataSource, WebSocketDataSource } from "@web3d/document";

import { createMockAdapterPlan, mockScenario, MOCK_SCENARIO_IDS } from "./mock-scenarios";

describe("Studio Mock scenarios", () => {
  it("uses generic deterministic payloads and steps", () => {
    const scenario = mockScenario("status-cycle");
    expect(scenario?.sample).toMatchObject({ telemetry: { status: "ready" } });
    expect(JSON.stringify(scenario)).not.toMatch(/factory|machine|press|conveyor/iu);
    expect(scenario?.createSteps("source-a")).toEqual(scenario?.createSteps("source-a"));
    expect(scenario?.createSteps("source-a")[0]?.envelope.sourceId).toBe("source-a");
  });

  it("recovers status-cycle with a Snapshot on a new stream after the offline window", () => {
    const scenario = mockScenario("status-cycle");
    if (scenario === null) throw new Error("status-cycle must exist");
    const steps = scenario.createSteps("source-a");

    expect(steps.slice(0, 4)).toMatchObject([
      {
        atMs: 80,
        envelope: {
          kind: "snapshot",
          streamId: "source-a-status-cycle",
          sequence: 1,
          value: { telemetry: { status: "ready" } },
        },
      },
      {
        atMs: 900,
        envelope: {
          kind: "patch",
          streamId: "source-a-status-cycle",
          sequence: 2,
          changes: [{ pointer: "/telemetry/status", value: "warning" }],
        },
      },
      {
        atMs: 1_800,
        envelope: {
          kind: "patch",
          streamId: "source-a-status-cycle",
          sequence: 3,
          changes: [{ pointer: "/telemetry/status", value: "critical" }],
        },
      },
      {
        atMs: 2_700,
        envelope: {
          kind: "patch",
          streamId: "source-a-status-cycle",
          sequence: 4,
          changes: [{ pointer: "/telemetry/status", value: "ready" }],
        },
      },
    ]);
    expect(steps[4]).toMatchObject({
      atMs: 8_200,
      envelope: {
        kind: "snapshot",
        sourceId: "source-a",
        streamId: "source-a-status-recovery",
        sequence: 1,
        value: { telemetry: { status: "ready" } },
      },
    });
    expect((steps[4]?.atMs ?? 0) - (steps[3]?.atMs ?? 0)).toBeGreaterThan(5_000);
  });

  it("keeps independent normal, application-offline and alarm values on one online source", () => {
    const scenario = mockScenario("multi-status-cycle");
    if (scenario === null) throw new Error("multi-status-cycle must exist");

    expect(scenario.sample).toEqual({
      channels: {
        "channel-a": { status: "ready" },
        "channel-b": { status: "offline" },
        "channel-c": { status: "alarm" },
      },
    });
    expect(scenario.suggestedValues).toEqual({
      "/channels/channel-a/status": ["ready", "offline", "alarm"],
      "/channels/channel-b/status": ["ready", "offline", "alarm"],
      "/channels/channel-c/status": ["ready", "offline", "alarm"],
    });
    const steps = scenario.createSteps("source-a");
    expect(steps[0]).toMatchObject({
      atMs: 80,
      envelope: {
        kind: "snapshot",
        sourceId: "source-a",
        streamId: "source-a-multi-status-cycle",
        sequence: 1,
      },
    });
    expect(steps.slice(1, 4).map((step) => step.envelope)).toMatchObject([
      {
        kind: "patch",
        sequence: 2,
        changes: [{ pointer: "/channels/channel-a/status", value: "offline" }],
      },
      {
        kind: "patch",
        sequence: 3,
        changes: [{ pointer: "/channels/channel-b/status", value: "alarm" }],
      },
      {
        kind: "patch",
        sequence: 4,
        changes: [{ pointer: "/channels/channel-c/status", value: "ready" }],
      },
    ]);
    expect(steps.at(-1)).toMatchObject({
      atMs: 6_000,
      envelope: {
        kind: "snapshot",
        sourceId: "source-a",
        streamId: "source-a-multi-status-recovery",
        sequence: 1,
      },
    });
    expect(JSON.stringify(scenario)).not.toMatch(/home|light|climate|lock|device/iu);
  });

  it("returns stable transient error evidence for unsupported persisted scenario IDs", () => {
    const supported = source("source-a", MOCK_SCENARIO_IDS[0]);
    const unknown = source("source-b", "legacy-scenario");
    const plan = createMockAdapterPlan([supported, unknown]);
    expect(Object.keys(plan.adapters)).toEqual(["source-a"]);
    expect(plan.unsupportedSources).toEqual([
      {
        sourceId: "source-b",
        diagnostic: {
          code: "DATASOURCE_CONNECTION_FAILED",
          severity: "error",
          source: "adapter",
          sourceId: "source-b",
          message:
            "source-adapter-unsupported sourceId=source-b adapter=mock scenario=legacy-scenario",
        },
      },
    ]);
    expect(mockScenario("legacy-scenario")).toBeNull();
  });

  it("returns transient error evidence for unsupported websocket sources", () => {
    const plan = createMockAdapterPlan([websocketSource("socket-a")]);
    expect(plan.adapters).toEqual({});
    expect(plan.unsupportedSources).toEqual([
      {
        sourceId: "socket-a",
        diagnostic: {
          code: "DATASOURCE_CONNECTION_FAILED",
          severity: "error",
          source: "adapter",
          sourceId: "socket-a",
          message: "source-adapter-unsupported sourceId=socket-a adapter=websocket",
        },
      },
    ]);
  });
});

function source(id: string, scenario: string): MockDataSource {
  return {
    id,
    name: id,
    adapter: "mock",
    staleAfterMs: 2_000,
    offlineAfterMs: 5_000,
    options: { scenario },
  };
}

function websocketSource(id: string): WebSocketDataSource {
  return {
    id,
    name: id,
    adapter: "websocket",
    staleAfterMs: 2_000,
    offlineAfterMs: 5_000,
    options: {},
  };
}
