import type { RuleEffect } from "@web3d/document";
import { describe, expect, it } from "vitest";

import { RuntimeAlarmStore } from "./alarm-store";

describe("RuntimeAlarmStore", () => {
  it("does not duplicate an alarm when only sourceTime changes", () => {
    const store = new RuntimeAlarmStore();
    const effects: RuleEffect[] = [{ type: "alarm", level: "critical", message: "Machine fault" }];

    expect(store.reconcile(input("fault", effects, "10:00"))[0]?.transition).toBe("opened");
    expect(store.reconcile(input("fault", effects, "10:01"))).toHaveLength(0);
  });

  it("clears the active rule before opening a replacement", () => {
    const store = new RuntimeAlarmStore();
    const critical: RuleEffect[] = [{ type: "alarm", level: "critical", message: "Machine fault" }];
    const warning: RuleEffect[] = [
      { type: "alarm", level: "warning", message: "Telemetry offline" },
    ];

    store.reconcile(input("fault", critical));
    expect(store.reconcile(input("offline", warning)).map((item) => item.transition)).toEqual([
      "cleared",
      "opened",
    ]);
  });
});

function input(ruleId: string, effects: readonly RuleEffect[], sourceTime?: string) {
  return {
    targetId: "press-01",
    bindingId: "press-status",
    ruleId,
    sourceId: "telemetry",
    effects,
    ...(sourceTime === undefined ? {} : { sourceTime }),
  };
}
