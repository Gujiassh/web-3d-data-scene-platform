import { describe, expect, it } from "vitest";

import { M0SceneLoadError } from "@web3d/demo-support";
import type { RuntimeAlarm } from "@web3d/runtime";

import { english, zhCN } from "./catalog";
import {
  alarmMessage,
  formatCount,
  resolveEquipmentDisplayState,
  sceneLoadErrorMessage,
} from "./presentation";

describe("factory presentation mappings", () => {
  it("surfaces connection states before equipment alarm states", () => {
    expect(resolveEquipmentDisplayState("connecting", undefined)).toBe("connecting");
    expect(resolveEquipmentDisplayState("stale", undefined)).toBe("stale");
    expect(resolveEquipmentDisplayState("offline", warningAlarm())).toBe("offline");
    expect(resolveEquipmentDisplayState("error", undefined)).toBe("error");
  });

  it("uses alarm level only while the source is online", () => {
    expect(resolveEquipmentDisplayState("online", undefined)).toBe("running");
    expect(resolveEquipmentDisplayState("online", warningAlarm())).toBe("warning");
    expect(resolveEquipmentDisplayState("online", criticalAlarm())).toBe("critical");
  });

  it("translates known reference alarms by stable ruleId", () => {
    expect(alarmMessage(english, criticalAlarm())).toBe("Equipment fault");
    expect(alarmMessage(zhCN, criticalAlarm())).toBe("设备故障");
    expect(alarmMessage(zhCN, fallbackAlarm())).toBe("设备状态未知");
  });

  it("preserves unknown alarm messages verbatim", () => {
    const unknown = {
      ...criticalAlarm(),
      ruleId: "custom-rule",
      message: "PLC rack 2 checksum drift",
    } satisfies RuntimeAlarm;

    expect(alarmMessage(english, unknown)).toBe("PLC rack 2 checksum drift");
    expect(alarmMessage(zhCN, unknown)).toBe("PLC rack 2 checksum drift");
  });

  it("formats visible counts for the active locale", () => {
    expect(formatCount("en", 1_234)).toBe("1,234");
    expect(formatCount("zh-CN", 1_234)).toBe("1,234");
    expect(english.diagnostics.recent(formatCount("en", 0))).toBe("0 recent");
    expect(zhCN.diagnostics.recent(formatCount("zh-CN", 0))).toBe("最近 0 条");
  });

  it("localizes stable HTTP scene-load failures while preserving status", () => {
    const error = new M0SceneLoadError({ code: "http-request-failed", status: 503 });

    expect(sceneLoadErrorMessage(english, error)).toBe("Request returned HTTP 503.");
    expect(sceneLoadErrorMessage(zhCN, error)).toBe("请求返回 HTTP 503。");
  });

  it("localizes the no-diagnostic SceneDocument validation fallback", () => {
    const error = new M0SceneLoadError({ code: "scene-document-validation-fallback" });

    expect(sceneLoadErrorMessage(english, error)).toBe("SceneDocument validation failed.");
    expect(sceneLoadErrorMessage(zhCN, error)).toBe("SceneDocument 校验失败。");
  });

  it("preserves parser and unknown scene-load failures as raw strings", () => {
    expect(sceneLoadErrorMessage(english, "worker rejected scene")).toBe("worker rejected scene");
    expect(sceneLoadErrorMessage(zhCN, { reason: "invalid scene" })).toBe("[object Object]");
    expect(sceneLoadErrorMessage(zhCN, new Error("schema mismatch"))).toBe("schema mismatch");
  });
});

function criticalAlarm(): RuntimeAlarm {
  return {
    bindingId: "press-01-status-binding",
    key: "press-01-status-binding",
    level: "critical",
    message: "Equipment fault",
    ruleId: "status-fault",
    sourceId: "factory-telemetry",
    targetId: "press-01",
  };
}

function warningAlarm(): RuntimeAlarm {
  return {
    bindingId: "press-01-status-binding",
    key: "press-01-status-binding",
    level: "warning",
    message: "Telemetry offline",
    ruleId: "status-offline",
    sourceId: "factory-telemetry",
    targetId: "press-01",
  };
}

function fallbackAlarm(): RuntimeAlarm {
  return {
    bindingId: "press-01-status-binding",
    key: "press-01-status-binding",
    level: "info",
    message: "Unknown equipment state",
    ruleId: "equipment-status:fallback",
    sourceId: "factory-telemetry",
    targetId: "press-01",
  };
}
