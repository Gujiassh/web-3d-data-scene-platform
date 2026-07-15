import type { Binding, DataSource, MockDataSource, RuleSet, SceneDocument } from "../types.js";
import type { DataBindingDocumentCommand } from "./types.js";

export function applyDataBindingDocumentCommand(
  document: SceneDocument,
  command: DataBindingDocumentCommand,
): SceneDocument {
  switch (command.type) {
    case "set-target-business-id":
      return setTargetBusinessId(document, command.targetId, command.businessId);
    case "upsert-mock-data-source":
      return upsertMockDataSource(document, command.source);
    case "configure-binding-rule-set":
      return configureBindingRuleSet(document, command.binding, command.ruleSet);
    case "remove-binding":
      return removeBinding(document, command.bindingId);
    case "remove-mock-data-source":
      return removeMockDataSource(document, command.sourceId);
  }
}

function setTargetBusinessId(
  document: SceneDocument,
  targetId: string,
  value: string | null,
): SceneDocument {
  const target = document.targets.find((candidate) => candidate.id === targetId);
  if (target === undefined) throw new Error(`Target '${targetId}' does not exist.`);

  const businessId = normalizeBusinessId(value);
  if (target.businessId === businessId) return document;
  return reviseDocument(document, {
    targets: document.targets.map((candidate) => {
      if (candidate.id !== targetId) return candidate;
      if (businessId === undefined) {
        return withoutBusinessId(candidate);
      }
      return { ...candidate, businessId };
    }),
  });
}

function upsertMockDataSource(document: SceneDocument, input: MockDataSource): SceneDocument {
  const source = normalizeMockDataSource(input);
  const existing = document.dataSources.find((candidate) => candidate.id === source.id);
  if (existing === undefined) assertUnusedId(document, source.id, "data source");
  if (existing !== undefined && existing.adapter !== "mock") {
    throw new Error(`Data source '${source.id}' is not a Mock data source.`);
  }
  if (existing !== undefined && recordsEqual(existing, source)) return document;

  return reviseDocument(document, {
    dataSources:
      existing === undefined
        ? [...document.dataSources, source]
        : replaceById(document.dataSources, source.id, source),
  });
}

function configureBindingRuleSet(
  document: SceneDocument,
  inputBinding: Binding,
  inputRuleSet: RuleSet,
): SceneDocument {
  if (inputBinding.ruleSetId !== inputRuleSet.id) {
    throw new Error(`Binding '${inputBinding.id}' must reference rule set '${inputRuleSet.id}'.`);
  }
  const existingBinding = document.bindings.find((candidate) => candidate.id === inputBinding.id);
  if (
    (existingBinding === undefined || existingBinding.pointer !== inputBinding.pointer) &&
    !isCanonicalJsonPointer(inputBinding.pointer)
  ) {
    throw new Error(
      `Binding '${inputBinding.id}' pointer must be a canonical RFC 6901 JSON Pointer.`,
    );
  }

  const binding = cloneBinding(inputBinding);
  const ruleSet = cloneRuleSet(inputRuleSet);
  const existingRuleSet = document.ruleSets.find((candidate) => candidate.id === ruleSet.id);
  if (existingBinding !== undefined && existingBinding.ruleSetId !== binding.ruleSetId) {
    throw new Error(`Binding '${binding.id}' cannot change its rule set.`);
  }
  const hasOtherRuleSetReferences = document.bindings.some(
    (candidate) => candidate.ruleSetId === ruleSet.id && candidate.id !== binding.id,
  );
  if (
    existingRuleSet !== undefined &&
    hasOtherRuleSetReferences &&
    !recordsEqual(existingRuleSet, ruleSet)
  ) {
    throw new Error(`Rule set '${ruleSet.id}' is shared and cannot be changed by this command.`);
  }
  if (existingBinding === undefined) assertUnusedId(document, binding.id, "binding");
  if (existingRuleSet === undefined) assertUnusedId(document, ruleSet.id, "rule set");
  if (
    existingBinding !== undefined &&
    existingRuleSet !== undefined &&
    recordsEqual(existingBinding, binding) &&
    recordsEqual(existingRuleSet, ruleSet)
  ) {
    return document;
  }

  return reviseDocument(document, {
    bindings:
      existingBinding === undefined
        ? [...document.bindings, binding]
        : replaceById(document.bindings, binding.id, binding),
    ruleSets:
      existingRuleSet === undefined
        ? [...document.ruleSets, ruleSet]
        : replaceById(document.ruleSets, ruleSet.id, ruleSet),
  });
}

function removeBinding(document: SceneDocument, bindingId: string): SceneDocument {
  const removed = document.bindings.find((binding) => binding.id === bindingId);
  if (removed === undefined) throw new Error(`Binding '${bindingId}' does not exist.`);
  const bindings = document.bindings.filter((binding) => binding.id !== bindingId);
  return reviseDocument(document, {
    bindings,
    ruleSets: removeUnreferencedRuleSets(document.ruleSets, bindings, [removed.ruleSetId]),
  });
}

function removeMockDataSource(document: SceneDocument, sourceId: string): SceneDocument {
  const source = document.dataSources.find((candidate) => candidate.id === sourceId);
  if (source === undefined) throw new Error(`Data source '${sourceId}' does not exist.`);
  if (source.adapter !== "mock")
    throw new Error(`Data source '${sourceId}' is not a Mock data source.`);

  const removedBindings = document.bindings.filter((binding) => binding.sourceId === sourceId);
  const bindings = document.bindings.filter((binding) => binding.sourceId !== sourceId);
  return reviseDocument(document, {
    dataSources: document.dataSources.filter((candidate) => candidate.id !== sourceId),
    bindings,
    ruleSets: removeUnreferencedRuleSets(
      document.ruleSets,
      bindings,
      removedBindings.map((binding) => binding.ruleSetId),
    ),
  });
}

function removeUnreferencedRuleSets(
  ruleSets: readonly RuleSet[],
  remainingBindings: readonly Binding[],
  candidates: readonly string[],
): readonly RuleSet[] {
  const candidateIds = new Set(candidates);
  const referencedIds = new Set(remainingBindings.map((binding) => binding.ruleSetId));
  return ruleSets.filter(
    (ruleSet) => !candidateIds.has(ruleSet.id) || referencedIds.has(ruleSet.id),
  );
}

function reviseDocument(
  document: SceneDocument,
  overrides: Partial<Omit<SceneDocument, "revision">>,
): SceneDocument {
  return { ...document, ...overrides, revision: document.revision + 1 };
}

function replaceById<T extends { readonly id: string }>(
  values: readonly T[],
  id: string,
  replacement: T,
): readonly T[] {
  return values.map((value) => (value.id === id ? replacement : value));
}

function assertUnusedId(document: SceneDocument, id: string, label: string): void {
  const used =
    document.id === id ||
    document.assets.some((asset) => asset.id === id) ||
    document.entities.some((entity) => entity.id === id) ||
    document.targets.some((target) => target.id === id) ||
    document.dataSources.some((source) => source.id === id) ||
    document.bindings.some((binding) => binding.id === id) ||
    document.ruleSets.some((ruleSet) => ruleSet.id === id) ||
    document.ruleSets.some((ruleSet) => ruleSet.rules.some((rule) => rule.id === id)) ||
    document.annotations.some((annotation) => annotation.id === id) ||
    document.views.some((view) => view.id === id);
  if (used) throw new Error(`${label} ID '${id}' is already in use.`);
}

function normalizeBusinessId(value: string | null): string | undefined {
  if (value === null) return undefined;
  const normalized = value.trim();
  if (normalized.length === 0) throw new Error("Target business ID must not be empty.");
  if ([...normalized].length > 160) {
    throw new Error("Target business ID must not exceed 160 characters.");
  }
  if (/\p{Cc}/u.test(normalized)) {
    throw new Error("Target business ID must not contain control characters.");
  }
  return normalized;
}

function withoutBusinessId(target: SceneDocument["targets"][number]) {
  const remaining = { ...target };
  delete remaining.businessId;
  return remaining;
}

function isCanonicalJsonPointer(pointer: string): boolean {
  if (pointer === "") return true;
  if (!pointer.startsWith("/")) return false;
  return pointer
    .slice(1)
    .split("/")
    .every((token) => !/~(?:[^01]|$)/u.test(token));
}

function normalizeMockDataSource(source: MockDataSource): MockDataSource {
  const name = source.name.trim();
  const scenario = source.options.scenario.trim();
  if (name.length === 0) throw new Error("Mock data source name must not be empty.");
  if (scenario.length === 0) throw new Error("Mock data source scenario must not be empty.");
  return { ...source, name, options: { ...source.options, scenario } };
}

function cloneBinding(binding: Binding): Binding {
  return { ...binding, writes: [...binding.writes] };
}

function cloneRuleSet(ruleSet: RuleSet): RuleSet {
  return {
    ...ruleSet,
    rules: ruleSet.rules.map((rule) => ({
      ...rule,
      when: { ...rule.when },
      effects: rule.effects.map((effect) => ({ ...effect })),
    })),
    fallback: ruleSet.fallback.map((effect) => ({ ...effect })),
  };
}

function recordsEqual(
  left: DataSource | Binding | RuleSet,
  right: DataSource | Binding | RuleSet,
): boolean {
  return valuesEqual(left, right);
}

function valuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length && left.every((value, index) => valuesEqual(value, right[index]))
    );
  }
  if (!isRecord(left) || !isRecord(right)) return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every((key, index) => key === rightKeys[index] && valuesEqual(left[key], right[key]))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
