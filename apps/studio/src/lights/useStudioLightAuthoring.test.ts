// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DocumentCommand, LightEntity, SceneDocument } from "@web3d/document";
import type { AuthoringSceneHandle } from "@web3d/react";

import type { StudioCommandOutcome } from "../workspace/command-outcome";
import type { SelectionOperation } from "../session/session-state";
import { useStudioLightAuthoring, type StudioLightAuthoring } from "./useStudioLightAuthoring";

describe("useStudioLightAuthoring", () => {
  let container: HTMLDivElement;
  let root: Root;
  let current: StudioLightAuthoring;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(
      "00000000-0000-4000-8000-000000000001",
    );
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  it("uses the finite Runtime frame with no fallback and selects a successful Add", () => {
    const execute = vi.fn<(command: DocumentCommand) => StudioCommandOutcome>(() => ({
      status: "changed",
      revision: 2,
    }));
    const selectEntity = vi.fn();
    const viewer = handle({ position: [4, 3, 2], target: [4, 0, 2] });
    render({ document: scene(), execute, selectEntity, viewer });

    act(() => current.refreshCreationAvailability());
    expect(current.addDisabledReason).toBeNull();
    expect(current.add("point")).toBe(true);
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "add-light-entity",
        after: expect.objectContaining({
          transform: expect.objectContaining({ position: [4, 3, 2] }),
        }),
      }),
    );
    const added = (
      execute.mock.calls[0]?.[0] as Extract<DocumentCommand, { type: "add-light-entity" }>
    ).after;
    expect(selectEntity).toHaveBeenCalledWith(added.id, "replace");

    execute.mockClear();
    render({ document: scene(), execute, selectEntity, viewer: handle(null) });
    act(() => current.refreshCreationAvailability());
    expect(current.addDisabledReason).toBe("not-ready");
    expect(current.add("spot")).toBe(false);
    expect(execute).not.toHaveBeenCalled();
  });

  it("routes visibility, unlock, duplicate and remove through only light commands", () => {
    const source = point({ locked: true });
    const execute = vi.fn<(command: DocumentCommand) => StudioCommandOutcome>(() => ({
      status: "changed",
      revision: 3,
    }));
    const selectEntity = vi.fn();
    render({
      document: scene([source]),
      execute,
      selectEntity,
      viewer: handle({ position: [0, 2, 0], target: [0, 0, 0] }),
      selectedEntityIds: [source.id],
      primaryEntityId: source.id,
    });

    expect(current.updateVisibility(source.id, false)).toBe(true);
    expect(current.updateLock(source.id, false)).toBe(true);
    expect(current.duplicateSelection()).toBe(true);
    expect(current.deleteSelection()).toBe(true);
    expect(execute.mock.calls.map(([command]) => command.type)).toEqual([
      "update-light-entity",
      "update-light-entity",
      "add-light-entity",
      "remove-light-entity",
    ]);
    expect(
      (execute.mock.calls[2]?.[0] as Extract<DocumentCommand, { type: "add-light-entity" }>).after
        .locked,
    ).toBe(false);
  });

  it("handles light gizmo commits without leaking unsupported transforms to generic layout", () => {
    const source = point();
    const execute = vi.fn<(command: DocumentCommand) => StudioCommandOutcome>(() => ({
      status: "changed",
      revision: 3,
    }));
    render({
      document: scene([source]),
      execute,
      selectEntity: vi.fn(),
      viewer: handle({ position: [0, 2, 0], target: [0, 0, 0] }),
      selectedEntityIds: [source.id],
      primaryEntityId: source.id,
    });

    expect(
      current.handleTransformCommit({
        type: "transform-commit",
        entityId: source.id,
        before: source.transform,
        after: { ...source.transform, rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2] },
      }),
    ).toBe(true);
    expect(execute).not.toHaveBeenCalled();

    current.handleTransformCommit({
      type: "transform-commit",
      entityId: source.id,
      before: source.transform,
      after: { ...source.transform, position: [1, 2, 0] },
    });
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "update-light-entity",
        after: expect.objectContaining({
          transform: expect.objectContaining({ position: [1, 2, 0] }),
        }),
      }),
    );
    expect(current.canUseTool("translate")).toBe(true);
    expect(current.canUseTool("rotate")).toBe(false);
    expect(current.canUseTool("scale")).toBe(false);
  });

  it("rejects Run, eight-light and mixed-selection actions before execute", () => {
    const execute = vi.fn<(command: DocumentCommand) => StudioCommandOutcome>();
    const viewer = handle({ position: [0, 2, 0], target: [0, 0, 0] });
    const lights = Array.from({ length: 8 }, (_, index) =>
      point({ id: `light-${index + 1}`, name: `Point light ${index + 1}` }),
    );

    render({
      document: scene(lights),
      execute,
      selectEntity: vi.fn(),
      viewer,
      selectedEntityIds: [lights[0]!.id],
      primaryEntityId: lights[0]!.id,
    });
    expect(current.addDisabledReason).toBe("limit");
    expect(current.duplicateDisabledReason).toBe("limit");
    expect(current.add("point")).toBe(false);
    expect(current.duplicateSelection()).toBe(false);

    render({
      document: scene([lights[0]!]),
      execute,
      selectEntity: vi.fn(),
      viewer,
      mode: "run",
      selectedEntityIds: [lights[0]!.id],
      primaryEntityId: lights[0]!.id,
    });
    expect(current.addDisabledReason).toBe("run");
    expect(current.settingsDisabled).toBe(true);
    expect(current.add("spot")).toBe(false);
    expect(current.deleteSelection()).toBe(true);

    render({
      document: scene([lights[0]!, lights[1]!]),
      execute,
      selectEntity: vi.fn(),
      viewer,
      selectedEntityIds: [lights[0]!.id, lights[1]!.id],
      primaryEntityId: lights[0]!.id,
    });
    expect(current.duplicateDisabledReason).toBe("mixed-selection");
    expect(current.duplicateSelection()).toBe(false);
    expect(execute).not.toHaveBeenCalled();
  });

  function render({
    document,
    execute,
    selectEntity,
    viewer,
    mode = "edit",
    selectedEntityIds = [],
    primaryEntityId = null,
  }: {
    readonly document: SceneDocument;
    readonly execute: (command: DocumentCommand) => StudioCommandOutcome;
    readonly selectEntity: (entityId: string | null, operation?: SelectionOperation) => void;
    readonly viewer: AuthoringSceneHandle;
    readonly mode?: "edit" | "run";
    readonly selectedEntityIds?: readonly string[];
    readonly primaryEntityId?: string | null;
  }): void {
    function Harness() {
      current = useStudioLightAuthoring({
        document,
        mode,
        canEdit: true,
        selectedEntityIds,
        primaryEntityId,
        viewerRef: { current: viewer },
        execute,
        selectEntity,
      });
      return null;
    }
    act(() => root.render(createElement(Harness)));
  }
});

function handle(
  frame: ReturnType<AuthoringSceneHandle["getLightCreationFrame"]>,
): AuthoringSceneHandle {
  return {
    selectEntity: vi.fn(),
    selectEntities: vi.fn(),
    focusEntity: vi.fn(async () => undefined),
    setTool: vi.fn(),
    getTool: () => "select",
    isTransformDragging: () => false,
    setTransformSettings: vi.fn(),
    setSmartAlignEnabled: vi.fn(),
    getEntitySpatialSnapshots: () => [],
    getLightCreationFrame: () => frame,
    setAuthoringMode: vi.fn(),
    setDataRuntimeEnabled: vi.fn(async () => undefined),
    setThemeBackground: vi.fn(),
    setBackgroundPreview: vi.fn(),
    setGridPreview: vi.fn(),
    setLightingPreview: vi.fn(),
    setView: vi.fn(async () => undefined),
    getSnapshot: vi.fn(),
  };
}

function point(overrides: Partial<LightEntity> = {}): LightEntity {
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
    ...overrides,
  };
}

function scene(entities: readonly LightEntity[] = []): SceneDocument {
  return {
    schemaVersion: "1.3.0",
    id: "scene-a",
    name: "Scene A",
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
