import { MockAdapter, type DataAdapter, type MockScenarioStep } from "@web3d/runtime";
import type { PublishDataSourceRequirement } from "@web3d/publish";

const supportedSourceId = "factory-telemetry";

export function createHostAdapters(
  requirements: readonly PublishDataSourceRequirement[],
): Readonly<Record<string, DataAdapter>> {
  const adapters = requirements.map((requirement) => {
    if (requirement.sourceId !== supportedSourceId || requirement.adapter !== "mock") {
      throw new Error("Published scene requires an unsupported host adapter.");
    }
    return [requirement.sourceId, createFactoryAdapter(requirement.sourceId)] as const;
  });
  return Object.fromEntries(adapters);
}

function createFactoryAdapter(sourceId: string): MockAdapter {
  return new MockAdapter(sourceId, { steps: factorySteps(sourceId) });
}

function factorySteps(sourceId: string): readonly MockScenarioStep[] {
  return [
    {
      atMs: 20,
      envelope: { kind: "connection", sourceId, status: "online" },
    },
    {
      atMs: 40,
      envelope: {
        kind: "snapshot",
        sourceId,
        streamId: "published-factory-status",
        sequence: 1,
        quality: "good",
        value: {
          machines: {
            "PRESS-01": { status: "running" },
            "CONVEYOR-01": { status: "running" },
          },
        },
      },
    },
  ];
}
