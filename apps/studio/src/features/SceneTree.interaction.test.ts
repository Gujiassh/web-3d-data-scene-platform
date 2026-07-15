// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SceneEntity } from "@web3d/document";

import { StudioI18nProvider } from "../i18n/I18nProvider";
import { SceneTree } from "./SceneTree";

describe("SceneTree keyboard interaction", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    container.remove();
    vi.restoreAllMocks();
  });

  it("matches Shift click toggle semantics for Shift+Space", () => {
    const onSelect = vi.fn();
    const root = createRoot(container);
    act(() => {
      root.render(
        createElement(
          StudioI18nProvider,
          null,
          createElement(SceneTree, {
            entities: [entity("a")],
            selectedEntityIds: [],
            primaryEntityId: null,
            editable: true,
            onSelect,
            onVisibilityChange: () => undefined,
            onLockChange: () => undefined,
          }),
        ),
      );
    });
    const item = container.querySelector<HTMLElement>('[role="treeitem"]')!;
    item.focus();
    act(() => {
      item.dispatchEvent(new KeyboardEvent("keydown", { key: " ", shiftKey: true, bubbles: true }));
    });

    expect(onSelect).toHaveBeenCalledWith("a", "toggle");
    act(() => root.unmount());
  });
});

function entity(id: string): SceneEntity {
  return {
    id,
    type: "asset",
    assetId: "asset",
    parentId: null,
    name: id,
    visible: true,
    locked: false,
    transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
    metadata: {},
  };
}
