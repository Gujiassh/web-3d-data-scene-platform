import { describe, expect, it } from "vitest";

import { chinese, english } from "../i18n/catalog";
import { hotspotStatusMessage } from "./hotspotStatus";
import type { HotspotStatusCode } from "./useStudioHotspots";

const statusCodes = [
  "surface-ready",
  "placement-active",
  "title-required",
  "created",
  "renamed",
  "reposition-active",
  "repositioned",
  "updated",
  "hidden",
  "shown",
  "lock-enabled",
  "unlocked",
  "locked",
  "command-rejected",
  "unavailable",
  "removed",
  "legacy-anchor",
  "entity-not-registered",
  "asset-hash-mismatch",
  "node-not-registered",
  "surface-not-registered",
  "unsupported-surface",
  "non-invertible-transform",
  "invalid-frame",
  "unsupported",
  "no-surface",
  "cancel",
  "mode",
  "source",
  "revision",
  "project",
  "context",
  "dispose",
  "content-shown",
  "host-content-requested",
  "hotspot-focused",
  "hotspot-unavailable",
  "target-focused",
  "target-unavailable",
  "link-opened",
  "link-blocked",
  "link-invalid",
] as const satisfies readonly HotspotStatusCode[];

describe("hotspotStatusMessage", () => {
  it("maps every typed status to localized copy without exposing raw codes", () => {
    for (const status of statusCodes) {
      const englishMessage = hotspotStatusMessage(status, english.hotspots);
      const chineseMessage = hotspotStatusMessage(status, chinese.hotspots);
      expect(englishMessage).not.toBe("");
      expect(chineseMessage).not.toBe("");
      expect(englishMessage).not.toBe(status);
      expect(chineseMessage).not.toBe(status);
    }
  });

  it("keeps an idle live region empty", () => {
    expect(hotspotStatusMessage(null, english.hotspots)).toBe("");
  });

  it("keeps invalid-drop reasons distinct from ordinary cancellation", () => {
    expect(hotspotStatusMessage("no-surface", english.hotspots)).toBe(
      "Choose a visible model surface",
    );
    expect(hotspotStatusMessage("unsupported", english.hotspots)).toBe(
      "This surface does not support hotspots",
    );
    expect(hotspotStatusMessage("cancel", english.hotspots)).toBe("Hotspot action canceled");
    expect(hotspotStatusMessage("no-surface", chinese.hotspots)).toBe("请选择可见的模型表面");
    expect(hotspotStatusMessage("unsupported", chinese.hotspots)).toBe("此表面不支持热点");
    expect(hotspotStatusMessage("cancel", chinese.hotspots)).toBe("热点操作已取消");
  });
});
