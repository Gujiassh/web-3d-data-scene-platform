// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "@web3d/demo-support/theme-provider";

import { StudioI18nProvider } from "../i18n/I18nProvider";
import { StudioToolbar } from "./StudioToolbar";

describe("StudioToolbar", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
    );
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it("keeps the command name when a disabled reason is present", () => {
    renderToolbar("Layout editing is disabled in Run mode.");
    const duplicate = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Duplicate selection. Layout editing is disabled in Run mode."]',
    );

    expect(duplicate).not.toBeNull();
    expect(duplicate?.disabled).toBe(true);
    expect(duplicate?.title).toBe("Duplicate selection - Layout editing is disabled in Run mode.");
  });

  function renderToolbar(duplicateDisabledReason: string | null): void {
    const noop = () => undefined;
    act(() => {
      root.render(
        createElement(ThemeProvider, {
          storageKey: "toolbar-test-theme",
          children: createElement(
            StudioI18nProvider,
            null,
            createElement(StudioToolbar, {
              projectName: "Scene",
              save: { status: "saved", revision: 1 },
              exportOutdated: false,
              mode: "run",
              tool: "select",
              canUndo: false,
              canRedo: false,
              canEdit: false,
              canDuplicate: false,
              duplicateDisabledReason,
              hasSelection: true,
              onOpenProjectMenu: noop,
              onUndo: noop,
              onRedo: noop,
              onSave: noop,
              onModeChange: noop,
              onToolChange: noop,
              onImport: noop,
              onExport: noop,
              onDuplicate: noop,
              onDelete: noop,
              onOpenHelp: noop,
            }),
          ),
        }),
      );
    });
  }
});
