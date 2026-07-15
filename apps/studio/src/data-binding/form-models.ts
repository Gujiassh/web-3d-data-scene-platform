import type { JsonPrimitive, MockDataSource, Rule } from "@web3d/document";

import { enumerateSampleFields } from "./sample-fields";
import { mockScenario } from "./mock-scenarios";
import type {
  BindingEditorModel,
  BindingRuleDraft,
  DataBindingIdFactory,
  EqualityRuleDraft,
  SampleField,
} from "./types";

const RULE_COLORS = ["#2E7D4D", "#A96800", "#B93632", "#2D6CDF"] as const;

export function createBindingDraft(
  source: MockDataSource,
  ids: DataBindingIdFactory,
  defaultRuleSetName: string,
): BindingRuleDraft {
  const scenario = mockScenario(source.options.scenario);
  const fields = scenario === null ? [] : enumerateSampleFields(scenario.sample);
  const suggestedPointer =
    scenario === null ? undefined : Object.keys(scenario.suggestedValues).sort()[0];
  const pointer = suggestedPointer ?? fields[0]?.pointer ?? "";
  const field = fields.find((candidate) => candidate.pointer === pointer);
  const values = scenario?.suggestedValues[pointer] ?? (field === undefined ? [] : [field.value]);
  return {
    bindingId: ids.next("binding"),
    ruleSetId: ids.next("rule-set"),
    ruleSetName: defaultRuleSetName,
    sourceId: source.id,
    pointer,
    enabled: true,
    fallbackColor: "#6B7280",
    rules: values.map((value, index) => ruleDraft(value, ids.next("rule"), index)),
  };
}

export function editBindingDraft(model: BindingEditorModel): BindingRuleDraft {
  return {
    bindingId: model.binding.id,
    ruleSetId: model.ruleSet.id,
    ruleSetName: model.ruleSet.name,
    sourceId: model.binding.sourceId,
    pointer: model.binding.pointer,
    enabled: model.binding.enabled,
    fallbackColor:
      model.ruleSet.fallback.find((effect) => effect.type === "color")?.value ?? "#6B7280",
    rules: [...model.ruleSet.rules]
      .sort(
        (left, right) => right.priority - left.priority || left.id.localeCompare(right.id, "en"),
      )
      .map((rule) => ruleToDraft(rule)),
  };
}

export function emptyRuleDraft(field: SampleField | undefined, id: string): EqualityRuleDraft {
  return ruleDraft(field?.value ?? "", id, 0);
}

export function selectBindingPointer(
  draft: BindingRuleDraft,
  pointer: string,
  fields: readonly SampleField[],
): BindingRuleDraft {
  const valueType = fields.find((field) => field.pointer === pointer)?.valueType;
  return {
    ...draft,
    pointer,
    rules:
      valueType === undefined
        ? draft.rules
        : draft.rules.map((rule) => ({ ...rule, expectedType: valueType })),
  };
}

function ruleToDraft(rule: Rule): EqualityRuleDraft {
  const color = rule.effects.find((effect) => effect.type === "color");
  const alarm = rule.effects.find((effect) => effect.type === "alarm");
  const expected = "expected" in rule.when ? rule.when.expected : null;
  return {
    id: rule.id,
    expected: primitiveDraft(expected as JsonPrimitive),
    expectedType: primitiveType(expected as JsonPrimitive),
    color: color?.type === "color" ? color.value : "#6B7280",
    alarmEnabled: alarm?.type === "alarm" && alarm.level !== "none",
    alarmLevel: alarm?.type === "alarm" && alarm.level !== "none" ? alarm.level : "warning",
    alarmMessage: alarm?.type === "alarm" ? alarm.message : "",
  };
}

function ruleDraft(value: JsonPrimitive, id: string, index: number): EqualityRuleDraft {
  return {
    id,
    expected: primitiveDraft(value),
    expectedType: primitiveType(value),
    color: RULE_COLORS[index % RULE_COLORS.length]!,
    alarmEnabled: false,
    alarmLevel: "warning",
    alarmMessage: "",
  };
}

function primitiveDraft(value: JsonPrimitive): string {
  if (value === null) return "null";
  return String(value);
}

function primitiveType(value: JsonPrimitive): EqualityRuleDraft["expectedType"] {
  if (value === null) return "null";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  return "string";
}
