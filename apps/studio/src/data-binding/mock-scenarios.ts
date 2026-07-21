import type { DataSource, MockDataSource } from "@web3d/document";
import {
  MockAdapter,
  type Diagnostic,
  type JsonPrimitive,
  type JsonValue,
  type MockScenarioStep,
} from "@web3d/runtime";

export const MOCK_SCENARIO_IDS = ["status-cycle", "boolean-cycle", "multi-status-cycle"] as const;
export type MockScenarioId = (typeof MOCK_SCENARIO_IDS)[number];

export interface MockScenarioDefinition {
  readonly id: MockScenarioId;
  readonly sample: JsonValue;
  readonly suggestedValues: Readonly<Record<string, readonly JsonPrimitive[]>>;
  createSteps(sourceId: string): readonly MockScenarioStep[];
}

export interface UnsupportedDataSource {
  readonly sourceId: string;
  readonly diagnostic: Diagnostic;
}

export interface MockAdapterPlan {
  readonly adapters: Readonly<Record<string, MockAdapter>>;
  readonly unsupportedSources: readonly UnsupportedDataSource[];
}

const scenarios: Readonly<Record<MockScenarioId, MockScenarioDefinition>> = {
  "status-cycle": {
    id: "status-cycle",
    sample: {
      telemetry: {
        status: "ready",
        utilization: 0.72,
        enabled: true,
        "signal/name~raw": "nominal",
      },
    },
    suggestedValues: {
      "/telemetry/status": ["ready", "warning", "critical"],
    },
    createSteps: (sourceId) => statusCycle(sourceId),
  },
  "boolean-cycle": {
    id: "boolean-cycle",
    sample: { telemetry: { active: true, count: 1 } },
    suggestedValues: { "/telemetry/active": [true, false] },
    createSteps: (sourceId) => booleanCycle(sourceId),
  },
  "multi-status-cycle": {
    id: "multi-status-cycle",
    sample: multiStatusValue("ready", "offline", "alarm"),
    suggestedValues: {
      "/channels/channel-a/status": ["ready", "offline", "alarm"],
      "/channels/channel-b/status": ["ready", "offline", "alarm"],
      "/channels/channel-c/status": ["ready", "offline", "alarm"],
    },
    createSteps: (sourceId) => multiStatusCycle(sourceId),
  },
};

export function mockScenario(id: string): MockScenarioDefinition | null {
  return isMockScenarioId(id) ? scenarios[id] : null;
}

export function createMockScenarioAdapter(source: MockDataSource): MockAdapter | null {
  const scenario = mockScenario(source.options.scenario);
  if (scenario === null) return null;
  return new MockAdapter(source.id, {
    steps: scenario.createSteps(source.id),
    ...(source.options.defaultSpeed === undefined ? {} : { speed: source.options.defaultSpeed }),
  });
}

export function createMockAdapterPlan(sources: readonly DataSource[]): MockAdapterPlan {
  const resolved = sources.map((source) => ({
    source,
    adapter: source.adapter === "mock" ? createMockScenarioAdapter(source) : null,
  }));
  return {
    adapters: Object.fromEntries(
      resolved
        .filter(
          (entry): entry is { readonly source: MockDataSource; readonly adapter: MockAdapter } =>
            entry.adapter !== null,
        )
        .map(({ source, adapter }) => [source.id, adapter]),
    ),
    unsupportedSources: resolved.flatMap(({ source, adapter }) =>
      adapter === null
        ? [
            {
              sourceId: source.id,
              diagnostic: unsupportedDataSourceDiagnostic(source),
            },
          ]
        : [],
    ),
  };
}

function unsupportedDataSourceDiagnostic(source: DataSource): Diagnostic {
  const scenario = source.adapter === "mock" ? ` scenario=${source.options.scenario}` : "";
  return {
    code: "DATASOURCE_CONNECTION_FAILED",
    severity: "error",
    source: "adapter",
    sourceId: source.id,
    message: `source-adapter-unsupported sourceId=${source.id} adapter=${source.adapter}${scenario}`,
  };
}

function isMockScenarioId(value: string): value is MockScenarioId {
  return (MOCK_SCENARIO_IDS as readonly string[]).includes(value);
}

function statusCycle(sourceId: string): readonly MockScenarioStep[] {
  const streamId = `${sourceId}-status-cycle`;
  const recoveryStreamId = `${sourceId}-status-recovery`;
  return [
    snapshotStep(80, sourceId, streamId, 1, {
      telemetry: {
        status: "ready",
        utilization: 0.72,
        enabled: true,
        "signal/name~raw": "nominal",
      },
    }),
    patchStep(900, sourceId, streamId, 2, "/telemetry/status", "warning"),
    patchStep(1_800, sourceId, streamId, 3, "/telemetry/status", "critical"),
    patchStep(2_700, sourceId, streamId, 4, "/telemetry/status", "ready"),
    snapshotStep(8_200, sourceId, recoveryStreamId, 1, {
      telemetry: {
        status: "ready",
        utilization: 0.72,
        enabled: true,
        "signal/name~raw": "nominal",
      },
    }),
  ];
}

function booleanCycle(sourceId: string): readonly MockScenarioStep[] {
  const streamId = `${sourceId}-boolean-cycle`;
  return [
    snapshotStep(80, sourceId, streamId, 1, { telemetry: { active: true, count: 1 } }),
    patchStep(1_000, sourceId, streamId, 2, "/telemetry/active", false),
    patchStep(2_000, sourceId, streamId, 3, "/telemetry/active", true),
  ];
}

function multiStatusCycle(sourceId: string): readonly MockScenarioStep[] {
  const streamId = `${sourceId}-multi-status-cycle`;
  const recoveryStreamId = `${sourceId}-multi-status-recovery`;
  return [
    snapshotStep(80, sourceId, streamId, 1, multiStatusValue("ready", "offline", "alarm")),
    patchStep(2_000, sourceId, streamId, 2, "/channels/channel-a/status", "offline"),
    patchStep(2_000, sourceId, streamId, 3, "/channels/channel-b/status", "alarm"),
    patchStep(2_000, sourceId, streamId, 4, "/channels/channel-c/status", "ready"),
    patchStep(4_000, sourceId, streamId, 5, "/channels/channel-a/status", "alarm"),
    patchStep(4_000, sourceId, streamId, 6, "/channels/channel-b/status", "ready"),
    patchStep(4_000, sourceId, streamId, 7, "/channels/channel-c/status", "offline"),
    snapshotStep(
      6_000,
      sourceId,
      recoveryStreamId,
      1,
      multiStatusValue("ready", "offline", "alarm"),
    ),
  ];
}

function multiStatusValue(
  channelA: JsonPrimitive,
  channelB: JsonPrimitive,
  channelC: JsonPrimitive,
): JsonValue {
  return {
    channels: {
      "channel-a": { status: channelA },
      "channel-b": { status: channelB },
      "channel-c": { status: channelC },
    },
  };
}

function snapshotStep(
  atMs: number,
  sourceId: string,
  streamId: string,
  sequence: number,
  value: JsonValue,
): MockScenarioStep {
  return {
    atMs,
    envelope: { kind: "snapshot", sourceId, streamId, sequence, quality: "good", value },
  };
}

function patchStep(
  atMs: number,
  sourceId: string,
  streamId: string,
  sequence: number,
  pointer: string,
  value: JsonPrimitive,
): MockScenarioStep {
  return {
    atMs,
    envelope: {
      kind: "patch",
      sourceId,
      streamId,
      sequence,
      quality: "good",
      changes: [{ pointer, value }],
    },
  };
}
