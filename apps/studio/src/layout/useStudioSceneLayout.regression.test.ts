// @vitest-environment happy-dom

import { Vector3, type Matrix4 } from "three";
import { act, createElement, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  executeDocumentCommand,
  type DocumentCommand,
  type SceneDocument,
  type SceneEntity,
  type Transform,
} from "@web3d/document";
import type { AuthoringSceneHandle } from "@web3d/react";
import type { AuthoringTool, EntitySpatialSnapshot } from "@web3d/runtime";

import { EntityInspector } from "../features/EntityInspector";
import { StudioI18nProvider } from "../i18n/I18nProvider";
import { SceneLayoutPanel } from "./SceneLayoutPanel";
import { matrixFromTransform } from "./spatial-math";
import { useStudioSceneLayout, type StudioSceneLayout } from "./useStudioSceneLayout";

const SOURCE_SELECTION = ["source"] as const;

describe("useStudioSceneLayout regressions", () => {
  let container: HTMLDivElement;
  let root: Root;
  let rafs: Map<number, FrameRequestCallback>;
  let nextRafId: number;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    rafs = new Map();
    nextRafId = 1;
    window.localStorage.clear();
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      const id = nextRafId++;
      rafs.set(id, callback);
      return id;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => rafs.delete(id));
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it("blocks invalid Inspector and gizmo transforms before dispatch", () => {
    let layout!: StudioSceneLayout;
    const execute = vi.fn();
    act(() => {
      root.render(
        createElement(
          StudioI18nProvider,
          null,
          createElement(InspectorHarness, {
            execute,
            onLayout(value) {
              layout = value;
            },
          }),
        ),
      );
    });
    flushAllRafs(rafs);

    const scaleX = inputByLabel(container, "Scale X");
    changeInput(scaleX, "0");
    blurInput(scaleX);
    expect(scaleX.value).toBe("0");
    expect(scaleX.getAttribute("aria-invalid")).toBe("true");
    expect(execute).not.toHaveBeenCalled();
    expect(container.querySelector("[data-revision]")?.textContent).toBe("1");
    expect(layout.error).toBeNull();

    const before = sourceEntity(scene(1)).transform;
    const invalidTransforms: Transform[] = [
      { ...before, position: [Number.POSITIVE_INFINITY, 0, 0] },
      { ...before, rotation: [0, Number.NaN, 0, 1] },
      { ...before, scale: [-1, 1, 1] },
      { ...before, scale: [Number.NaN, 1, 1] },
      { ...before, scale: [Number.POSITIVE_INFINITY, 1, 1] },
    ];
    for (const after of invalidTransforms) {
      act(() =>
        layout.handleTransformCommit({
          type: "transform-commit",
          entityId: "source",
          before,
          after,
        }),
      );
    }
    expect(execute).not.toHaveBeenCalled();
    expect(container.querySelector("[data-revision]")?.textContent).toBe("1");

    act(() =>
      layout.handleTransformCommit({
        type: "transform-commit",
        entityId: "source",
        before,
        after: { ...before, scale: [2, 1, 1] },
      }),
    );
    expect(execute).toHaveBeenCalledTimes(1);
    expect(container.querySelector("[data-revision]")?.textContent).toBe("2");
  });

  it("uses the preview transform world pivot under a rotated and scaled parent", () => {
    let layout!: StudioSceneLayout;
    const parent = groupEntity("parent", null, {
      position: [1, -2, 0.5],
      rotation: [0, 0, Math.sin(Math.PI / 4), Math.cos(Math.PI / 4)],
      scale: [2, 3, 1.5],
    });
    const source = groupEntity("source", "parent", transform([1, 0.5, -0.25]));
    const document = scene(1, [parent, source]);
    act(() => {
      root.render(
        createElement(
          StudioI18nProvider,
          null,
          createElement(HookHarness, {
            activeTool: "translate",
            document,
            selectedEntityIds: SOURCE_SELECTION,
            onLayout(value) {
              layout = value;
            },
          }),
        ),
      );
    });
    flushAllRafs(rafs);

    const after = { ...source.transform, position: [2.25, -0.5, 0.75] } as Transform;
    act(() =>
      layout.handleTransformPreview({
        type: "transform-preview",
        entityId: "source",
        transform: after,
      }),
    );
    const expectedWorld = matrixFromTransform(parent.transform).multiply(
      matrixFromTransform(after),
    );
    const expectedPivot = new Vector3().setFromMatrixPosition(expectedWorld);
    expect(layout.feedback.pivotWorld?.[0]).toBeCloseTo(expectedPivot.x, 12);
    expect(layout.feedback.pivotWorld?.[1]).toBeCloseTo(expectedPivot.y, 12);
    expect(layout.feedback.pivotWorld?.[2]).toBeCloseTo(expectedPivot.z, 12);
  });

  it("restores accepted anchor feedback after a failed revision refresh and ready retry", () => {
    let layout!: StudioSceneLayout;
    const control = { failNextSnapshot: false };
    act(() => {
      root.render(
        createElement(
          StudioI18nProvider,
          null,
          createElement(AnchorHarness, {
            control,
            onLayout(value) {
              layout = value;
            },
          }),
        ),
      );
    });
    flushAllRafs(rafs);
    act(() => layout.setTargetEntityId("target"));
    flushAllRafs(rafs);

    act(() => layout.snapToAnchor());
    expect(layout.feedback.deltaPosition).toEqual([10, 0, 0]);
    expect(layout.feedback.sourceAnchor).toEqual({ entityId: "source", anchorKind: "center" });

    control.failNextSnapshot = true;
    flushNextRaf(rafs);
    expect(layout.error).toBe("snapshot-unavailable");
    act(() => layout.handleReady());
    expect(layout.error).toBeNull();
    expect(layout.feedback.deltaPosition).toEqual([10, 0, 0]);
    expect(layout.feedback.sourceAnchor).toEqual({ entityId: "source", anchorKind: "center" });
    expect(layout.feedback.targetAnchor).toEqual({ entityId: "target", anchorKind: "center" });
    expect(layout.feedback.pivotWorld).toEqual([10, 0, 0]);

    act(() =>
      layout.handleSelectionChange({
        type: "entity-selection-change",
        entityId: "target",
        origin: "viewport",
      }),
    );
    expect(layout.feedback.sourceAnchor).toBeNull();
    expect(layout.feedback.targetAnchor).toBeNull();
    expect(layout.feedback.deltaPosition).toBeNull();
  });

  it("updates duplicate capability immediately with the production panel", () => {
    let layout!: StudioSceneLayout;
    act(() => {
      root.render(
        createElement(
          StudioI18nProvider,
          null,
          createElement(PanelHarness, {
            onLayout(value) {
              layout = value;
            },
          }),
        ),
      );
    });
    flushAllRafs(rafs);
    expect(layout.capabilities.duplicate).toEqual({ enabled: true, reason: null });

    const offsetX = inputByLabel(container, "Duplicate offset X");
    const duplicateButton = buttonByText(container, "Duplicate with offset");
    changeInput(offsetX, "bad");
    expect(offsetX.getAttribute("aria-invalid")).toBe("true");
    expect(duplicateButton.disabled).toBe(true);
    expect(layout.capabilities.duplicate).toEqual({ enabled: false, reason: "invalid-offset" });

    changeInput(offsetX, "2.5");
    expect(offsetX.getAttribute("aria-invalid")).toBe("false");
    expect(duplicateButton.disabled).toBe(false);
    expect(layout.capabilities.duplicate).toEqual({ enabled: true, reason: null });
  });
});

function InspectorHarness({
  execute,
  onLayout,
}: {
  readonly execute: (command: DocumentCommand) => void;
  readonly onLayout: (layout: StudioSceneLayout) => void;
}) {
  const [document, setDocument] = useState(() => scene(1));
  const documentRef = useRef(document);
  documentRef.current = document;
  const viewerRef = useSnapshotViewer(documentRef);
  const layout = useStudioSceneLayout({
    projectId: "project",
    document,
    mode: "edit",
    canEdit: true,
    activeTool: "scale",
    selectedEntityIds: SOURCE_SELECTION,
    primaryEntityId: "source",
    viewerRef,
    execute(command) {
      execute(command);
      if (command.type !== "transform-entity")
        return { status: "rejected", message: "Unsupported command." };
      const current = documentRef.current;
      const next: SceneDocument = {
        ...current,
        revision: current.revision + 1,
        entities: current.entities.map((entity) =>
          entity.id === command.entityId ? { ...entity, transform: command.after } : entity,
        ),
      };
      documentRef.current = next;
      setDocument(next);
      return { status: "changed", revision: next.revision };
    },
    selectEntity: () => undefined,
    selectEntities: () => undefined,
    addDiagnostic: () => undefined,
  });
  onLayout(layout);
  const source = sourceEntity(document);
  return createElement(
    "div",
    null,
    createElement(EntityInspector, {
      authoritativeRevision: document.revision,
      canReset: layout.resetCapability.enabled,
      entity: source,
      editable: true,
      onRename: () => undefined,
      onReset: layout.resetSelection,
      onTransformChange(entityId, after) {
        return layout.commitEntityTransform(entityId, after);
      },
    }),
    createElement("output", { "data-revision": true }, String(document.revision)),
  );
}

function HookHarness({
  activeTool,
  document,
  selectedEntityIds,
  onLayout,
}: {
  readonly activeTool: AuthoringTool;
  readonly document: SceneDocument;
  readonly selectedEntityIds: readonly string[];
  readonly onLayout: (layout: StudioSceneLayout) => void;
}) {
  const documentRef = useRef(document);
  documentRef.current = document;
  const layout = useStudioSceneLayout({
    projectId: "project",
    document,
    mode: "edit",
    canEdit: true,
    activeTool,
    selectedEntityIds,
    primaryEntityId: selectedEntityIds[0] ?? null,
    viewerRef: useSnapshotViewer(documentRef),
    execute: () => ({ status: "unchanged", revision: document.revision }),
    selectEntity: () => undefined,
    selectEntities: () => undefined,
    addDiagnostic: () => undefined,
  });
  onLayout(layout);
  return createElement("output", { "data-pivot": layout.feedback.pivotWorld?.join(",") ?? "" });
}

function AnchorHarness({
  control,
  onLayout,
}: {
  readonly control: { failNextSnapshot: boolean };
  readonly onLayout: (layout: StudioSceneLayout) => void;
}) {
  const [document, setDocument] = useState(() => scene(1));
  const [selectedEntityIds, setSelectedEntityIds] = useState<readonly string[]>(SOURCE_SELECTION);
  const documentRef = useRef(document);
  documentRef.current = document;
  const viewerRef = useRef<AuthoringSceneHandle | null>(null);
  if (viewerRef.current === null) {
    viewerRef.current = {
      getEntitySpatialSnapshots(entityIds: readonly string[]) {
        if (control.failNextSnapshot) {
          control.failNextSnapshot = false;
          throw new Error("viewer loading");
        }
        return entityIds.map((entityId) => spatialSnapshot(documentRef.current, entityId));
      },
    } as unknown as AuthoringSceneHandle;
  }
  const layout = useStudioSceneLayout({
    projectId: "project",
    document,
    mode: "edit",
    canEdit: true,
    activeTool: "translate",
    selectedEntityIds,
    primaryEntityId: selectedEntityIds[0] ?? null,
    viewerRef,
    execute(command) {
      const next = executeDocumentCommand(documentRef.current, command);
      documentRef.current = next;
      setDocument(next);
      return { status: "changed", revision: next.revision };
    },
    selectEntity(entityId) {
      setSelectedEntityIds(entityId === null ? [] : [entityId]);
    },
    selectEntities(entityIds) {
      setSelectedEntityIds(entityIds);
    },
    addDiagnostic: () => undefined,
  });
  onLayout(layout);
  return createElement("output", { "data-anchor": layout.feedback.sourceAnchor?.anchorKind ?? "" });
}

function PanelHarness({ onLayout }: { readonly onLayout: (layout: StudioSceneLayout) => void }) {
  const documentRef = useRef(scene(1));
  const document = documentRef.current;
  const layout = useStudioSceneLayout({
    projectId: "project",
    document,
    mode: "edit",
    canEdit: true,
    activeTool: "select",
    selectedEntityIds: SOURCE_SELECTION,
    primaryEntityId: "source",
    viewerRef: useSnapshotViewer(documentRef),
    execute: () => ({ status: "unchanged", revision: document.revision }),
    selectEntity: () => undefined,
    selectEntities: () => undefined,
    addDiagnostic: () => undefined,
  });
  onLayout(layout);
  return createElement(SceneLayoutPanel, { layout });
}

function useSnapshotViewer(
  documentRef: React.RefObject<SceneDocument>,
): React.RefObject<AuthoringSceneHandle | null> {
  const viewerRef = useRef<AuthoringSceneHandle | null>(null);
  if (viewerRef.current === null) {
    viewerRef.current = {
      getEntitySpatialSnapshots(entityIds: readonly string[]) {
        return entityIds.map((entityId) => spatialSnapshot(documentRef.current, entityId));
      },
    } as unknown as AuthoringSceneHandle;
  }
  return viewerRef;
}

function scene(
  revision: number,
  entities: readonly SceneEntity[] = defaultEntities(),
): SceneDocument {
  return {
    schemaVersion: "1.1.0",
    id: "scene",
    name: "Scene",
    revision,
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
    },
  };
}

function defaultEntities(): readonly SceneEntity[] {
  return [
    groupEntity("source", null, transform([0, 0, 0])),
    groupEntity("target", null, transform([10, 0, 0])),
  ];
}

function groupEntity(id: string, parentId: string | null, value: Transform): SceneEntity {
  return {
    id,
    type: "group",
    parentId,
    name: id,
    visible: true,
    locked: false,
    transform: value,
    metadata: {},
  };
}

function transform(position: Transform["position"]): Transform {
  return { position, rotation: [0, 0, 0, 1], scale: [1, 1, 1] };
}

function sourceEntity(document: SceneDocument): SceneEntity {
  return document.entities.find((entity) => entity.id === "source")!;
}

function spatialSnapshot(document: SceneDocument, entityId: string): EntitySpatialSnapshot {
  const entity = document.entities.find((candidate) => candidate.id === entityId)!;
  const world = entityWorldMatrix(document, entity);
  const pivot = new Vector3().setFromMatrixPosition(world);
  return {
    documentId: document.id,
    documentRevision: document.revision,
    entityId,
    parentId: entity.parentId,
    localTransform: entity.transform,
    worldMatrix: world.toArray() as EntitySpatialSnapshot["worldMatrix"],
    worldBounds: {
      min: [pivot.x - 1, pivot.y - 1, pivot.z - 1],
      max: [pivot.x + 1, pivot.y + 1, pivot.z + 1],
    },
    worldPivot: [pivot.x, pivot.y, pivot.z],
    visible: entity.visible,
    locked: entity.locked,
  };
}

function entityWorldMatrix(document: SceneDocument, entity: SceneEntity): Matrix4 {
  const local = matrixFromTransform(entity.transform);
  if (entity.parentId === null) return local;
  const parent = document.entities.find((candidate) => candidate.id === entity.parentId)!;
  return entityWorldMatrix(document, parent).multiply(local);
}

function inputByLabel(container: HTMLElement, label: string): HTMLInputElement {
  const input = container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
  if (input === null) throw new Error(`Missing input: ${label}`);
  return input;
}

function buttonByText(container: HTMLElement, text: string): HTMLButtonElement {
  const button = [...container.querySelectorAll<HTMLButtonElement>("button")].find((candidate) =>
    candidate.textContent?.includes(text),
  );
  if (button === undefined) throw new Error(`Missing button: ${text}`);
  return button;
}

function changeInput(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  if (setter === undefined) throw new Error("HTMLInputElement value setter is unavailable.");
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function blurInput(input: HTMLInputElement): void {
  act(() => input.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
}

function flushNextRaf(rafs: Map<number, FrameRequestCallback>): void {
  const first = rafs.entries().next().value as [number, FrameRequestCallback] | undefined;
  if (first === undefined) throw new Error("Expected a queued animation frame.");
  rafs.delete(first[0]);
  act(() => first[1](0));
}

function flushAllRafs(rafs: Map<number, FrameRequestCallback>): void {
  while (rafs.size > 0) flushNextRaf(rafs);
}
