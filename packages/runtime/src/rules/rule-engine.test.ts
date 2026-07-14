import type { RuleSet } from "@web3d/document";
import { describe, expect, it } from "vitest";

import { evaluateRuleSet } from "./rule-engine";

const ruleSet: RuleSet = {
  id: "status-rules",
  name: "Status",
  rules: [
    {
      id: "running-b",
      priority: 100,
      when: { fact: "value", operator: "eq", expected: "running" },
      effects: [{ type: "color", value: "#00AA00" }],
    },
    {
      id: "running-a",
      priority: 100,
      when: { fact: "value", operator: "eq", expected: "running" },
      effects: [{ type: "color", value: "#008800" }],
    },
  ],
  fallback: [{ type: "color", value: "#666666" }],
};

describe("evaluateRuleSet", () => {
  it("uses priority then stable rule id ordering", () => {
    const result = evaluateRuleSet(ruleSet, {
      value: "running",
      quality: "good",
      connection: "online",
    });

    expect(result.ruleId).toBe("running-a");
    expect(result.effects).toEqual([{ type: "color", value: "#008800" }]);
  });

  it("uses fallback when no rule matches", () => {
    expect(
      evaluateRuleSet(ruleSet, {
        value: "idle",
        quality: "good",
        connection: "online",
      }),
    ).toMatchObject({ ruleId: "status-rules:fallback", fallback: true });
  });
});
