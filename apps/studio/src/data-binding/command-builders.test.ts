import { describe, expect, it } from "vitest";

import type { RuleSet, SceneDocument } from "@web3d/document";

import { createNewStudioProject } from "../session/new-project";
import {
  bindingEditorModels,
  buildConfigureBindingCommand,
  buildTargetBusinessIdCommand,
  buildUpsertMockSourceCommand,
  isSupportedRuleSet,
} from "./command-builders";
import type { BindingRuleDraft, MockSourceDraft } from "./types";
import { sourceDraft as draftFromSource } from "./types";
import { parseExpected } from "./validation";

describe("Studio data-binding command builders", () => {
  it("validates target IDs and Mock source thresholds before building commands", () => {
    expect(buildTargetBusinessIdCommand("target-a", { businessId: "  DEVICE-A  " })).toEqual({
      ok: true,
      value: { type: "set-target-business-id", targetId: "target-a", businessId: "DEVICE-A" },
    });
    expect(buildTargetBusinessIdCommand("target-a", { businessId: " " }).ok).toBe(false);

    const valid = buildUpsertMockSourceCommand(sourceDraft());
    expect(valid).toMatchObject({
      ok: true,
      value: {
        type: "upsert-mock-data-source",
        source: { name: "Local status", staleAfterMs: 2_000, offlineAfterMs: 5_000 },
      },
    });
    expect(
      buildUpsertMockSourceCommand({ ...sourceDraft(), offlineAfterMs: "1000" }),
    ).toMatchObject({ ok: false, issues: [{ code: "threshold-order-invalid" }] });
  });

  it("builds one atomic Binding and RuleSet with deterministic priority and writes", () => {
    const document = documentWithSource();
    const built = buildConfigureBindingCommand(document, "target-a", bindingDraft());
    expect(built).toMatchObject({
      ok: true,
      value: {
        type: "configure-binding-rule-set",
        binding: {
          id: "binding-a",
          targetId: "target-a",
          sourceId: "source-a",
          pointer: "/telemetry/status",
          writes: ["color", "alarm"],
        },
        ruleSet: {
          id: "rule-set-a",
          rules: [
            { priority: 200, when: { expected: "ready" } },
            { priority: 100, when: { expected: "critical" } },
          ],
        },
      },
    });
  });

  it("rejects unknown paths, duplicate values, and invalid colors without a command", () => {
    const invalid = buildConfigureBindingCommand(documentWithSource(), "target-a", {
      ...bindingDraft(),
      pointer: "/unknown",
      fallbackColor: "red",
      rules: [bindingDraft().rules[0]!, bindingDraft().rules[0]!],
    });
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) {
      expect(invalid.issues.map((issue) => issue.code)).toEqual(
        expect.arrayContaining([
          "path-unknown",
          "fallback-color-invalid",
          "rule-expected-duplicate",
        ]),
      );
    }
  });

  it.each(["", "   ", "\t\n"])("rejects an empty numeric expected value %j", (expected) => {
    expect(parseExpected(expected, "number")).toMatchObject({
      ok: false,
      issues: [{ code: "rule-expected-invalid" }],
    });
  });

  it("accepts 160 string characters and rejects 161 before creating a command", () => {
    const atLimit = {
      ...bindingDraft(),
      rules: [{ ...bindingDraft().rules[0]!, expected: "x".repeat(160) }, bindingDraft().rules[1]!],
    };
    expect(buildConfigureBindingCommand(documentWithSource(), "target-a", atLimit).ok).toBe(true);

    const overLimit = {
      ...atLimit,
      rules: [{ ...atLimit.rules[0]!, expected: "x".repeat(161) }, atLimit.rules[1]!],
    };
    expect(buildConfigureBindingCommand(documentWithSource(), "target-a", overLimit)).toMatchObject(
      {
        ok: false,
        issues: [{ code: "rule-expected-too-long", field: "rules.0.expected" }],
      },
    );
  });

  it("preserves an existing hidden seed while editing functional source fields", () => {
    const existing = {
      id: "source-a",
      name: "Status",
      adapter: "mock" as const,
      staleAfterMs: 2_000,
      offlineAfterMs: 5_000,
      options: { scenario: "status-cycle", seed: 41, defaultSpeed: 1 },
    };
    const draft = { ...draftFromSource(existing), name: "Updated", defaultSpeed: "2" };
    expect(buildUpsertMockSourceCommand(draft)).toMatchObject({
      ok: true,
      value: { source: { name: "Updated", options: { seed: 41, defaultSpeed: 2 } } },
    });
  });

  it("marks shared and unsupported RuleSets read-only", () => {
    const document = documentWithSource();
    const supported = ruleSet();
    const unsupported: RuleSet = {
      ...ruleSet(),
      id: "rule-set-b",
      rules: [
        {
          ...ruleSet().rules[0]!,
          when: { fact: "connection", operator: "eq", expected: "offline" },
        },
      ],
    };
    const configured: SceneDocument = {
      ...document,
      ruleSets: [supported, unsupported],
      bindings: [
        binding("binding-a", "target-a", supported.id),
        binding("binding-shared", "target-b", supported.id),
        binding("binding-b", "target-a", unsupported.id),
      ],
    };
    expect(isSupportedRuleSet(supported)).toBe(true);
    expect(isSupportedRuleSet(unsupported)).toBe(false);
    expect(bindingEditorModels(configured, "target-a")).toMatchObject([
      { sharedRuleSet: true, supported: true },
      { sharedRuleSet: false, supported: false },
    ]);
  });

  it("preserves object expectations and disabled alarms as unsupported read-only RuleSets", () => {
    const objectExpected: RuleSet = {
      ...ruleSet(),
      id: "rule-set-object",
      rules: [
        {
          ...ruleSet().rules[0]!,
          when: { fact: "value", operator: "eq", expected: { nested: true } },
        },
      ],
    };
    const disabledAlarm: RuleSet = {
      ...ruleSet(),
      id: "rule-set-none-alarm",
      rules: [
        {
          ...ruleSet().rules[0]!,
          effects: [
            { type: "color", value: "#2E7D4D" },
            { type: "alarm", level: "none", message: "Preserve disabled alarm" },
          ],
        },
      ],
    };
    const arrayExpected: RuleSet = {
      ...ruleSet(),
      id: "rule-set-array",
      rules: [
        {
          ...ruleSet().rules[0]!,
          when: { fact: "value", operator: "eq", expected: ["ready"] },
        },
      ],
    };
    const document: SceneDocument = {
      ...documentWithSource(),
      ruleSets: [objectExpected, arrayExpected, disabledAlarm],
      bindings: [
        binding("binding-object", "target-a", objectExpected.id),
        binding("binding-array", "target-a", arrayExpected.id),
        binding("binding-none-alarm", "target-a", disabledAlarm.id),
      ],
    };

    const models = bindingEditorModels(document, "target-a");
    expect(models).toMatchObject([
      { supported: false },
      { supported: false },
      { supported: false },
    ]);
    expect(models[0]?.ruleSet).toBe(objectExpected);
    expect(models[1]?.ruleSet).toBe(arrayExpected);
    expect(models[2]?.ruleSet).toBe(disabledAlarm);
    expect(objectExpected.rules[0]?.when).toEqual({
      fact: "value",
      operator: "eq",
      expected: { nested: true },
    });
    expect(arrayExpected.rules[0]?.when).toEqual({
      fact: "value",
      operator: "eq",
      expected: ["ready"],
    });
    expect(disabledAlarm.rules[0]?.effects[1]).toEqual({
      type: "alarm",
      level: "none",
      message: "Preserve disabled alarm",
    });
  });
});

function sourceDraft(): MockSourceDraft {
  return {
    id: "source-a",
    name: " Local status ",
    scenario: "status-cycle",
    staleAfterMs: "2000",
    offlineAfterMs: "5000",
    seed: "7",
    defaultSpeed: "1",
  };
}

function bindingDraft(): BindingRuleDraft {
  return {
    bindingId: "binding-a",
    ruleSetId: "rule-set-a",
    ruleSetName: "Status rules",
    sourceId: "source-a",
    pointer: "/telemetry/status",
    enabled: true,
    fallbackColor: "#6B7280",
    rules: [
      {
        id: "rule-a",
        expected: "ready",
        expectedType: "string",
        color: "#2E7D4D",
        alarmEnabled: false,
        alarmLevel: "info",
        alarmMessage: "",
      },
      {
        id: "rule-b",
        expected: "critical",
        expectedType: "string",
        color: "#B93632",
        alarmEnabled: true,
        alarmLevel: "critical",
        alarmMessage: "Critical state",
      },
    ],
  };
}

function documentWithSource(): SceneDocument {
  const document = createNewStudioProject({
    id: "project-a",
    name: "Project A",
    createdAt: "2026-07-15T00:00:00Z",
  }).document;
  const sourceResult = buildUpsertMockSourceCommand(sourceDraft());
  if (!sourceResult.ok) throw new Error("Source fixture must be valid.");
  return { ...document, dataSources: [sourceResult.value.source] };
}

function ruleSet(): RuleSet {
  return {
    id: "rule-set-a",
    name: "Status rules",
    rules: [
      {
        id: "rule-a",
        priority: 100,
        when: { fact: "value", operator: "eq", expected: "ready" },
        effects: [{ type: "color", value: "#2E7D4D" }],
      },
    ],
    fallback: [{ type: "color", value: "#6B7280" }],
  };
}

function binding(id: string, targetId: string, ruleSetId: string) {
  return {
    id,
    targetId,
    sourceId: "source-a",
    pointer: "/telemetry/status",
    ruleSetId,
    writes: ["color"] as const,
    enabled: true,
  };
}
