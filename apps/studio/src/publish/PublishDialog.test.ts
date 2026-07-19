// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioI18nProvider } from "../i18n/I18nProvider";
import { PublishDialog } from "./PublishDialog";

describe("PublishDialog", () => {
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

  it("shows localized blockers without authored technical IDs", () => {
    render({
      status: "blocked",
      blockers: [
        {
          code: "PUBLISH_LEGACY_HOTSPOT",
          message: "Hotspot annotation-secret must be repositioned.",
          annotationId: "annotation-secret",
        },
      ],
    });

    expect(container.textContent).toContain("Reposition every legacy hotspot");
    expect(container.textContent).not.toContain("annotation-secret");
  });

  it("exposes progress and lets Escape cancel", () => {
    const onClose = vi.fn();
    render({ status: "checking" }, onClose);
    expect(container.querySelector('[data-testid="publish-checking"]')).not.toBeNull();

    act(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));

    expect(onClose).toHaveBeenCalledOnce();
  });

  function render(
    state: React.ComponentProps<typeof PublishDialog>["state"],
    onClose = vi.fn(),
  ): void {
    act(() => {
      root.render(
        createElement(StudioI18nProvider, null, createElement(PublishDialog, { state, onClose })),
      );
    });
  }
});
