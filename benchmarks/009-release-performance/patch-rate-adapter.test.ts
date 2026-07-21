import { describe, expect, it } from "vitest";

import type { DataEnvelope } from "../../packages/runtime/src/index";

import { createInitialValue, FIXTURE_PATCH_RATE_HZ } from "./fixture-contract";
import { PatchRateAdapter } from "./patch-rate-adapter";

describe("release performance patch adapter", () => {
  it("starts with an online Snapshot and emits ordered probe Patches", async () => {
    const envelopes: DataEnvelope[] = [];
    let connections = 0;
    const adapter = new PatchRateAdapter(createInitialValue(), {
      connectionStarted: () => {
        connections += 1;
      },
      connectionStopped: () => {
        connections -= 1;
      },
    });
    adapter.subscribe((envelope) => envelopes.push(envelope));
    await adapter.start({
      signal: new AbortController().signal,
      now: () => performance.now(),
      emitDiagnostic: () => undefined,
    });
    adapter.pause();
    const emission = adapter.emitProbe(0, "ready");

    expect(envelopes.slice(0, 3).map((envelope) => envelope.kind)).toEqual([
      "connection",
      "connection",
      "snapshot",
    ]);
    expect(envelopes[1]).toMatchObject({ kind: "connection", status: "online" });
    expect(envelopes[2]).toMatchObject({ kind: "snapshot", sequence: 1 });
    expect(envelopes[3]).toMatchObject({
      kind: "patch",
      sequence: 2,
      changes: [{ pointer: "/channels/channel-000/status", value: "ready" }],
    });
    expect(emission).toMatchObject({ sequence: 2, kind: "probe" });
    expect(adapter.stats()).toMatchObject({ configuredHz: FIXTURE_PATCH_RATE_HZ });
    expect(connections).toBe(1);
    await adapter.stop();
    expect(connections).toBe(0);
  });
});
