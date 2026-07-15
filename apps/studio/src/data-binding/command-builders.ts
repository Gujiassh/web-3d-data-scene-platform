import type {
  Binding,
  ConfigureBindingRuleSetCommand,
  MockDataSource,
  Rule,
  RuleSet,
  SceneDocument,
  SetTargetBusinessIdCommand,
  UpsertMockDataSourceCommand,
} from "@web3d/document";

import { enumerateSampleFields } from "./sample-fields";
import { mockScenario } from "./mock-scenarios";
import type {
  BindingEditorModel,
  BindingRuleDraft,
  DataBindingIdFactory,
  FormResult,
  MockSourceDraft,
  TargetMappingDraft,
} from "./types";
import { validateBindingRuleDraft, validateMockSource, validateTargetMapping } from "./validation";

export function createDataBindingIdFactory(): DataBindingIdFactory {
  return {
    next(kind) {
      return `${kind}-${globalThis.crypto.randomUUID()}`;
    },
  };
}

export function buildTargetBusinessIdCommand(
  targetId: string,
  draft: TargetMappingDraft,
): FormResult<SetTargetBusinessIdCommand> {
  const validation = validateTargetMapping(draft);
  return validation.ok
    ? {
        ok: true,
        value: { type: "set-target-business-id", targetId, businessId: validation.value },
      }
    : validation;
}

export function buildUpsertMockSourceCommand(
  draft: MockSourceDraft,
): FormResult<UpsertMockDataSourceCommand> {
  const validation = validateMockSource(draft);
  return validation.ok
    ? { ok: true, value: { type: "upsert-mock-data-source", source: validation.value } }
    : validation;
}

export function buildConfigureBindingCommand(
  document: SceneDocument,
  targetId: string,
  draft: BindingRuleDraft,
): FormResult<ConfigureBindingRuleSetCommand> {
  const source = document.dataSources.find(
    (candidate): candidate is MockDataSource =>
      candidate.id === draft.sourceId && candidate.adapter === "mock",
  );
  const scenario = source === undefined ? null : mockScenario(source.options.scenario);
  const fields = scenario === null ? [] : enumerateSampleFields(scenario.sample);
  const validation = validateBindingRuleDraft(draft, fields);
  if (!validation.ok) return validation;
  const binding: Binding = {
    id: draft.bindingId,
    targetId,
    sourceId: draft.sourceId,
    pointer: draft.pointer,
    ruleSetId: draft.ruleSetId,
    writes: deriveWrites(validation.value.rules, validation.value.fallback),
    enabled: draft.enabled,
  };
  const ruleSet: RuleSet = {
    id: draft.ruleSetId,
    name: draft.ruleSetName.trim(),
    rules: validation.value.rules,
    fallback: validation.value.fallback,
  };
  return { ok: true, value: { type: "configure-binding-rule-set", binding, ruleSet } };
}

export function bindingEditorModels(
  document: SceneDocument,
  targetId: string,
): readonly BindingEditorModel[] {
  const bindings = document.bindings.filter((binding) => binding.targetId === targetId);
  const references = new Map<string, number>();
  document.bindings.forEach((binding) => {
    references.set(binding.ruleSetId, (references.get(binding.ruleSetId) ?? 0) + 1);
  });
  return bindings.flatMap((binding) => {
    const ruleSet = document.ruleSets.find((candidate) => candidate.id === binding.ruleSetId);
    if (ruleSet === undefined) return [];
    return [
      {
        binding,
        ruleSet,
        sharedRuleSet: (references.get(ruleSet.id) ?? 0) > 1,
        supported: isSupportedRuleSet(ruleSet),
      },
    ];
  });
}

export function isSupportedRuleSet(ruleSet: RuleSet): boolean {
  return (
    ruleSet.rules.length > 0 &&
    ruleSet.rules.every(
      (rule) =>
        rule.when.fact === "value" &&
        rule.when.operator === "eq" &&
        isJsonPrimitive(rule.when.expected) &&
        rule.effects.length >= 1 &&
        rule.effects.every(
          (effect) =>
            effect.type === "color" || (effect.type === "alarm" && effect.level !== "none"),
        ) &&
        rule.effects.filter((effect) => effect.type === "color").length === 1 &&
        rule.effects.filter((effect) => effect.type === "alarm").length <= 1,
    ) &&
    ruleSet.fallback.length === 1 &&
    ruleSet.fallback[0]?.type === "color"
  );
}

function isJsonPrimitive(value: unknown): value is string | number | boolean | null {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

function deriveWrites(rules: readonly Rule[], fallback: RuleSet["fallback"]): Binding["writes"] {
  const types = new Set(
    [...rules.flatMap((rule) => rule.effects), ...fallback].map((effect) => effect.type),
  );
  return (["color", "alarm"] as const).filter((type) => types.has(type));
}
