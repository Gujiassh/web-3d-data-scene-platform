import { describe, expect, it } from "vitest";

import type { Diagnostic, RuntimeAlarm } from "@web3d/runtime";

import { createStudioPreviewState, reduceStudioPreview } from "./preview-state";

describe("Studio preview reducer", () => {
  it("reduces transient runtime state and clears it on stop", () => {
    let state = reduceStudioPreview(createStudioPreviewState(), { type: "started" });
    state = reduceStudioPreview(state, {
      type: "connection-changed",
      sourceId: "source-a",
      status: "online",
    });
    state = reduceStudioPreview(state, {
      type: "binding-state-changed",
      state: {
        bindingId: "binding-a",
        targetId: "target-a",
        sourceId: "source-a",
        value: "ready",
        quality: "good",
        connection: "online",
      },
    });
    state = reduceStudioPreview(state, {
      type: "alarm-changed",
      transition: "opened",
      alarm: alarm(),
    });

    expect(state).toMatchObject({
      active: true,
      connections: { "source-a": "online" },
      values: { "binding-a": { value: "ready" } },
    });
    expect(state.alarms).toHaveLength(1);
    state = reduceStudioPreview(state, {
      type: "binding-state-cleared",
      bindingId: "binding-a",
    });
    expect(state.values).toEqual({});
    state = reduceStudioPreview(state, { type: "stopped" });
    expect(state).toEqual(createStudioPreviewState());

    const late = reduceStudioPreview(state, {
      type: "connection-changed",
      sourceId: "source-a",
      status: "error",
    });
    expect(late).toBe(state);
  });

  it("reconciles alarm keys and bounds diagnostics", () => {
    let state = createStudioPreviewState(true);
    state = reduceStudioPreview(state, {
      type: "alarm-changed",
      transition: "opened",
      alarm: alarm(),
    });
    state = reduceStudioPreview(state, {
      type: "alarm-changed",
      transition: "updated",
      alarm: { ...alarm(), message: "Updated" },
    });
    expect(state.alarms).toEqual([{ ...alarm(), message: "Updated" }]);
    for (let index = 0; index < 20; index += 1) {
      state = reduceStudioPreview(state, {
        type: "diagnostic-added",
        diagnostic: diagnostic(String(index)),
      });
    }
    expect(state.diagnostics).toHaveLength(12);
    expect(state.diagnostics[0]?.message).toBe("8");
  });

  it("clears transient unsupported-source evidence when Run stops", () => {
    let state = reduceStudioPreview(createStudioPreviewState(), { type: "started" });
    state = reduceStudioPreview(state, {
      type: "connection-changed",
      sourceId: "legacy-source",
      status: "error",
    });
    state = reduceStudioPreview(state, {
      type: "diagnostic-added",
      diagnostic: {
        code: "DATASOURCE_CONNECTION_FAILED",
        severity: "error",
        source: "adapter",
        sourceId: "legacy-source",
        message:
          "source-adapter-unsupported sourceId=legacy-source adapter=mock scenario=legacy-scenario",
      },
    });
    expect(state).toMatchObject({
      active: true,
      connections: { "legacy-source": "error" },
      diagnostics: [{ code: "DATASOURCE_CONNECTION_FAILED", sourceId: "legacy-source" }],
    });
    expect(reduceStudioPreview(state, { type: "stopped" })).toEqual(createStudioPreviewState());
  });
});

function alarm(): RuntimeAlarm {
  return {
    key: "target-a\u0000binding-a\u0000rule-a",
    targetId: "target-a",
    bindingId: "binding-a",
    ruleId: "rule-a",
    sourceId: "source-a",
    level: "critical",
    message: "Critical state",
  };
}

function diagnostic(message: string): Diagnostic {
  return { code: "RULE_EVALUATION_FAILED", source: "rule", severity: "error", message };
}
