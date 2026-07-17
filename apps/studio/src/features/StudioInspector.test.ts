// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { LightEntity, SceneDocument } from "@web3d/document";

import { createStudioPreviewState } from "../data-binding/preview-state";
import { StudioI18nProvider } from "../i18n/I18nProvider";
import { DISABLED_TRANSFORM_SETTINGS } from "../layout/types";
import type { StudioSceneLayout } from "../layout/useStudioSceneLayout";
import { StudioInspector } from "./StudioInspector";

describe("StudioInspector", () => {
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
    vi.restoreAllMocks();
  });

  it("keeps alarm focus without exposing hidden layout controls in Run", () => {
    const onFocusTarget = vi.fn();
    const preview = {
      ...createStudioPreviewState(false),
      alarms: [
        {
          key: "target-a\u0000binding-a\u0000rule-a",
          targetId: "target-a",
          bindingId: "binding-a",
          ruleId: "rule-a",
          sourceId: "source-a",
          level: "critical" as const,
          message: "Critical state",
        },
      ],
    };

    act(() => {
      root.render(
        createElement(
          StudioI18nProvider,
          null,
          createElement(StudioInspector, {
            document: scene(),
            projectId: "project",
            editable: false,
            entity: null,
            mode: "run",
            preview,
            selectedEntityId: null,
            targetResolution: { status: "no-selection" },
            execute: () => ({ status: "unavailable" as const }),
            lightPreviewCancellation: 0,
            layout: layoutModel(),
            onCancelLightPreview: () => undefined,
            onAcceptLightPreview: () => undefined,
            onFocusTarget,
            onPreviewLight: () => undefined,
            onRename: () => undefined,
          }),
        ),
      );
    });

    const inspector = container.querySelector<HTMLElement>(".studio-inspector")!;
    expect(inspector.children).toHaveLength(2);
    const content = inspector.children[1] as HTMLElement;
    expect(content.classList.contains("run-inspector-content")).toBe(true);
    expect(content.querySelector(".run-preview-panel")).not.toBeNull();
    const alarmButton = content.querySelector<HTMLButtonElement>(
      'button[aria-label="Focus alarm target target-a"]',
    );
    expect(alarmButton).not.toBeNull();
    act(() => alarmButton!.click());
    expect(onFocusTarget).toHaveBeenCalledOnce();
    expect(onFocusTarget).toHaveBeenCalledWith("target-a");

    expect(content.querySelector(".scene-layout-panel")).toBeNull();
  });

  it("gives the Object Inspector ownership of selected-light fields", () => {
    const light = pointLight();
    const execute = vi.fn(() => ({ status: "changed" as const, revision: 2 }));
    act(() => {
      root.render(
        createElement(
          StudioI18nProvider,
          null,
          createElement(StudioInspector, {
            document: scene([light]),
            projectId: "project",
            editable: true,
            entity: light,
            mode: "edit",
            preview: createStudioPreviewState(false),
            selectedEntityId: light.id,
            targetResolution: { status: "unsupported-entity" },
            execute,
            lightPreviewCancellation: 0,
            layout: layoutModel(),
            onCancelLightPreview: () => undefined,
            onAcceptLightPreview: () => undefined,
            onFocusTarget: () => undefined,
            onPreviewLight: () => undefined,
            onRename: () => undefined,
          }),
        ),
      );
    });

    expect(container.querySelector('input[aria-label="Brightness"]')).not.toBeNull();
    expect(container.querySelector('input[aria-label="Position X"]')).not.toBeNull();
    expect(container.querySelector('input[aria-label="Rotation (degrees) X"]')).toBeNull();
    expect(container.querySelector('input[aria-label="Scale X"]')).toBeNull();
    expect(execute).not.toHaveBeenCalled();
  });
});

function scene(entities: readonly LightEntity[] = []): SceneDocument {
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
      backgroundMode: "custom",
      background: "#FFFFFF",
      grid: true,
      unit: "m",
      upAxis: "Y",
      lighting: standardLighting(),
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

function standardLighting() {
  return {
    fill: { skyColor: "#FFFFFF", groundColor: "#65706A", intensity: 1.8 },
    key: {
      color: "#FFFFFF",
      intensity: 2.2,
      directionToLight: [0.37904902178945177, 0.7580980435789035, 0.5306686305052324] as const,
    },
  };
}

function layoutModel(): StudioSceneLayout {
  const disabled = { enabled: false, reason: "run-disabled" } as const;
  return {
    editable: false,
    primaryTransformEditable: false,
    documentEntities: [],
    selectedEntityIds: [],
    primaryEntityId: null,
    activeTool: "select",
    transformSettings: DISABLED_TRANSFORM_SETTINGS,
    axis: "x",
    alignAnchor: "center",
    reparentTargetId: null,
    duplicateOffsetDraft: ["1", "0", "0"],
    invalidDuplicateOffsetFields: [],
    transformSettingsDraft: {
      translationSnap: "",
      rotationSnapDegrees: "",
      scaleSnap: "",
    },
    invalidTransformFields: [],
    sourceAnchor: "center",
    targetEntityId: null,
    targetAnchor: "center",
    capabilities: {
      group: disabled,
      reparent: disabled,
      align: disabled,
      distribute: disabled,
      duplicate: disabled,
      anchorSnap: disabled,
    },
    resetCapability: { enabled: false, reason: "run-disabled" },
    feedback: {
      activity: "idle",
      pivotKind: "entity-origin",
      pivotWorld: null,
      activeAxis: "free",
      deltaPosition: null,
      deltaRotationRadians: null,
      deltaScale: null,
      settings: DISABLED_TRANSFORM_SETTINGS,
      sourceAnchor: null,
      targetAnchor: null,
    },
    error: null,
    setAxis: () => undefined,
    setAlignAnchor: () => undefined,
    setReparentTargetId: () => undefined,
    setDuplicateOffsetDraft: () => undefined,
    setTransformSettingsDraft: () => undefined,
    setSourceAnchor: () => undefined,
    setTargetEntityId: () => undefined,
    setTargetAnchor: () => undefined,
    groupSelection: () => undefined,
    reparentSelection: () => undefined,
    alignSelection: () => undefined,
    distributeSelection: () => undefined,
    duplicateSelection: () => undefined,
    snapToAnchor: () => undefined,
    resetSelection: () => ({ status: "unavailable" }),
    commitEntityTransform: () => ({ status: "unavailable" }),
    selectFromTree: () => undefined,
    handleSelectionChange: () => undefined,
    handleReady: () => undefined,
    handleTransformPreview: () => undefined,
    handleTransformCommit: () => undefined,
  };
}
