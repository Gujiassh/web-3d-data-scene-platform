import { M0SceneLoadError, type equipment } from "@web3d/demo-support";
import type { Locale } from "@web3d/demo-support/i18n";
import type { ConnectionStatus, RuntimeAlarm } from "@web3d/runtime";

import type { FactoryCatalog } from "./catalog";

export type EquipmentLabelKey = (typeof equipment)[number]["labelKey"];
export type EquipmentAreaKey = (typeof equipment)[number]["areaKey"];
export type EquipmentDisplayState =
  Exclude<ConnectionStatus, "online"> | "running" | RuntimeAlarm["level"];

const referenceAlarmRuleIds = new Set<keyof FactoryCatalog["alarmsByRuleId"]>([
  "status-offline",
  "status-fault",
  "equipment-status:fallback",
]);

export function equipmentLabel(catalog: FactoryCatalog, labelKey: EquipmentLabelKey): string {
  return catalog.equipment.labels[labelKey];
}

export function equipmentArea(catalog: FactoryCatalog, areaKey: EquipmentAreaKey): string {
  return catalog.equipment.areas[areaKey];
}

export function connectionLabel(catalog: FactoryCatalog, connection: ConnectionStatus): string {
  return catalog.states.connection[connection];
}

export function equipmentStateLabel(catalog: FactoryCatalog, state: EquipmentDisplayState): string {
  return catalog.states.equipment[state];
}

export function formatCount(locale: Locale, count: number): string {
  return new Intl.NumberFormat(locale).format(count);
}

export function sceneLoadErrorMessage(catalog: FactoryCatalog, error: unknown): string {
  if (error instanceof M0SceneLoadError) {
    const { reason } = error;
    switch (reason.code) {
      case "http-request-failed":
        return catalog.viewer.loadErrorReasons.httpRequestFailed(reason.status);
      case "scene-document-validation-fallback":
        return catalog.viewer.loadErrorReasons.sceneDocumentValidationFallback;
      default:
        return assertNever(reason);
    }
  }
  return error instanceof Error ? error.message : String(error);
}

export function resolveEquipmentDisplayState(
  connection: ConnectionStatus,
  alarm: RuntimeAlarm | undefined,
): EquipmentDisplayState {
  if (connection !== "online") return connection;
  return alarm?.level ?? "running";
}

export function alarmMessage(catalog: FactoryCatalog, alarm: RuntimeAlarm): string {
  if (referenceAlarmRuleIds.has(alarm.ruleId as keyof FactoryCatalog["alarmsByRuleId"])) {
    return catalog.alarmsByRuleId[alarm.ruleId as keyof FactoryCatalog["alarmsByRuleId"]];
  }
  return alarm.message;
}

function assertNever(value: never): never {
  throw new Error(`Unhandled M0 scene-load reason: ${String(value)}`);
}
