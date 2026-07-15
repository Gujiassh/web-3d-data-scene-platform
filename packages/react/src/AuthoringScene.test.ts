import { describe, expect, it, vi } from "vitest";

import type { DataAdapter } from "@web3d/runtime";

import {
  reconcileAuthoringSceneSelection,
  reconcileAuthoringSceneSelectionAfterLoad,
  reconcileAuthoringTransformSettings,
} from "./authoring-controlled-state";
import { reconcileAuthoringSceneRuntime } from "./authoring-runtime-reconciliation";

describe("AuthoringScene controlled state", () => {
  it("reconciles optional selection props without introducing a new callback contract", () => {
    const viewer = controlledViewer();

    reconcileAuthoringSceneSelection(viewer, undefined, undefined);
    expect(viewer.selectEntities).not.toHaveBeenCalled();

    reconcileAuthoringSceneSelection(viewer, ["secondary", "primary"], "primary");
    reconcileAuthoringSceneSelection(viewer, undefined, "primary");
    reconcileAuthoringSceneSelection(viewer, [], undefined);
    expect(viewer.selectEntities.mock.calls).toEqual([
      [["secondary", "primary"], "primary"],
      [["primary"], "primary"],
      [[], null],
    ]);
  });

  it("reconciles transform settings across rerenders through the existing viewer", () => {
    const viewer = controlledViewer();
    const settings = {
      translationSnap: 0.25,
      rotationSnapRadians: Math.PI / 4,
      scaleSnap: null,
    };

    reconcileAuthoringTransformSettings(viewer, undefined);
    reconcileAuthoringTransformSettings(viewer, settings);
    reconcileAuthoringTransformSettings(viewer, settings);

    expect(viewer.setTransformSettings).toHaveBeenCalledTimes(2);
    expect(viewer.setTransformSettings).toHaveBeenNthCalledWith(1, settings);
    expect(viewer.setTransformSettings).toHaveBeenNthCalledWith(2, settings);
  });

  it("waits for the current source load and prevents stale controlled selection from winning", async () => {
    const viewer = controlledViewer();
    let resolveLoad: (() => void) | undefined;
    let current = true;
    const loading = new Promise<void>((resolve) => {
      resolveLoad = resolve;
    });
    const reconciliation = reconcileAuthoringSceneSelectionAfterLoad(
      viewer,
      loading,
      ["asset-b", "asset-a"],
      "asset-b",
      () => current,
    );

    expect(viewer.selectEntities).not.toHaveBeenCalled();
    current = false;
    resolveLoad?.();
    await reconciliation;
    expect(viewer.selectEntities).not.toHaveBeenCalled();

    await reconcileAuthoringSceneSelectionAfterLoad(
      viewer,
      Promise.resolve(),
      ["asset-b", "asset-a"],
      "asset-b",
    );
    expect(viewer.selectEntities).toHaveBeenCalledWith(["asset-b", "asset-a"], "asset-b");
  });
});

describe("AuthoringScene runtime reconciliation", () => {
  it("disables runtime, reconciles adapters, and enables only after configuration", async () => {
    const calls: string[] = [];
    const viewer = controls(calls);
    const stale = adapter("stale-source");
    const previous = adapter("factory-telemetry");
    const replacement = adapter("factory-telemetry");

    await reconcileAuthoringSceneRuntime(
      viewer,
      { "stale-source": stale, "factory-telemetry": previous },
      { "factory-telemetry": replacement },
      true,
    );

    expect(calls).toEqual([
      "runtime:false",
      "adapter:stale-source:remove",
      "adapter:factory-telemetry:factory-telemetry",
      "runtime:true",
    ]);
  });

  it("does not enable while adapter configuration is pending", async () => {
    const calls: string[] = [];
    let resolveAdapter: (() => void) | undefined;
    const viewer = {
      setAdapter: vi.fn((sourceId: string, value: DataAdapter | null) => {
        calls.push(`adapter:${sourceId}:${value?.sourceId ?? "remove"}`);
        return new Promise<void>((resolve) => {
          resolveAdapter = resolve;
        });
      }),
      setDataRuntimeEnabled: vi.fn((enabled: boolean) => {
        calls.push(`runtime:${String(enabled)}`);
        return Promise.resolve();
      }),
    };
    const current = adapter("factory-telemetry");

    const reconciliation = reconcileAuthoringSceneRuntime(
      viewer,
      {},
      { "factory-telemetry": current },
      true,
    );
    await Promise.resolve();
    expect(calls).toEqual(["runtime:false", "adapter:factory-telemetry:factory-telemetry"]);

    resolveAdapter?.();
    await reconciliation;
    expect(calls).toEqual([
      "runtime:false",
      "adapter:factory-telemetry:factory-telemetry",
      "runtime:true",
    ]);
  });

  it("does not let a stale reconciliation re-enable runtime", async () => {
    const current = adapter("factory-telemetry");
    const calls: string[] = [];
    let currentGeneration = true;

    const reconciliation = reconcileAuthoringSceneRuntime(
      controls(calls),
      {},
      { "factory-telemetry": current },
      true,
      () => currentGeneration,
    );
    currentGeneration = false;
    await reconciliation;

    expect(calls).toEqual(["runtime:false"]);
  });

  it("does not reinstall stable adapters when disabling runtime", async () => {
    const calls: string[] = [];
    const viewer = controls(calls);
    const current = adapter("factory-telemetry");

    await reconcileAuthoringSceneRuntime(
      viewer,
      { "factory-telemetry": current },
      { "factory-telemetry": current },
      false,
    );

    expect(calls).toEqual(["runtime:false"]);
  });
});

function controls(calls: string[]) {
  return {
    setAdapter: vi.fn((sourceId: string, value: DataAdapter | null) => {
      calls.push(`adapter:${sourceId}:${value?.sourceId ?? "remove"}`);
      return Promise.resolve();
    }),
    setDataRuntimeEnabled: vi.fn((enabled: boolean) => {
      calls.push(`runtime:${String(enabled)}`);
      return Promise.resolve();
    }),
  };
}

function adapter(sourceId: string): DataAdapter {
  return {
    sourceId,
    start: vi.fn(() => Promise.resolve()),
    subscribe: vi.fn(() => vi.fn()),
    stop: vi.fn(() => Promise.resolve()),
  };
}

function controlledViewer() {
  return {
    selectEntities: vi.fn<(entityIds: readonly string[], primaryEntityId: string | null) => void>(),
    setTransformSettings: vi.fn(),
  };
}
