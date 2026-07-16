// @vitest-environment happy-dom

import { act, createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SceneDocument, SceneEntity } from "@web3d/document";
import type { AuthoringSceneHandle } from "@web3d/react";
import type { EntitySpatialSnapshot } from "@web3d/runtime";

import { StudioI18nProvider } from "../i18n/I18nProvider";
import { matrixFromTransform } from "./spatial-math";
import { useStudioSceneLayout, type StudioSceneLayout } from "./useStudioSceneLayout";

describe("useStudioSceneLayout lifecycle", () => {
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

  it("does not let an old action RAF overwrite feedback after the document render advances", () => {
    let currentDocument = scene(1, 0);
    let layout!: StudioSceneLayout;
    const execute = vi.fn();
    const viewer = {
      getEntitySpatialSnapshots(ids: readonly string[]) {
        return ids.map((id) => snapshot(currentDocument, id));
      },
    } as unknown as AuthoringSceneHandle;
    const render = (mode: "edit" | "run" = "edit", projectId = "project") => {
      act(() => {
        root.render(
          createElement(
            StudioI18nProvider,
            null,
            createElement(Harness, {
              mode,
              projectId,
              viewer,
              execute,
              advanceDocument() {
                currentDocument = scene(2, 10);
                return currentDocument;
              },
              onLayout(value) {
                layout = value;
              },
            }),
          ),
        );
      });
    };

    render();
    flushAllRafs(rafs);
    act(() => layout.setTargetEntityId("target"));
    flushAllRafs(rafs);
    act(() => layout.snapToAnchor());
    expect(layout.feedback.sourceAnchor).toEqual({ entityId: "source", anchorKind: "center" });
    expect(layout.feedback.deltaPosition).toEqual([10, 0, 0]);

    flushNextRaf(rafs);
    expect(layout.feedback.sourceAnchor).toEqual({ entityId: "source", anchorKind: "center" });
    expect(layout.feedback.targetAnchor).toEqual({ entityId: "target", anchorKind: "center" });
    expect(layout.feedback.deltaPosition).toEqual([10, 0, 0]);

    render("run");
    expect(layout.feedback.sourceAnchor).toBeNull();
    render("edit", "project-b");
    expect(layout.feedback.sourceAnchor).toBeNull();
  });
});

function Harness({
  mode,
  projectId,
  viewer,
  execute,
  advanceDocument,
  onLayout,
}: {
  readonly mode: "edit" | "run";
  readonly projectId: string;
  readonly viewer: AuthoringSceneHandle;
  readonly execute: () => void;
  readonly advanceDocument: () => SceneDocument;
  readonly onLayout: (layout: StudioSceneLayout) => void;
}) {
  const [sceneDocument, setSceneDocument] = useState(() => scene(1, 0));
  const layout = useStudioSceneLayout({
    projectId,
    document: sceneDocument,
    mode,
    canEdit: mode === "edit",
    activeTool: "translate",
    selectedEntityIds: ["source"],
    primaryEntityId: "source",
    viewerRef: { current: viewer },
    execute() {
      execute();
      const next = advanceDocument();
      setSceneDocument(next);
      return { status: "changed", revision: next.revision };
    },
    selectEntity: () => undefined,
    selectEntities: () => undefined,
    addDiagnostic: () => undefined,
  });
  onLayout(layout);
  return createElement("output", {
    "data-source-anchor": layout.feedback.sourceAnchor?.anchorKind ?? "none",
  });
}

function scene(revision: number, sourceX: number): SceneDocument {
  return {
    schemaVersion: "1.2.0",
    id: "scene",
    name: "Scene",
    revision,
    assets: [],
    entities: [entity("source", sourceX), entity("target", 10)],
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

function entity(id: string, x: number): SceneEntity {
  return {
    id,
    type: "group",
    parentId: null,
    name: id,
    visible: true,
    locked: false,
    transform: { position: [x, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
    metadata: {},
  };
}

function snapshot(sceneDocument: SceneDocument, entityId: string): EntitySpatialSnapshot {
  const entity = sceneDocument.entities.find((candidate) => candidate.id === entityId)!;
  const x = entity.transform.position[0];
  return {
    documentId: sceneDocument.id,
    documentRevision: sceneDocument.revision,
    entityId,
    parentId: entity.parentId,
    localTransform: entity.transform,
    worldMatrix: matrixFromTransform(
      entity.transform,
    ).toArray() as EntitySpatialSnapshot["worldMatrix"],
    worldBounds: { min: [x - 1, -1, -1], max: [x + 1, 1, 1] },
    worldPivot: [x, 0, 0],
    visible: true,
    locked: false,
  };
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
