// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioI18nProvider } from "../i18n/I18nProvider";
import { STUDIO_COMMANDS } from "../session/shortcut-registry";
import { ShortcutHelpDialog } from "./ShortcutHelpDialog";

describe("ShortcutHelpDialog", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("renders every registered command and filters by localized label or key", () => {
    const onClose = vi.fn();
    act(() => {
      root.render(
        createElement(StudioI18nProvider, null, createElement(ShortcutHelpDialog, { onClose })),
      );
    });
    expect(container.querySelectorAll(".shortcut-help-row")).toHaveLength(STUDIO_COMMANDS.length);
    const search = container.querySelector<HTMLInputElement>(
      'input[aria-label="Search shortcuts"]',
    )!;
    expect(document.activeElement).toBe(search);

    changeInput(search, "Option+R");
    expect(container.querySelectorAll(".shortcut-help-row")).toHaveLength(0);

    changeInput(search, "reset rotation");
    expect(container.querySelectorAll(".shortcut-help-row")).toHaveLength(1);
    expect(container.textContent).toContain("Reset rotation");

    act(() => {
      search.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(onClose).toHaveBeenCalledOnce();
  });
});

function changeInput(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  if (setter === undefined) throw new Error("HTMLInputElement value setter is unavailable.");
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
