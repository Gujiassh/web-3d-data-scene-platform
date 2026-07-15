import type { SceneEffect } from "../document-contract";
import type { AlarmLevel, RuntimeAlarm } from "../types";

export interface AlarmEvaluationInput {
  targetId: string;
  bindingId: string;
  ruleId: string;
  sourceId: string;
  sourceTime?: string;
  effects: readonly SceneEffect[];
}

export interface AlarmTransition {
  transition: "opened" | "updated" | "cleared";
  alarm: RuntimeAlarm;
}

export class RuntimeAlarmStore {
  readonly #alarms = new Map<string, RuntimeAlarm>();

  reconcile(input: AlarmEvaluationInput): readonly AlarmTransition[] {
    const transitions: AlarmTransition[] = [];
    const key = alarmKey(input.targetId, input.bindingId, input.ruleId);

    for (const [activeKey, alarm] of this.#alarms) {
      if (
        alarm.targetId === input.targetId &&
        alarm.bindingId === input.bindingId &&
        activeKey !== key
      ) {
        this.#alarms.delete(activeKey);
        transitions.push({ transition: "cleared", alarm });
      }
    }

    const effect = input.effects.find((candidate) => candidate.type === "alarm");
    if (effect === undefined || effect.level === "none") {
      const active = this.#alarms.get(key);
      if (active !== undefined) {
        this.#alarms.delete(key);
        transitions.push({ transition: "cleared", alarm: active });
      }
      return transitions;
    }

    const next: RuntimeAlarm = {
      key,
      targetId: input.targetId,
      bindingId: input.bindingId,
      ruleId: input.ruleId,
      sourceId: input.sourceId,
      level: effect.level as AlarmLevel,
      message: effect.message,
      ...(input.sourceTime === undefined ? {} : { sourceTime: input.sourceTime }),
    };
    const active = this.#alarms.get(key);
    if (active === undefined) {
      this.#alarms.set(key, next);
      transitions.push({ transition: "opened", alarm: next });
    } else if (!sameAlarmState(active, next)) {
      this.#alarms.set(key, next);
      transitions.push({ transition: "updated", alarm: next });
    }
    return transitions;
  }

  clearBinding(targetId: string, bindingId: string): readonly AlarmTransition[] {
    const transitions: AlarmTransition[] = [];
    for (const [key, alarm] of this.#alarms) {
      if (alarm.targetId === targetId && alarm.bindingId === bindingId) {
        this.#alarms.delete(key);
        transitions.push({ transition: "cleared", alarm });
      }
    }
    return transitions;
  }

  snapshot(): readonly RuntimeAlarm[] {
    return [...this.#alarms.values()].sort((left, right) =>
      left.key.localeCompare(right.key, "en"),
    );
  }

  clear(): void {
    this.#alarms.clear();
  }

  clearAll(): readonly AlarmTransition[] {
    const transitions = this.snapshot().map((alarm) => ({
      transition: "cleared" as const,
      alarm,
    }));
    this.#alarms.clear();
    return transitions;
  }
}

export function alarmKey(targetId: string, bindingId: string, ruleId: string): string {
  return `${targetId}\u0000${bindingId}\u0000${ruleId}`;
}

function sameAlarmState(left: RuntimeAlarm, right: RuntimeAlarm): boolean {
  return (
    left.level === right.level && left.message === right.message && left.sourceId === right.sourceId
  );
}
