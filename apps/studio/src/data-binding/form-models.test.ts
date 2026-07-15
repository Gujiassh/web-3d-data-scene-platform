import { describe, expect, it } from "vitest";

import { selectBindingPointer } from "./form-models";
import type { BindingRuleDraft, SampleField } from "./types";

describe("selectBindingPointer", () => {
  it.each([
    [2, "number"],
    [true, "boolean"],
    [null, "null"],
  ] as const)("updates rules for a %s field while preserving entered text", (value, valueType) => {
    const draft = bindingDraft();
    const fields: readonly SampleField[] = [{ pointer: "/telemetry/next", value, valueType }];

    expect(selectBindingPointer(draft, "/telemetry/next", fields)).toMatchObject({
      pointer: "/telemetry/next",
      rules: [{ expected: "not-yet-a-number", expectedType: valueType }],
    });
    expect(draft).toMatchObject({
      pointer: "/telemetry/status",
      rules: [{ expected: "not-yet-a-number", expectedType: "string" }],
    });
  });
});

function bindingDraft(): BindingRuleDraft {
  return {
    bindingId: "binding-a",
    ruleSetId: "rule-set-a",
    ruleSetName: "Status",
    sourceId: "source-a",
    pointer: "/telemetry/status",
    enabled: true,
    fallbackColor: "#6B7280",
    rules: [
      {
        id: "rule-a",
        expected: "not-yet-a-number",
        expectedType: "string",
        color: "#2E7D4D",
        alarmEnabled: false,
        alarmLevel: "warning",
        alarmMessage: "",
      },
    ],
  };
}
