import { describe, expect, it } from "vitest";

import type { BindingEditorModel } from "./types";
import { bindingRuleEditorKey, mockSourceEditorKey, targetMappingEditorKey } from "./editor-keys";

describe("data-binding editor keys", () => {
  it("resets target drafts for selection and authoritative business-ID changes", () => {
    expect(targetMappingEditorKey({ ...target(), id: "target-a", businessId: "A" })).not.toBe(
      targetMappingEditorKey({ ...target(), id: "target-b", businessId: "B" }),
    );
    expect(targetMappingEditorKey({ ...target(), businessId: "before" })).not.toBe(
      targetMappingEditorKey({ ...target(), businessId: "after" }),
    );
  });

  it("changes only when the authoritative source record changes", () => {
    const source = mockSource();
    expect(mockSourceEditorKey(source)).toBe(mockSourceEditorKey({ ...source }));
    expect(mockSourceEditorKey(source)).not.toBe(
      mockSourceEditorKey({ ...source, options: { ...source.options, seed: 42 } }),
    );
  });

  it("changes only when the authoritative binding or RuleSet changes", () => {
    const model = bindingModel();
    expect(bindingRuleEditorKey(model)).toBe(
      bindingRuleEditorKey({ ...model, binding: { ...model.binding } }),
    );
    expect(bindingRuleEditorKey(model)).not.toBe(
      bindingRuleEditorKey({
        ...model,
        binding: { ...model.binding, enabled: !model.binding.enabled },
      }),
    );
  });
});

function target() {
  return {
    id: "target-a",
    entityId: "entity-a",
    name: "Target",
    assetHash: "a".repeat(64),
    nodeIndex: null,
    metadata: {},
  } as const;
}

function mockSource() {
  return {
    id: "source-a",
    name: "Status",
    adapter: "mock" as const,
    staleAfterMs: 2_000,
    offlineAfterMs: 5_000,
    options: { scenario: "status-cycle", defaultSpeed: 1 },
  };
}

function bindingModel(): BindingEditorModel {
  return {
    binding: {
      id: "binding-a",
      targetId: "target-a",
      sourceId: "source-a",
      pointer: "/telemetry/status",
      ruleSetId: "rule-set-a",
      writes: ["color"],
      enabled: true,
    },
    ruleSet: {
      id: "rule-set-a",
      name: "Status",
      rules: [
        {
          id: "rule-a",
          priority: 100,
          when: { fact: "value", operator: "eq", expected: "ready" },
          effects: [{ type: "color", value: "#2E7D4D" }],
        },
      ],
      fallback: [{ type: "color", value: "#6B7280" }],
    },
    sharedRuleSet: false,
    supported: true,
  };
}
