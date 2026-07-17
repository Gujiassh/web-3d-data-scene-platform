// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SceneEnvironment } from "@web3d/document";

import { lightingForPreset, type SceneSettingsDraft } from "../scene-settings/model";
import { useStudioSettingsDialog, type StudioSettingsDialogState } from "./useStudioSettingsDialog";

describe("useStudioSettingsDialog", () => {
  let container: HTMLDivElement;
  let root: Root;
  let state: StudioSettingsDialogState;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  it("previews continuously, commits once, stays open and releases only on matching ready", () => {
    const execute = vi.fn(() => ({ status: "changed", revision: 2 }) as const);
    let environment = sceneEnvironment();
    const render = (): void => renderHarness({ environment, canEdit: true, execute });
    render();

    act(() => state.openDialog());
    const next = draft("#336699", "contrast");
    act(() => state.previewSceneSettings(next));
    expect(state.preview?.background).toBe("#336699");
    expect(execute).not.toHaveBeenCalled();

    act(() => expect(state.commitSceneSettings(next)).toBe(true));
    expect(state.open).toBe(true);
    expect(state.preview?.background).toBe("#336699");
    expect(execute).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledWith({
      type: "set-scene-environment",
      before: sceneEnvironment(),
      after: { ...sceneEnvironment(), ...next },
    });

    environment = { ...environment, ...next };
    render();
    expect(state.draft).toEqual(next);
    act(() => state.handleReady("scene-a", 1));
    expect(state.preview?.background).toBe("#336699");
    act(() => state.handleReady("scene-a", 2));
    expect(state.preview).toBeNull();
  });

  it("restores the authoritative environment when an immediate commit is rejected", () => {
    const execute = vi.fn(() => ({ status: "rejected", message: "stale" }) as const);
    const environment = sceneEnvironment();
    renderHarness({ environment, canEdit: true, execute });
    act(() => state.openDialog());

    const next = draft("#123456", "soft");
    act(() => state.previewSceneSettings(next));
    expect(state.preview?.background).toBe("#123456");
    act(() => expect(state.commitSceneSettings(next)).toBe(false));

    expect(state.open).toBe(true);
    expect(state.draft).toEqual({
      backgroundMode: environment.backgroundMode,
      background: environment.background,
      grid: environment.grid,
      lighting: environment.lighting,
    });
    expect(state.preview).toBeNull();
  });

  it("synchronizes authoritative Undo changes while the dialog remains open", () => {
    const execute = vi.fn(() => ({ status: "unchanged", revision: 1 }) as const);
    let environment = sceneEnvironment();
    const render = (): void => renderHarness({ environment, canEdit: true, execute });
    render();
    act(() => state.openDialog());

    environment = { ...environment, backgroundMode: "custom", background: "#445566" };
    render();
    expect(state.draft?.background).toBe("#445566");
    expect(state.draft?.backgroundMode).toBe("custom");
  });

  it("clears only transient range preview before dialog-local history commands", () => {
    const execute = vi.fn(() => ({ status: "unchanged", revision: 1 }) as const);
    renderHarness({ environment: sceneEnvironment(), canEdit: true, execute });
    act(() => state.openDialog());
    act(() => state.previewSceneSettings(draft("#123456", "soft")));
    expect(state.preview?.background).toBe("#123456");

    act(() => state.clearScenePreview());
    expect(state.preview).toBeNull();
    expect(state.open).toBe(true);
    expect(state.draft?.background).toBe("#F4F6F5");
  });

  it("cancels a draft preview without dropping an earlier held commit", () => {
    const execute = vi.fn(() => ({ status: "changed", revision: 2 }) as const);
    let environment = sceneEnvironment();
    const render = (): void => renderHarness({ environment, canEdit: true, execute });
    render();
    act(() => state.openDialog());
    const committed = draft("#336699", "contrast");
    act(() => expect(state.commitSceneSettings(committed)).toBe(true));
    environment = { ...environment, ...committed };
    render();

    act(() => state.previewSceneSettings(draft("#123456", "soft")));
    expect(state.preview?.background).toBe("#123456");
    act(() => state.cancelScenePreview());

    expect(state.preview?.background).toBe("#336699");
    expect(state.draft).toEqual(committed);
  });

  it("keeps Application available without an editable scene", () => {
    const execute = vi.fn(() => ({ status: "changed", revision: 2 }) as const);
    const restoreFocus = vi.fn();
    renderHarness({ environment: null, canEdit: false, execute, restoreFocus });

    act(() => state.openDialog());
    expect(state.open).toBe(true);
    expect(state.draft).toBeNull();
    expect(state.sceneEditable).toBe(false);
    expect(state.commitSceneSettings(draft("#123456", "soft"))).toBe(false);
    expect(execute).not.toHaveBeenCalled();
    act(() => state.closeDialog());
    expect(restoreFocus).toHaveBeenCalledOnce();
  });

  function renderHarness({
    environment,
    canEdit,
    execute,
    restoreFocus = () => undefined,
  }: {
    readonly environment: SceneEnvironment | null;
    readonly canEdit: boolean;
    readonly execute: Parameters<typeof useStudioSettingsDialog>[0]["execute"];
    readonly restoreFocus?: () => void;
  }): void {
    act(() => {
      root.render(
        createElement(Harness, {
          environment,
          canEdit,
          execute,
          restoreFocus,
          onRender: (next) => {
            state = next;
          },
        }),
      );
    });
  }
});

function Harness(props: {
  readonly environment: SceneEnvironment | null;
  readonly canEdit: boolean;
  readonly execute: Parameters<typeof useStudioSettingsDialog>[0]["execute"];
  readonly restoreFocus: () => void;
  readonly onRender: (state: StudioSettingsDialogState) => void;
}) {
  const state = useStudioSettingsDialog({
    projectId: props.environment === null ? null : "project-a",
    documentId: props.environment === null ? null : "scene-a",
    environment: props.environment,
    canEdit: props.canEdit,
    themeBackground: "#F4F6F5",
    execute: props.execute,
    restoreFocus: props.restoreFocus,
  });
  props.onRender(state);
  return null;
}

function sceneEnvironment(): SceneEnvironment {
  return {
    backgroundMode: "theme",
    background: "#F4F6F5",
    grid: true,
    unit: "m",
    upAxis: "Y",
    lighting: lightingForPreset("standard"),
  };
}

function draft(background: string, preset: "soft" | "contrast"): SceneSettingsDraft {
  return {
    backgroundMode: "custom",
    background,
    grid: false,
    lighting: lightingForPreset(preset),
  };
}
