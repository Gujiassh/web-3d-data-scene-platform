// @vitest-environment happy-dom

import { act, createElement, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { AuthoringSceneHandle } from "@web3d/react";

import { STUDIO_COMMANDS, type StudioCommandId } from "./shortcut-registry";
import { useStudioShortcuts, type StudioShortcutActions } from "./useStudioShortcuts";

describe("useStudioShortcuts", () => {
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

  it("prevents only handled chords and dispatches once", () => {
    const calls: StudioCommandId[] = [];
    act(() => root.render(createElement(Harness, { calls })));

    const handled = new KeyboardEvent("keydown", { key: "w", bubbles: true, cancelable: true });
    window.dispatchEvent(handled);
    expect(handled.defaultPrevented).toBe(true);
    expect(calls).toEqual(["tool.translate"]);

    const unsupported = new KeyboardEvent("keydown", {
      key: "w",
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    window.dispatchEvent(unsupported);
    expect(unsupported.defaultPrevented).toBe(false);
    expect(calls).toEqual(["tool.translate"]);
  });

  it("queries current drag state before dispatch", () => {
    const calls: StudioCommandId[] = [];
    act(() => root.render(createElement(Harness, { calls, dragging: true })));
    const event = new KeyboardEvent("keydown", { key: "w", bubbles: true, cancelable: true });
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(calls).toEqual([]);
  });
});

function Harness({
  calls,
  dragging = false,
}: {
  readonly calls: StudioCommandId[];
  readonly dragging?: boolean;
}) {
  const viewerRef = useRef({ isTransformDragging: () => dragging } as AuthoringSceneHandle);
  const actions = Object.fromEntries(
    STUDIO_COMMANDS.map((command) => [command.id, () => void calls.push(command.id)]),
  ) as unknown as StudioShortcutActions;
  useStudioShortcuts({
    actions,
    canEdit: true,
    canResetSelection: true,
    hasSelection: true,
    modalOpen: false,
    viewerRef,
  });
  return null;
}
