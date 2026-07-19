import { Vector3 } from "three";
import { describe, expect, it, vi } from "vitest";

import {
  HotspotActionInterpreter,
  validAbsoluteHttpsUrl,
  type HotspotActionSubject,
} from "./hotspot-action-interpreter";

describe("HotspotActionInterpreter", () => {
  it("executes plain and host content without interpreting either value", async () => {
    const harness = createHarness();

    await expect(harness.interpreter.activate(subject(), "keyboard")).resolves.toMatchObject({
      annotationId: "annotation-a",
      actionType: "show-content",
      origin: "keyboard",
      result: "content-shown",
    });
    expect(harness.showPlainText).toHaveBeenCalledWith({
      annotationId: "annotation-a",
      title: "Pump",
      text: "<strong>literal</strong>",
    });

    await expect(
      harness.interpreter.activate(
        subject({ content: { kind: "host-content", key: "catalog/pump" } }),
        "list",
      ),
    ).resolves.toMatchObject({ result: "host-content-requested" });
    expect(harness.requestHostContent).toHaveBeenCalledWith({
      annotationId: "annotation-a",
      title: "Pump",
      key: "catalog/pump",
    });
  });

  it("focuses only an available cloned world point", async () => {
    const harness = createHarness();
    const worldPosition = new Vector3(1, 2, 3);

    await expect(
      harness.interpreter.activate(
        subject({ action: { type: "focus-hotspot" }, worldPosition }),
        "pointer",
      ),
    ).resolves.toMatchObject({ result: "hotspot-focused" });
    const passed = harness.focusPoint.mock.calls[0]?.[0];
    expect(passed).not.toBe(worldPosition);
    expect(passed?.toArray()).toEqual([1, 2, 3]);

    await expect(
      harness.interpreter.activate(
        subject({ action: { type: "focus-hotspot" }, worldPosition: null }),
        "pointer",
      ),
    ).resolves.toMatchObject({ result: "hotspot-unavailable" });
    expect(harness.focusPoint).toHaveBeenCalledOnce();
  });

  it("reports target availability without rewriting the action", async () => {
    const harness = createHarness({ targetAvailable: false });
    const action = { type: "focus-target", targetId: "target-missing" } as const;

    await expect(
      harness.interpreter.activate(subject({ action }), "keyboard"),
    ).resolves.toMatchObject({ result: "target-unavailable" });
    expect(harness.focusTarget).toHaveBeenCalledWith("target-missing");
    expect(action).toEqual({ type: "focus-target", targetId: "target-missing" });
  });

  it("revalidates exact absolute HTTPS links immediately before opening", async () => {
    const harness = createHarness({ userActivationActive: true });

    await expect(
      harness.interpreter.activate(
        subject({ action: { type: "open-link", href: "https://example.com/manual" } }),
        "pointer",
      ),
    ).resolves.toMatchObject({ result: "link-opened" });
    expect(harness.openExternal).toHaveBeenCalledWith("https://example.com/manual");

    for (const href of [
      "http://example.com",
      "HTTPS://example.com",
      "/relative",
      "https://user:password@example.com",
      "https://[invalid-host",
    ]) {
      await expect(
        harness.interpreter.activate(subject({ action: { type: "open-link", href } }), "list"),
      ).resolves.toMatchObject({ result: "link-invalid" });
    }
    expect(harness.openExternal).toHaveBeenCalledOnce();
  });

  it("requires actual browser user activation regardless of caller-supplied origin", async () => {
    const harness = createHarness({ userActivationActive: false });
    for (const origin of ["pointer", "keyboard", "list"] as const) {
      await expect(
        harness.interpreter.activate(
          subject({ action: { type: "open-link", href: "https://example.com/manual" } }),
          origin,
        ),
      ).resolves.toMatchObject({ origin, result: "link-blocked" });
    }
    expect(harness.isUserActivationActive).toHaveBeenCalledTimes(3);
    expect(harness.openExternal).not.toHaveBeenCalled();
  });

  it("reports a blocked link when the browser open API is unavailable or refuses", async () => {
    const originalOpen = globalThis.open;
    vi.stubGlobal("open", undefined);
    const withoutBrowserApi = createHarness({
      useDefaultOpenExternal: true,
      userActivationActive: true,
    });

    await expect(
      withoutBrowserApi.interpreter.activate(
        subject({ action: { type: "open-link", href: "https://example.com/" } }),
        "pointer",
      ),
    ).resolves.toMatchObject({ result: "link-blocked" });

    vi.stubGlobal(
      "open",
      vi.fn(() => null),
    );
    const refused = createHarness({ useDefaultOpenExternal: true, userActivationActive: true });
    await expect(
      refused.interpreter.activate(
        subject({ action: { type: "open-link", href: "https://example.com/" } }),
        "keyboard",
      ),
    ).resolves.toMatchObject({ result: "link-blocked" });
    vi.stubGlobal("open", originalOpen);
  });

  it("has no document or command mutation dependency", () => {
    const dependencies = Object.keys(createHarness()).sort();
    expect(dependencies).toEqual([
      "focusPoint",
      "focusTarget",
      "interpreter",
      "isUserActivationActive",
      "openExternal",
      "requestHostContent",
      "showPlainText",
    ]);
  });
});

describe("validAbsoluteHttpsUrl", () => {
  it("accepts valid original lowercase HTTPS forms and rejects inverse cases", () => {
    expect(validAbsoluteHttpsUrl("HTTPS://example.com")).toBeNull();
    expect(validAbsoluteHttpsUrl(`https://example.com/${"a".repeat(2_100)}`)).toBeNull();
    expect(validAbsoluteHttpsUrl("http://example.com")).toBeNull();
    expect(validAbsoluteHttpsUrl("//example.com")).toBeNull();
    expect(validAbsoluteHttpsUrl("https://user@example.com")).toBeNull();
    expect(validAbsoluteHttpsUrl("https://example.com")).toBe("https://example.com");
    expect(validAbsoluteHttpsUrl("https://example.com:443/path")).toBe(
      "https://example.com:443/path",
    );
    expect(validAbsoluteHttpsUrl("https://example.com/space here")).toBe(
      "https://example.com/space here",
    );
    expect(validAbsoluteHttpsUrl("https://example.com/")).toBe("https://example.com/");
  });
});

function createHarness(
  options: {
    readonly targetAvailable?: boolean;
    readonly useDefaultOpenExternal?: boolean;
    readonly userActivationActive?: boolean;
  } = {},
) {
  const showPlainText = vi.fn();
  const requestHostContent = vi.fn();
  const focusPoint = vi.fn((point: Vector3) => point.lengthSq() >= 0);
  const focusTarget = vi.fn((targetId: string) =>
    targetId.length > 0 ? (options.targetAvailable ?? true) : false,
  );
  const openExternal = vi.fn((href: string) => href.startsWith("https://"));
  const isUserActivationActive = vi.fn(() => options.userActivationActive ?? false);
  const interpreter = new HotspotActionInterpreter({
    showPlainText,
    requestHostContent,
    focusPoint,
    focusTarget,
    ...(options.useDefaultOpenExternal === true ? {} : { openExternal }),
    isUserActivationActive,
  });
  return {
    interpreter,
    showPlainText,
    requestHostContent,
    focusPoint,
    focusTarget,
    openExternal,
    isUserActivationActive,
  };
}

function subject(overrides: Partial<HotspotActionSubject> = {}): HotspotActionSubject {
  return {
    id: "annotation-a",
    title: "Pump",
    content: { kind: "plain-text", text: "<strong>literal</strong>" },
    action: { type: "show-content" },
    worldPosition: new Vector3(1, 2, 3),
    ...overrides,
  };
}
