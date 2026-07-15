import type { Binding, MockDataSource, RuleSet, SceneTarget } from "@web3d/document";
import type {
  ConnectionStatus,
  DataQuality,
  Diagnostic,
  JsonPrimitive,
  JsonValue,
  RuntimeAlarm,
} from "@web3d/runtime";

export type TargetResolution =
  | { readonly status: "no-selection" }
  | { readonly status: "unsupported-entity" }
  | { readonly status: "no-root-target"; readonly targets: readonly SceneTarget[] }
  | { readonly status: "ambiguous-root-target"; readonly targets: readonly SceneTarget[] }
  | { readonly status: "supported"; readonly target: SceneTarget };

export interface SampleField {
  readonly pointer: string;
  readonly value: JsonPrimitive;
  readonly valueType: "string" | "number" | "boolean" | "null";
}

export interface TargetMappingDraft {
  readonly businessId: string;
}

export interface MockSourceDraft {
  readonly id: string;
  readonly name: string;
  readonly scenario: string;
  readonly staleAfterMs: string;
  readonly offlineAfterMs: string;
  readonly seed: string;
  readonly defaultSpeed: string;
}

export interface EqualityRuleDraft {
  readonly id: string;
  readonly expected: string;
  readonly expectedType: SampleField["valueType"];
  readonly color: string;
  readonly alarmEnabled: boolean;
  readonly alarmLevel: "info" | "warning" | "critical";
  readonly alarmMessage: string;
}

export interface BindingRuleDraft {
  readonly bindingId: string;
  readonly ruleSetId: string;
  readonly ruleSetName: string;
  readonly sourceId: string;
  readonly pointer: string;
  readonly enabled: boolean;
  readonly fallbackColor: string;
  readonly rules: readonly EqualityRuleDraft[];
}

export interface BindingEditorModel {
  readonly binding: Binding;
  readonly ruleSet: RuleSet;
  readonly sharedRuleSet: boolean;
  readonly supported: boolean;
}

export interface DataBindingIdFactory {
  next(kind: "source" | "binding" | "rule-set" | "rule"): string;
}

export type FormIssueCode =
  | "business-id-required"
  | "business-id-too-long"
  | "business-id-control-character"
  | "source-name-required"
  | "source-name-too-long"
  | "scenario-unknown"
  | "stale-threshold-invalid"
  | "offline-threshold-invalid"
  | "threshold-order-invalid"
  | "seed-invalid"
  | "speed-invalid"
  | "source-required"
  | "path-required"
  | "path-unknown"
  | "rule-set-name-required"
  | "rule-set-name-too-long"
  | "rules-required"
  | "rule-expected-invalid"
  | "rule-expected-too-long"
  | "rule-expected-duplicate"
  | "rule-color-invalid"
  | "alarm-message-required"
  | "alarm-message-too-long"
  | "fallback-color-invalid";

export interface FormIssue {
  readonly code: FormIssueCode;
  readonly field: string;
}

export type FormResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issues: readonly FormIssue[] };

export interface PreviewBindingValue {
  readonly bindingId: string;
  readonly targetId: string;
  readonly sourceId: string;
  readonly value: JsonValue | undefined;
  readonly quality: DataQuality;
  readonly connection: ConnectionStatus;
  readonly sourceTime?: string;
  readonly ruleId?: string;
}

export interface StudioPreviewState {
  readonly active: boolean;
  readonly connections: Readonly<Record<string, ConnectionStatus>>;
  readonly values: Readonly<Record<string, PreviewBindingValue>>;
  readonly alarms: readonly RuntimeAlarm[];
  readonly diagnostics: readonly Diagnostic[];
}

export type StudioPreviewAction =
  | { readonly type: "started" }
  | { readonly type: "stopped" }
  | {
      readonly type: "connection-changed";
      readonly sourceId: string;
      readonly status: ConnectionStatus;
    }
  | { readonly type: "binding-state-changed"; readonly state: PreviewBindingValue }
  | { readonly type: "binding-state-cleared"; readonly bindingId: string }
  | {
      readonly type: "alarm-changed";
      readonly transition: "opened" | "updated" | "cleared";
      readonly alarm: RuntimeAlarm;
    }
  | { readonly type: "diagnostic-added"; readonly diagnostic: Diagnostic };

export function sourceDraft(source: MockDataSource): MockSourceDraft {
  return {
    id: source.id,
    name: source.name,
    scenario: source.options.scenario,
    staleAfterMs: String(source.staleAfterMs),
    offlineAfterMs: String(source.offlineAfterMs),
    seed: source.options.seed === undefined ? "" : String(source.options.seed),
    defaultSpeed:
      source.options.defaultSpeed === undefined ? "" : String(source.options.defaultSpeed),
  };
}
