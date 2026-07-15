import { parseSceneDocument, type SceneDocument } from "@web3d/document";
import { MockAdapter } from "@web3d/runtime";

export const equipment = [
  {
    id: "press-01",
    businessId: "PRESS-01",
    labelKey: "press01",
    areaKey: "forming",
  },
  {
    id: "conveyor-01",
    businessId: "CONVEYOR-01",
    labelKey: "conveyor01",
    areaKey: "transfer",
  },
] as const;

export type M0SceneLoadErrorReason =
  | { readonly code: "http-request-failed"; readonly status: number }
  | { readonly code: "scene-document-validation-fallback" };

export class M0SceneLoadError extends Error {
  readonly reason: M0SceneLoadErrorReason;

  constructor(reason: M0SceneLoadErrorReason) {
    super(reason.code);
    this.name = "M0SceneLoadError";
    this.reason = reason;
  }
}

export async function loadM0Scene(signal: AbortSignal): Promise<SceneDocument> {
  const response = await fetch("/m0-scene.json", { signal });
  if (!response.ok) {
    throw new M0SceneLoadError({ code: "http-request-failed", status: response.status });
  }
  const result = parseSceneDocument(await response.text());
  if (!result.ok) {
    const first = result.diagnostics[0];
    if (first === undefined) {
      throw new M0SceneLoadError({ code: "scene-document-validation-fallback" });
    }
    throw new Error(first.message);
  }
  return result.value;
}

export function createM0Adapter(cycle = 0): MockAdapter {
  const suffix = cycle.toString(36);
  return new MockAdapter("factory-telemetry", {
    steps: [
      {
        atMs: 120,
        envelope: {
          kind: "snapshot",
          sourceId: "factory-telemetry",
          streamId: `m0-stream-a-${suffix}`,
          sequence: 1,
          sourceTime: "2026-07-13T09:00:00Z",
          quality: "good",
          value: {
            machines: {
              "PRESS-01": { status: "running" },
              "CONVEYOR-01": { status: "running" },
            },
          },
        },
      },
      {
        atMs: 2600,
        envelope: {
          kind: "patch",
          sourceId: "factory-telemetry",
          streamId: `m0-stream-a-${suffix}`,
          sequence: 2,
          sourceTime: "2026-07-13T09:00:03Z",
          quality: "good",
          changes: [{ pointer: "/machines/PRESS-01/status", value: "fault" }],
        },
      },
      {
        atMs: 5600,
        envelope: {
          kind: "patch",
          sourceId: "factory-telemetry",
          streamId: `m0-stream-a-${suffix}`,
          sequence: 3,
          sourceTime: "2026-07-13T09:00:06Z",
          quality: "good",
          changes: [{ pointer: "/machines/PRESS-01/status", value: "running" }],
        },
      },
      {
        atMs: 7800,
        envelope: {
          kind: "connection",
          sourceId: "factory-telemetry",
          status: "offline",
          sourceTime: "2026-07-13T09:00:08Z",
        },
      },
      {
        atMs: 9800,
        envelope: {
          kind: "snapshot",
          sourceId: "factory-telemetry",
          streamId: `m0-stream-b-${suffix}`,
          sequence: 1,
          sourceTime: "2026-07-13T09:00:10Z",
          quality: "good",
          value: {
            machines: {
              "PRESS-01": { status: "running" },
              "CONVEYOR-01": { status: "running" },
            },
          },
        },
      },
    ],
  });
}
