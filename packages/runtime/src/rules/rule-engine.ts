import type { SceneEffect, SceneRuleSet } from "../document-contract";
import type { ConnectionStatus, DataQuality, JsonValue } from "../types";

export interface RuleFacts {
  value: JsonValue | undefined;
  quality: DataQuality;
  connection: ConnectionStatus;
}

export interface RuleEvaluation {
  ruleId: string;
  effects: readonly SceneEffect[];
  fallback: boolean;
}

export function evaluateRuleSet(ruleSet: SceneRuleSet, facts: RuleFacts): RuleEvaluation {
  const rules = [...ruleSet.rules].sort(
    (left, right) => right.priority - left.priority || left.id.localeCompare(right.id, "en"),
  );
  const matched = rules.find((rule) => conditionMatches(rule.when, facts));
  if (matched !== undefined) {
    return { ruleId: matched.id, effects: matched.effects, fallback: false };
  }
  return { ruleId: `${ruleSet.id}:fallback`, effects: ruleSet.fallback, fallback: true };
}

function conditionMatches(
  condition: SceneRuleSet["rules"][number]["when"],
  facts: RuleFacts,
): boolean {
  const actual = facts[condition.fact];
  switch (condition.operator) {
    case "eq":
      return jsonEqual(actual, condition.expected);
    case "neq":
      return !jsonEqual(actual, condition.expected);
    case "gt":
      return orderedCompare(actual, condition.expected, (left, right) => left > right);
    case "gte":
      return orderedCompare(actual, condition.expected, (left, right) => left >= right);
    case "lt":
      return orderedCompare(actual, condition.expected, (left, right) => left < right);
    case "lte":
      return orderedCompare(actual, condition.expected, (left, right) => left <= right);
    case "in":
      return Array.isArray(condition.expected)
        ? condition.expected.some((candidate) => jsonEqual(actual, candidate))
        : false;
    case "exists":
      return actual !== undefined && actual !== null;
    case "notExists":
      return actual === undefined || actual === null;
  }
}

function orderedCompare(
  left: unknown,
  right: unknown,
  compare: (left: number | string, right: number | string) => boolean,
): boolean {
  if (typeof left === "number" && typeof right === "number") return compare(left, right);
  if (typeof left === "string" && typeof right === "string") return compare(left, right);
  return false;
}

function jsonEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length && left.every((value, index) => jsonEqual(value, right[index]))
    );
  }
  if (isRecord(left) && isRecord(right)) {
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    return (
      leftKeys.length === rightKeys.length &&
      leftKeys.every((key, index) => key === rightKeys[index] && jsonEqual(left[key], right[key]))
    );
  }
  return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
