import type { SceneDocument } from "@web3d/document";

import { cloneJson } from "../data/json-pointer";
import { RuntimeValueStore } from "../data/value-store";
import { diagnostic } from "../diagnostics";
import { RuntimeAlarmStore } from "../rules/alarm-store";
import { evaluateRuleSet } from "../rules/rule-engine";
import type {
  BindingStateChangeEvent,
  DataEnvelope,
  Diagnostic,
  RuntimeAlarm,
  RuntimeBindingState,
  ViewerEvent,
} from "../types";
import { applyRuleEffects, resetRuleEffects } from "./effect-projector";
import type { RuntimeGeneration } from "./runtime-generation";

type DataRuntimeViewerEvent = Extract<ViewerEvent, { type: "alarm" | "connection-change" }>;

export interface ViewerDataRuntimeControllerOptions {
  readonly emitAuthoring: (event: BindingStateChangeEvent) => void;
  readonly emitViewer: (event: DataRuntimeViewerEvent) => void;
  readonly now: () => number;
  readonly recordDiagnostic: (diagnostic: Diagnostic) => void;
  readonly requestRender: () => void;
}

export interface ViewerDataRuntimeSnapshot {
  readonly alarms: readonly RuntimeAlarm[];
  readonly bindingStates: readonly RuntimeBindingState[];
  readonly connections: ReturnType<RuntimeValueStore["getConnections"]>;
}

export class ViewerDataRuntimeController {
  readonly #emitAuthoring;
  readonly #emitViewer;
  readonly #now;
  readonly #recordDiagnostic;
  readonly #requestRender;

  #document: SceneDocument | null = null;
  #generation: RuntimeGeneration | null = null;
  #enabled = false;
  #valueStore = new RuntimeValueStore();
  #alarmStore = new RuntimeAlarmStore();
  readonly #bindingStates = new Map<string, RuntimeBindingState>();

  constructor(options: ViewerDataRuntimeControllerOptions) {
    this.#emitAuthoring = options.emitAuthoring;
    this.#emitViewer = options.emitViewer;
    this.#now = options.now;
    this.#recordDiagnostic = options.recordDiagnostic;
    this.#requestRender = options.requestRender;
  }

  attach(document: SceneDocument, generation: RuntimeGeneration): void {
    this.#document = document;
    this.#generation = generation;
    this.#enabled = false;
    this.#valueStore = new RuntimeValueStore();
    this.#alarmStore = new RuntimeAlarmStore();
    this.#bindingStates.clear();
  }

  refreshDocumentAuthority(document: SceneDocument, generation: RuntimeGeneration): void {
    this.#document = document;
    this.#generation = generation;
  }

  detach(): void {
    this.#enabled = false;
    this.#clearTransientState();
    this.#document = null;
    this.#generation = null;
  }

  enable(): void {
    if (this.#enabled) return;
    this.#enabled = true;
    this.#valueStore = new RuntimeValueStore();
    for (const source of this.#document?.dataSources ?? []) {
      this.#valueStore.registerSource(source.id, source);
    }
    for (const sourceId of this.#valueStore.sourceIds()) this.#applyBindings(sourceId);
  }

  disable(): void {
    this.#enabled = false;
    this.#clearTransientState();
  }

  acceptEnvelope(envelope: DataEnvelope): void {
    if (!this.#enabled) return;
    const before = this.#valueStore.getSource(envelope.sourceId)?.connection;
    const update = this.#valueStore.accept(envelope, this.#now());
    for (const value of update.diagnostics) this.#recordDiagnostic(value);
    const after = this.#valueStore.getSource(envelope.sourceId)?.connection;
    if (before !== after && after !== undefined) {
      this.#emitViewer({ type: "connection-change", sourceId: envelope.sourceId, status: after });
    }
    if (update.accepted || update.connectionChanged) this.#applyBindings(envelope.sourceId);
  }

  updateHealth(): void {
    if (!this.#enabled) return;
    for (const sourceId of this.#valueStore.sourceIds()) {
      const update = this.#valueStore.updateHealth(sourceId, this.#now());
      const after = this.#valueStore.getSource(sourceId)?.connection;
      if (update.connectionChanged && after !== undefined) {
        this.#emitViewer({ type: "connection-change", sourceId, status: after });
        this.#applyBindings(sourceId);
      }
    }
  }

  getSnapshot(): ViewerDataRuntimeSnapshot {
    return {
      connections: this.#valueStore.getConnections(),
      alarms: this.#alarmStore.snapshot(),
      bindingStates: [...this.#bindingStates.values()]
        .sort((left, right) => compare(left.bindingId, right.bindingId))
        .map(cloneBindingState),
    };
  }

  #applyBindings(sourceId: string): void {
    const document = this.#document;
    const generation = this.#generation;
    const source = this.#valueStore.getSource(sourceId);
    if (document === null || generation === null || source === undefined) return;

    for (const binding of document.bindings) {
      if (!binding.enabled || binding.sourceId !== sourceId) continue;
      const target = generation.targets.get(binding.targetId);
      const ruleSet = document.ruleSets.find((candidate) => candidate.id === binding.ruleSetId);
      if (target === undefined || ruleSet === undefined) continue;
      try {
        const value = this.#valueStore.getValue(sourceId, binding.pointer);
        const result = evaluateRuleSet(ruleSet, {
          value,
          quality: source.quality,
          connection: source.connection,
        });
        resetRuleEffects(target, binding.writes);
        applyRuleEffects(target, result.effects);
        this.#updateBindingState({
          bindingId: binding.id,
          targetId: binding.targetId,
          sourceId,
          pointer: binding.pointer,
          value,
          quality: source.quality,
          connection: source.connection,
          ruleId: result.ruleId,
          ...(source.sourceTime === undefined ? {} : { sourceTime: source.sourceTime }),
        });
        for (const transition of this.#alarmStore.reconcile({
          targetId: binding.targetId,
          bindingId: binding.id,
          ruleId: result.ruleId,
          sourceId,
          effects: result.effects,
          ...(source.sourceTime === undefined ? {} : { sourceTime: source.sourceTime }),
        })) {
          this.#emitViewer({ type: "alarm", ...transition });
        }
      } catch {
        this.#recordDiagnostic(
          diagnostic(
            "RULE_EVALUATION_FAILED",
            "rule",
            "error",
            `Rule evaluation failed for binding ${binding.id}.`,
            { sourceId, bindingId: binding.id, targetId: binding.targetId },
          ),
        );
      }
    }
    this.#requestRender();
  }

  #clearTransientState(): void {
    this.#generation?.targets.forEach((target) => resetRuleEffects(target));
    for (const transition of this.#alarmStore.clearAll()) {
      this.#emitViewer({ type: "alarm", ...transition });
    }
    for (const bindingId of [...this.#bindingStates.keys()].sort(compare)) {
      this.#emitAuthoring({
        type: "binding-state-change",
        transition: "cleared",
        bindingId,
      });
    }
    this.#bindingStates.clear();
    this.#valueStore = new RuntimeValueStore();
    this.#requestRender();
  }

  #updateBindingState(state: RuntimeBindingState): void {
    const snapshot = cloneBindingState(state);
    const current = this.#bindingStates.get(snapshot.bindingId);
    if (bindingStatesEqual(current, snapshot)) return;
    this.#bindingStates.set(snapshot.bindingId, snapshot);
    this.#emitAuthoring({
      type: "binding-state-change",
      transition: "updated",
      state: cloneBindingState(snapshot),
    });
  }
}

function bindingStatesEqual(
  left: RuntimeBindingState | undefined,
  right: RuntimeBindingState,
): boolean {
  return (
    left !== undefined &&
    left.targetId === right.targetId &&
    left.sourceId === right.sourceId &&
    left.pointer === right.pointer &&
    left.quality === right.quality &&
    left.connection === right.connection &&
    left.ruleId === right.ruleId &&
    left.sourceTime === right.sourceTime &&
    jsonValuesEqual(left.value, right.value)
  );
}

function cloneBindingState(state: RuntimeBindingState): RuntimeBindingState {
  return {
    ...state,
    value: state.value === undefined ? undefined : cloneJson(state.value),
  };
}

function jsonValuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length &&
      left.every((value, index) => jsonValuesEqual(value, right[index]))
    );
  }
  if (!isRecord(left) || !isRecord(right)) return false;
  const leftKeys = Object.keys(left).sort(compare);
  const rightKeys = Object.keys(right).sort(compare);
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key, index) => key === rightKeys[index] && jsonValuesEqual(left[key], right[key]),
    )
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
