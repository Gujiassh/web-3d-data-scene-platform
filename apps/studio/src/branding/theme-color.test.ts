// @vitest-environment happy-dom

import { beforeEach, describe, expect, it } from "vitest";

import { syncStudioThemeColor } from "./theme-color";

describe("syncStudioThemeColor", () => {
  beforeEach(() => {
    document.head.innerHTML = '<meta name="theme-color" content="#000000" />';
  });

  it("keeps browser chrome aligned with the selected application theme", () => {
    syncStudioThemeColor("dark");
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute("content")).toBe(
      "#111715",
    );

    syncStudioThemeColor("light");
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute("content")).toBe(
      "#F4F6F5",
    );
  });

  it("does nothing when the host page omits theme metadata", () => {
    document.head.innerHTML = "";
    expect(() => syncStudioThemeColor("dark")).not.toThrow();
  });
});
