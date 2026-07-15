import type { JsonPrimitive, MockDataSource, Rule, RuleSet } from "@web3d/document";

import { mockScenario } from "./mock-scenarios";
import type {
  BindingRuleDraft,
  EqualityRuleDraft,
  FormIssue,
  FormResult,
  MockSourceDraft,
  SampleField,
  TargetMappingDraft,
} from "./types";

const NAME_MAX_LENGTH = 160;
const MESSAGE_MAX_LENGTH = 240;
const HEX_COLOR = /^#[0-9a-f]{6}$/iu;
export const STRING_EXPECTED_MAX_LENGTH = 160;

export function validateTargetMapping(draft: TargetMappingDraft): FormResult<string> {
  const value = draft.businessId.trim();
  const issues: FormIssue[] = [];
  if (value.length === 0) issues.push(issue("business-id-required", "businessId"));
  if (value.length > NAME_MAX_LENGTH) issues.push(issue("business-id-too-long", "businessId"));
  if (/\p{Cc}/u.test(value)) issues.push(issue("business-id-control-character", "businessId"));
  return result(issues, value);
}

export function validateMockSource(draft: MockSourceDraft): FormResult<MockDataSource> {
  const name = draft.name.trim();
  const staleAfterMs = parseInteger(draft.staleAfterMs);
  const offlineAfterMs = parseInteger(draft.offlineAfterMs);
  const seed = draft.seed.trim() === "" ? undefined : parseInteger(draft.seed);
  const defaultSpeed = draft.defaultSpeed.trim() === "" ? undefined : Number(draft.defaultSpeed);
  const issues: FormIssue[] = [];

  if (name.length === 0) issues.push(issue("source-name-required", "name"));
  if (name.length > NAME_MAX_LENGTH) issues.push(issue("source-name-too-long", "name"));
  if (mockScenario(draft.scenario) === null) issues.push(issue("scenario-unknown", "scenario"));
  if (staleAfterMs === null || staleAfterMs < 1_000) {
    issues.push(issue("stale-threshold-invalid", "staleAfterMs"));
  }
  if (offlineAfterMs === null || offlineAfterMs < 1_000) {
    issues.push(issue("offline-threshold-invalid", "offlineAfterMs"));
  }
  if (staleAfterMs !== null && offlineAfterMs !== null && offlineAfterMs <= staleAfterMs) {
    issues.push(issue("threshold-order-invalid", "offlineAfterMs"));
  }
  if (draft.seed.trim() !== "" && seed === null) issues.push(issue("seed-invalid", "seed"));
  if (
    draft.defaultSpeed.trim() !== "" &&
    (!Number.isFinite(defaultSpeed) ||
      defaultSpeed === undefined ||
      defaultSpeed <= 0 ||
      defaultSpeed > 16)
  ) {
    issues.push(issue("speed-invalid", "defaultSpeed"));
  }

  if (issues.length > 0 || staleAfterMs === null || offlineAfterMs === null || seed === null) {
    return { ok: false, issues };
  }
  return {
    ok: true,
    value: {
      id: draft.id,
      name,
      adapter: "mock",
      staleAfterMs,
      offlineAfterMs,
      options: {
        scenario: draft.scenario,
        ...(seed === undefined ? {} : { seed }),
        ...(defaultSpeed === undefined ? {} : { defaultSpeed }),
      },
    },
  };
}

export function validateBindingRuleDraft(
  draft: BindingRuleDraft,
  fields: readonly SampleField[],
): FormResult<{ readonly rules: readonly Rule[]; readonly fallback: RuleSet["fallback"] }> {
  const issues: FormIssue[] = [];
  const name = draft.ruleSetName.trim();
  if (draft.sourceId === "") issues.push(issue("source-required", "sourceId"));
  if (draft.pointer === "") issues.push(issue("path-required", "pointer"));
  if (draft.pointer !== "" && !fields.some((field) => field.pointer === draft.pointer)) {
    issues.push(issue("path-unknown", "pointer"));
  }
  if (name.length === 0) issues.push(issue("rule-set-name-required", "ruleSetName"));
  if (name.length > NAME_MAX_LENGTH) {
    issues.push(issue("rule-set-name-too-long", "ruleSetName"));
  }
  if (draft.rules.length === 0) issues.push(issue("rules-required", "rules"));
  if (!HEX_COLOR.test(draft.fallbackColor)) {
    issues.push(issue("fallback-color-invalid", "fallbackColor"));
  }

  const parsed = draft.rules.map((rule, index) =>
    parseRule(rule, index, draft.rules.length, issues),
  );
  const values = parsed
    .filter((value): value is Rule => value !== null)
    .map((rule) => JSON.stringify(rule.when.expected));
  const duplicateValues = new Set<string>();
  values.forEach((value, index) => {
    if (values.indexOf(value) !== index) duplicateValues.add(value);
  });
  draft.rules.forEach((rule, index) => {
    const value = parseExpected(rule.expected, rule.expectedType);
    if (value.ok && duplicateValues.has(JSON.stringify(value.value))) {
      issues.push(issue("rule-expected-duplicate", `rules.${index}.expected`));
    }
  });

  if (issues.length > 0 || parsed.some((value) => value === null)) return { ok: false, issues };
  return {
    ok: true,
    value: {
      rules: parsed as readonly Rule[],
      fallback: [{ type: "color", value: draft.fallbackColor.toUpperCase() }],
    },
  };
}

export function parseExpected(
  draft: string,
  type: EqualityRuleDraft["expectedType"],
): FormResult<JsonPrimitive> {
  if (type === "null") return { ok: true, value: null };
  if (type === "string") {
    const value = draft.trim();
    if (value === "") {
      return { ok: false, issues: [issue("rule-expected-invalid", "expected")] };
    }
    if (value.length > STRING_EXPECTED_MAX_LENGTH) {
      return { ok: false, issues: [issue("rule-expected-too-long", "expected")] };
    }
    return { ok: true, value };
  }
  if (type === "boolean") {
    if (draft === "true") return { ok: true, value: true };
    if (draft === "false") return { ok: true, value: false };
    return { ok: false, issues: [issue("rule-expected-invalid", "expected")] };
  }
  if (draft.trim() === "") {
    return { ok: false, issues: [issue("rule-expected-invalid", "expected")] };
  }
  const value = Number(draft);
  return Number.isFinite(value)
    ? { ok: true, value }
    : { ok: false, issues: [issue("rule-expected-invalid", "expected")] };
}

function parseRule(
  draft: EqualityRuleDraft,
  index: number,
  ruleCount: number,
  issues: FormIssue[],
): Rule | null {
  const expected = parseExpected(draft.expected, draft.expectedType);
  if (!expected.ok) {
    issues.push(
      issue(expected.issues[0]?.code ?? "rule-expected-invalid", `rules.${index}.expected`),
    );
  }
  if (!HEX_COLOR.test(draft.color))
    issues.push(issue("rule-color-invalid", `rules.${index}.color`));
  const message = draft.alarmMessage.trim();
  if (draft.alarmEnabled && message.length === 0) {
    issues.push(issue("alarm-message-required", `rules.${index}.alarmMessage`));
  }
  if (message.length > MESSAGE_MAX_LENGTH) {
    issues.push(issue("alarm-message-too-long", `rules.${index}.alarmMessage`));
  }
  if (!expected.ok || !HEX_COLOR.test(draft.color)) return null;

  return {
    id: draft.id,
    priority: (ruleCount - index) * 100,
    when: { fact: "value", operator: "eq", expected: expected.value },
    effects: [
      { type: "color", value: draft.color.toUpperCase() },
      ...(draft.alarmEnabled
        ? ([{ type: "alarm", level: draft.alarmLevel, message }] as const)
        : []),
    ],
  };
}

function parseInteger(value: string): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function issue(code: FormIssue["code"], field: string): FormIssue {
  return { code, field };
}

function result<T>(issues: readonly FormIssue[], value: T): FormResult<T> {
  return issues.length === 0 ? { ok: true, value } : { ok: false, issues };
}
