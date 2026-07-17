// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

import type { LightEntity, MockDataSource, SceneDocument } from "@web3d/document";

import {
  semanticDataAdapterKey,
  unsupportedSourcePreviewActions,
  useStudioDataBinding,
} from "./useStudioDataBinding";

describe("useStudioDataBinding", () => {
  it("never resolves a selected LightEntity as a data target", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const execute = vi.fn();
    let targetResolution: ReturnType<typeof useStudioDataBinding>["targetResolution"] | undefined;
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

    function Harness() {
      targetResolution = useStudioDataBinding({
        document: scene([pointLight()]),
        mode: "edit",
        selectedEntityId: "light-a",
        execute,
      }).targetResolution;
      return null;
    }

    act(() => root.render(createElement(Harness)));
    expect(targetResolution).toEqual({ status: "unsupported-entity" });
    expect(execute).not.toHaveBeenCalled();
    act(() => root.unmount());
    container.remove();
  });
});

describe("semanticDataAdapterKey", () => {
  it("is stable across source order and non-adapter source fields", () => {
    const first = source("source-a");
    const second = source("source-b");
    expect(semanticDataAdapterKey([first, second])).toBe(
      semanticDataAdapterKey([
        { ...second, name: "Renamed", staleAfterMs: 4_000, offlineAfterMs: 9_000 },
        { ...first, options: { ...first.options, seed: 99 } },
      ]),
    );
  });

  it("changes when adapter behavior changes", () => {
    const value = source("source-a");
    expect(semanticDataAdapterKey([value])).not.toBe(
      semanticDataAdapterKey([
        { ...value, options: { ...value.options, scenario: "boolean-cycle" } },
      ]),
    );
    expect(semanticDataAdapterKey([value])).not.toBe(
      semanticDataAdapterKey([{ ...value, options: { ...value.options, defaultSpeed: 2 } }]),
    );
  });

  it("changes when an unsupported source adapter changes", () => {
    const value = source("source-a");
    expect(semanticDataAdapterKey([value])).not.toBe(
      semanticDataAdapterKey([
        {
          id: value.id,
          name: value.name,
          adapter: "websocket",
          staleAfterMs: value.staleAfterMs,
          offlineAfterMs: value.offlineAfterMs,
          options: {},
        },
      ]),
    );
  });
});

describe("unsupportedSourcePreviewActions", () => {
  it("derives transient error connection and diagnostic actions", () => {
    const diagnostic = {
      code: "DATASOURCE_CONNECTION_FAILED" as const,
      severity: "error" as const,
      source: "adapter" as const,
      sourceId: "socket-a",
      message: "source-adapter-unsupported sourceId=socket-a adapter=websocket",
    };
    expect(unsupportedSourcePreviewActions([{ sourceId: "socket-a", diagnostic }])).toEqual([
      { type: "connection-changed", sourceId: "socket-a", status: "error" },
      { type: "diagnostic-added", diagnostic },
    ]);
  });
});

function source(id: string): MockDataSource {
  return {
    id,
    name: id,
    adapter: "mock",
    staleAfterMs: 2_000,
    offlineAfterMs: 5_000,
    options: { scenario: "status-cycle", defaultSpeed: 1 },
  };
}

function scene(entities: readonly LightEntity[]): SceneDocument {
  return {
    schemaVersion: "1.3.0",
    id: "scene",
    name: "Scene",
    revision: 1,
    assets: [],
    entities,
    targets: [],
    dataSources: [],
    bindings: [],
    ruleSets: [],
    annotations: [],
    views: [],
    environment: {
      backgroundMode: "theme",
      background: "#F4F6F5",
      grid: true,
      unit: "m",
      upAxis: "Y",
      lighting: {
        fill: { skyColor: "#FFFFFF", groundColor: "#65706A", intensity: 1.8 },
        key: { color: "#FFFFFF", intensity: 2.2, directionToLight: [0, 1, 0] },
      },
    },
  };
}

function pointLight(): LightEntity {
  return {
    id: "light-a",
    type: "light",
    parentId: null,
    name: "Point light 1",
    visible: true,
    locked: false,
    transform: { position: [0, 2, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
    metadata: {},
    light: { kind: "point", color: "#FFFFFF", intensity: 25, range: null },
  };
}
