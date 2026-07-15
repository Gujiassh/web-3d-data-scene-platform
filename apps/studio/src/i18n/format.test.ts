import { describe, expect, it } from "vitest";

import { createStudioFormatters } from "./format";

describe("createStudioFormatters", () => {
  it("formats counts and bytes with the active locale", () => {
    const english = createStudioFormatters("en");
    const chinese = createStudioFormatters("zh-CN");

    expect(english.formatCount(1234567)).toBe("1,234,567");
    expect(chinese.formatCount(2048)).toBe("2,048");
    expect(english.formatBytes(1536)).toBe("1.5 KiB");
    expect(chinese.formatBytes(1536)).toBe("1.5 KiB");
  });

  it("returns raw values for invalid dates and sanitizes export stems", () => {
    const formatters = createStudioFormatters("en");

    expect(formatters.formatDateTime("not-a-date")).toBe("not-a-date");
    expect(formatters.safeFileStem("  ", "scene")).toBe("scene");
    expect(formatters.safeFileStem(" demo scene / 01 ", "scene")).toBe("demo-scene-01");
  });
});
