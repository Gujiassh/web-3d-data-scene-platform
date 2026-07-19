// @vitest-environment happy-dom

import { act, createElement, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Annotation, DocumentCommand, SceneDocument } from "@web3d/document";
import type { AuthoringSceneHandle } from "@web3d/react";
import type { HotspotSessionEvidence, HotspotSurfaceHitEvidence } from "@web3d/runtime";

import type { StudioCommandOutcome } from "../workspace/command-outcome";
import { useStudioHotspots, type StudioHotspots } from "./useStudioHotspots";

describe("useStudioHotspots", () => {
  let container: HTMLDivElement;
  let root: Root;
  let current: StudioHotspots;
  let viewer: AuthoringSceneHandle;
  let renderedDocument: SceneDocument;
  let renderedMode: "edit" | "run";
  let execute: ReturnType<typeof vi.fn<(command: DocumentCommand) => StudioCommandOutcome>>;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    execute = vi.fn(() => ({ status: "changed" as const, revision: 2 }));
    viewer = hotspotViewer();
    renderedDocument = scene([]);
    renderedMode = "edit";
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  function Harness() {
    const common = {
      document: renderedDocument,
      projectId: "project-a",
      viewerRef: createRef<AuthoringSceneHandle>(),
      clearEntitySelection: vi.fn(),
      addDiagnostic: vi.fn(),
      defaultTitle: (index: number) => `Hotspot ${index}`,
      locale: "en" as const,
    };
    common.viewerRef.current = viewer;
    current = useStudioHotspots(
      renderedMode === "edit" ? { ...common, mode: "edit", execute } : { ...common, mode: "run" },
    );
    return null;
  }

  it("creates one complete annotation only after title confirmation and cancels without mutation", () => {
    render(scene([]), "edit");
    if (current.mode !== "edit") throw new Error("Expected Edit hotspot state.");
    const edit = current;
    act(() => edit.startPlacement());
    const session = vi.mocked(viewer.startHotspotPlacement).mock.results.at(-1)?.value;
    act(() => current.handlePlacementAccept(acceptEvent(session)));

    expect(execute).not.toHaveBeenCalled();
    expect(current.titleEditor?.kind).toBe("create");

    if (current.mode !== "edit") throw new Error("Expected current Edit hotspot state.");
    const acceptedEdit = current;
    act(() => acceptedEdit.confirmTitle("Infeed check"));
    expect(execute).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledWith({
      type: "add-annotation",
      after: expect.objectContaining({
        id: "annotation-1",
        title: "Infeed check",
        visible: true,
        locked: false,
        anchor: expect.objectContaining({ kind: "surface", entityId: "asset-entity" }),
        content: { kind: "plain-text", text: "" },
        action: { type: "show-content" },
      }),
    });
    expect(viewer.finishHotspotDraft).toHaveBeenCalledWith(session.sessionId);

    execute.mockClear();
    if (current.mode !== "edit") throw new Error("Expected current Edit hotspot state.");
    const nextEdit = current;
    act(() => nextEdit.startPlacement());
    const canceledSession = vi.mocked(viewer.startHotspotPlacement).mock.results.at(-1)?.value;
    act(() => current.handlePlacementAccept(acceptEvent(canceledSession)));
    if (current.mode !== "edit") throw new Error("Expected current Edit hotspot state.");
    const canceledEdit = current;
    act(() => canceledEdit.cancelDraft());
    expect(execute).not.toHaveBeenCalled();
    expect(viewer.finishHotspotDraft).toHaveBeenCalledWith(canceledSession.sessionId);
  });

  it("uses trim only to reject blank titles and preserves accepted title bytes", () => {
    render(scene([]), "edit");
    if (current.mode !== "edit") throw new Error("Expected Edit hotspot state.");
    const edit = current;
    act(() => edit.startPlacement());
    const session = vi.mocked(viewer.startHotspotPlacement).mock.results.at(-1)?.value;
    act(() => current.handlePlacementAccept(acceptEvent(session)));

    if (current.mode !== "edit") throw new Error("Expected current Edit hotspot state.");
    const acceptedEdit = current;
    act(() => acceptedEdit.confirmTitle("  Inspection \u{1F600}  "));

    expect(execute).toHaveBeenCalledWith({
      type: "add-annotation",
      after: expect.objectContaining({ title: "  Inspection \u{1F600}  " }),
    });
  });

  it("preserves create and rename editor context when the command is rejected", () => {
    render(scene([]), "edit");
    if (current.mode !== "edit") throw new Error("Expected Edit hotspot state.");
    const edit = current;
    act(() => edit.startPlacement());
    const session = vi.mocked(viewer.startHotspotPlacement).mock.results.at(-1)?.value;
    act(() => current.handlePlacementAccept(acceptEvent(session)));
    execute.mockReturnValueOnce({ status: "rejected", message: "stale" });

    if (current.mode !== "edit") throw new Error("Expected current Edit hotspot state.");
    const acceptedEdit = current;
    act(() => acceptedEdit.confirmTitle("Rejected create"));

    expect(current.titleEditor).toMatchObject({ kind: "create", session });
    expect(current.status).toBe("command-rejected");
    expect(viewer.finishHotspotDraft).not.toHaveBeenCalled();

    act(() => current.mode === "edit" && current.cancelDraft());
    const annotation = hotspot();
    render(scene([annotation]), "edit");
    act(() => current.mode === "edit" && current.startRename(annotation.id));
    execute.mockReturnValueOnce({ status: "unavailable" });
    act(() => current.mode === "edit" && current.confirmTitle("Rejected rename"));

    expect(current.titleEditor).toMatchObject({
      kind: "rename",
      annotationId: annotation.id,
      initialTitle: annotation.title,
    });
    expect(current.status).toBe("command-rejected");
  });

  it("releases rejected reposition resources without reporting success", () => {
    const annotation = hotspot();
    render(scene([annotation]), "edit");
    if (current.mode !== "edit") throw new Error("Expected Edit hotspot state.");
    const edit = current;
    act(() => edit.startReposition(annotation.id));
    const session = vi.mocked(viewer.startHotspotReposition).mock.results.at(-1)?.value;
    execute.mockReturnValueOnce({ status: "rejected", message: "stale" });

    act(() => current.handlePlacementAccept(acceptEvent(session, "reposition", annotation.id)));

    expect(current.status).toBe("command-rejected");
    expect(viewer.finishHotspotDraft).toHaveBeenCalledWith(session.sessionId);
    expect(current.placementActive).toBe(false);
  });

  it("repositions with one complete update command and preserves the annotation identity", () => {
    const annotation = hotspot();
    render(scene([annotation]), "edit");
    if (current.mode !== "edit") throw new Error("Expected Edit hotspot state.");
    const edit = current;
    act(() => edit.startReposition(annotation.id));
    const session = vi.mocked(viewer.startHotspotReposition).mock.results.at(-1)?.value;
    act(() => current.handlePlacementAccept(acceptEvent(session, "reposition", annotation.id)));

    expect(execute).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledWith({
      type: "update-annotation",
      before: annotation,
      after: expect.objectContaining({
        id: annotation.id,
        title: annotation.title,
        anchor: expect.objectContaining({ nodeIndex: 3 }),
      }),
    });
  });

  it("consumes the exact Runtime direct-pointer reposition session without synthesizing one", () => {
    const annotation = hotspot();
    render(scene([annotation]), "edit");
    const session: HotspotSessionEvidence = {
      sessionId: 41,
      kind: "reposition",
      annotationId: annotation.id,
      authority: {
        mode: "edit",
        documentId: "scene-a",
        documentRevision: 1,
        projectId: "project-a",
        sourceId: "scene-a",
        contextId: "webgl:0",
      },
    };

    act(() =>
      current.handleSessionStart({
        type: "hotspot-session-start",
        session,
        origin: "direct-pointer",
      }),
    );
    expect(viewer.startHotspotReposition).not.toHaveBeenCalled();
    expect(current.placementActive).toBe(true);
    act(() => current.handlePlacementAccept(acceptEvent(session, "reposition", annotation.id)));

    expect(execute).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledWith({
      type: "update-annotation",
      before: annotation,
      after: expect.objectContaining({ anchor: expect.objectContaining({ nodeIndex: 3 }) }),
    });
  });

  it.each(["no-surface", "unsupported"] as const)(
    "preserves the Runtime invalid-drop %s reason when the direct session cancels",
    (rejectionReason) => {
      const annotation = hotspot();
      render(scene([annotation]), "edit");
      const session = directRepositionSession(annotation.id);
      act(() =>
        current.handleSessionStart({
          type: "hotspot-session-start",
          session,
          origin: "direct-pointer",
        }),
      );

      act(() =>
        current.handleSessionCancel({
          type: "hotspot-session-cancel",
          session,
          reason: "cancel",
          rejectionReason,
          requiresAcknowledgment: false,
        }),
      );
      expect(current.status).toBe(rejectionReason);
      expect(execute).not.toHaveBeenCalled();
    },
  );

  it("keeps ordinary Escape cancellation distinct from an invalid drop", () => {
    const annotation = hotspot();
    render(scene([annotation]), "edit");
    const session = directRepositionSession(annotation.id);
    act(() =>
      current.handleSessionStart({
        type: "hotspot-session-start",
        session,
        origin: "direct-pointer",
      }),
    );

    act(() =>
      current.handleSessionCancel({
        type: "hotspot-session-cancel",
        session,
        reason: "cancel",
        requiresAcknowledgment: false,
      }),
    );
    expect(current.status).toBe("cancel");
  });

  it("exposes no mutation API in Run and activates through Runtime only", async () => {
    render(scene([hotspot()]), "run");
    expect(current.mode).toBe("run");
    expect("update" in current).toBe(false);
    expect("remove" in current).toBe(false);

    act(() => current.activate("hotspot-a"));
    await act(async () => Promise.resolve());
    expect(viewer.activateHotspot).toHaveBeenCalledWith("hotspot-a", "list");
    expect(execute).not.toHaveBeenCalled();
  });

  it("guards every locked authoring mutation before preview or command", () => {
    const annotation = hotspot({ locked: true, visible: false });
    render(scene([annotation]), "edit");
    if (current.mode !== "edit") throw new Error("Expected Edit hotspot state.");

    act(() => current.mode === "edit" && current.startRename(annotation.id));
    expect(current.titleEditor).toBeNull();
    expect(viewer.startHotspotReposition).not.toHaveBeenCalled();
    act(() => current.mode === "edit" && current.startReposition(annotation.id));
    expect(viewer.startHotspotReposition).not.toHaveBeenCalled();

    if (current.mode !== "edit") throw new Error("Expected Edit hotspot state.");
    expect(current.update(annotation, { ...annotation, title: "Blocked" })).toBe(false);
    act(() => current.mode === "edit" && current.remove(annotation.id));
    expect(execute).not.toHaveBeenCalled();
    expect(current.status).toBe("locked");

    act(() => current.mode === "edit" && current.toggleVisibility(annotation.id));
    act(() => current.mode === "edit" && current.toggleLock(annotation.id));
    expect(execute).toHaveBeenCalledTimes(2);
    expect(execute).toHaveBeenNthCalledWith(1, {
      type: "update-annotation",
      before: annotation,
      after: { ...annotation, visible: true },
    });
    expect(execute).toHaveBeenNthCalledWith(2, {
      type: "update-annotation",
      before: annotation,
      after: { ...annotation, locked: false },
    });
  });

  it("uses a list row fallback for hidden or unresolved popovers and rename", () => {
    const annotation = hotspot({ visible: false });
    vi.mocked(viewer.getHotspotViewState).mockReturnValue({
      annotationId: annotation.id,
      availability: "available",
      unavailableReason: null,
      resolution: "resolved",
      unresolvedReason: null,
      markerVisible: false,
      screenAnchor: { clientX: 900, clientY: 500 },
    });
    render(scene([annotation]), "edit");
    const rowAnchor = { clientX: 240, clientY: 180 };

    act(() => current.select(annotation.id, true, rowAnchor));
    expect(current.popoverAnchor).toEqual(rowAnchor);
    act(() => current.mode === "edit" && current.startRename(annotation.id, rowAnchor));
    expect(current.titleEditor?.screenAnchor).toEqual(rowAnchor);
  });

  it("requests deterministic list focus after rename cancellation, commit, and removal", () => {
    const first = hotspot({ id: "hotspot-a", title: "A" });
    const second = hotspot({ id: "hotspot-b", title: "B" });
    render(scene([first, second]), "edit");

    act(() => current.mode === "edit" && current.startRename(first.id));
    act(() => current.mode === "edit" && current.cancelDraft());
    expect(current.focusRequest).toMatchObject({ target: "row", annotationId: first.id });

    act(() => current.mode === "edit" && current.startRename(first.id));
    act(() => current.mode === "edit" && current.confirmTitle("Renamed"));
    expect(current.focusRequest).toMatchObject({ target: "row", annotationId: first.id });

    execute.mockClear();
    act(() => current.mode === "edit" && current.remove(first.id));
    expect(execute).toHaveBeenCalledWith({ type: "remove-annotation", before: first });
    expect(current.focusRequest).toMatchObject({ target: "row", annotationId: second.id });
  });

  it("focuses a newly created Runtime proxy only on bounded revision and ready signals", () => {
    vi.mocked(viewer.focusHotspotProxy).mockReturnValueOnce(false).mockReturnValueOnce(true);
    render(scene([]), "edit");
    act(() => current.mode === "edit" && current.startPlacement());
    const session = vi.mocked(viewer.startHotspotPlacement).mock.results.at(-1)?.value;
    act(() => current.handlePlacementAccept(acceptEvent(session)));
    act(() => current.mode === "edit" && current.confirmTitle("New hotspot"));

    expect(viewer.focusHotspotProxy).not.toHaveBeenCalled();
    const created = hotspot({
      id: "annotation-1",
      title: "New hotspot",
    });
    render({ ...scene([created]), revision: 2 }, "edit");
    expect(viewer.focusHotspotProxy).toHaveBeenCalledOnce();
    expect(viewer.focusHotspotProxy).toHaveBeenLastCalledWith(created.id);

    act(() => current.handleViewerReady());
    expect(viewer.focusHotspotProxy).toHaveBeenCalledTimes(2);
    act(() => current.handleViewerReady());
    expect(viewer.focusHotspotProxy).toHaveBeenCalledTimes(2);
  });

  it("cleans up a failed proxy-focus request after four lifecycle signals", () => {
    vi.mocked(viewer.focusHotspotProxy).mockReturnValue(false);
    render(scene([]), "edit");
    act(() => current.mode === "edit" && current.startPlacement());
    const session = vi.mocked(viewer.startHotspotPlacement).mock.results.at(-1)?.value;
    act(() => current.handlePlacementAccept(acceptEvent(session)));
    act(() => current.mode === "edit" && current.confirmTitle("New hotspot"));
    const created = hotspot({
      id: "annotation-1",
      title: "New hotspot",
    });

    for (const revision of [2, 3, 4, 5, 6]) {
      render({ ...scene([created]), revision }, "edit");
    }
    expect(viewer.focusHotspotProxy).toHaveBeenCalledTimes(4);
  });

  it("does not cancel an active placement on an ordinary rerender", () => {
    const document = scene([]);
    render(document, "edit");
    vi.mocked(viewer.cancelHotspotSession).mockClear();
    act(() => current.mode === "edit" && current.startPlacement());
    vi.mocked(viewer.cancelHotspotSession).mockClear();

    render(document, "edit");
    expect(viewer.cancelHotspotSession).not.toHaveBeenCalled();
    expect(current.placementActive).toBe(true);
  });

  it("does not retain a trusted host key in Studio Run content state", () => {
    render(scene([hotspot()]), "run");
    act(() =>
      current.handleHostContent({
        type: "hotspot-host-content-request",
        annotationId: "hotspot-a",
        title: "Pump",
        key: "private.host.route",
      }),
    );

    expect(current.runContent).toEqual({
      annotationId: "hotspot-a",
      title: "Pump",
      kind: "host-content",
    });
    expect(current.runContent !== null && "value" in current.runContent).toBe(false);
  });

  it("filters hidden Run rows and blocks unresolved activation with its typed reason", () => {
    const hidden = hotspot({ id: "hidden", title: "Hidden", visible: false });
    const unresolved = hotspot({ id: "unresolved", title: "Unresolved" });
    const resolved = hotspot({ id: "resolved", title: "Resolved" });
    vi.mocked(viewer.getHotspotViewState).mockImplementation((annotationId) =>
      annotationId === unresolved.id
        ? {
            annotationId,
            availability: "available",
            unavailableReason: null,
            resolution: "unresolved",
            unresolvedReason: "node-not-registered",
            markerVisible: false,
            screenAnchor: null,
          }
        : {
            annotationId,
            availability: "available",
            unavailableReason: null,
            resolution: "resolved",
            unresolvedReason: null,
            markerVisible: true,
            screenAnchor: { clientX: 400, clientY: 300 },
          },
    );
    render(scene([hidden, unresolved, resolved]), "run");

    expect(current.items.map((item) => item.annotation.id).sort()).toEqual([
      "resolved",
      "unresolved",
    ]);
    act(() => current.activate(unresolved.id));
    expect(viewer.activateHotspot).not.toHaveBeenCalled();
    expect(current.status).toBe("node-not-registered");
    act(() => current.activate(resolved.id));
    expect(viewer.activateHotspot).toHaveBeenCalledWith(resolved.id, "list");
  });

  function render(document: SceneDocument, mode: "edit" | "run"): void {
    renderedDocument = document;
    renderedMode = mode;
    act(() => root.render(createElement(Harness)));
  }
});

function hotspotViewer(): AuthoringSceneHandle {
  let sessionId = 0;
  const session = (kind: "placement" | "reposition", annotationId: string | null) => ({
    sessionId: ++sessionId,
    kind,
    annotationId,
    authority: {
      mode: "edit" as const,
      documentId: "scene-a",
      documentRevision: 1,
      projectId: "project-a",
      sourceId: "scene-a",
      contextId: "webgl:0",
    },
  });
  return {
    selectEntity: vi.fn(),
    selectEntities: vi.fn(),
    focusEntity: vi.fn(async () => undefined),
    focusHotspot: vi.fn(async () => undefined),
    focusHotspotProxy: vi.fn(() => true),
    getHotspotViewState: vi.fn((annotationId) => ({
      annotationId,
      availability: "available" as const,
      unavailableReason: null,
      resolution: "resolved" as const,
      unresolvedReason: null,
      markerVisible: true,
      screenAnchor: { clientX: 400, clientY: 300 },
    })),
    activateHotspot: vi.fn(async () => ({
      type: "hotspot-activation" as const,
      annotationId: "hotspot-a",
      actionType: "show-content" as const,
      origin: "list" as const,
      result: "content-shown" as const,
    })),
    startHotspotPlacement: vi.fn(() => session("placement", null)),
    startHotspotReposition: vi.fn((id) => session("reposition", id)),
    updateHotspotReticle: vi.fn(),
    acceptHotspotReticle: vi.fn(() => true),
    cancelHotspotSession: vi.fn(),
    finishHotspotDraft: vi.fn(() => true),
    acknowledgeHotspotCancellation: vi.fn(() => true),
    setTool: vi.fn(),
    getTool: vi.fn(() => "select" as const),
    isTransformDragging: vi.fn(() => false),
    setTransformSettings: vi.fn(),
    setSmartAlignEnabled: vi.fn(),
    getEntitySpatialSnapshots: vi.fn(() => []),
    setDataRuntimeEnabled: vi.fn(async () => undefined),
    setAuthoringMode: vi.fn(),
    setThemeBackground: vi.fn(),
    setBackgroundPreview: vi.fn(),
    setGridPreview: vi.fn(),
    setLightingPreview: vi.fn(),
    setAuthoredLightPropertyPreview: vi.fn(() => true),
    getLightCreationFrame: vi.fn(() => null),
    setView: vi.fn(async () => undefined),
    getSnapshot: vi.fn(),
  };
}

function acceptEvent(
  session: HotspotSessionEvidence,
  kind: "placement" | "reposition" = "placement",
  annotationId: string | null = null,
) {
  return {
    type: "hotspot-placement-accept" as const,
    session: { ...session, kind, annotationId },
    hit: surfaceHit(),
    screenAnchor: { clientX: 400, clientY: 300 },
  };
}

function directRepositionSession(annotationId: string): HotspotSessionEvidence {
  return {
    sessionId: 41,
    kind: "reposition",
    annotationId,
    authority: {
      mode: "edit",
      documentId: "scene-a",
      documentRevision: 1,
      projectId: "project-a",
      sourceId: "scene-a",
      contextId: "webgl:0",
    },
  };
}

function surfaceHit(): HotspotSurfaceHitEvidence {
  return {
    documentId: "scene-a",
    revision: 1,
    entityId: "asset-entity",
    assetHash: "a".repeat(64),
    nodeIndex: 3,
    worldPosition: [0, 0, 0],
    worldNormal: [0, 0, 1],
    nodeLocalPosition: [0, 0, 0],
    nodeLocalNormal: [0, 0, 1],
  };
}

function hotspot(overrides: Partial<Annotation> = {}): Annotation {
  return {
    id: "hotspot-a",
    title: "Pump",
    visible: true,
    locked: false,
    anchor: {
      kind: "surface",
      entityId: "asset-entity",
      assetHash: "a".repeat(64),
      nodeIndex: 1,
      nodeLocalPosition: [0, 0, 0],
      nodeLocalNormal: [0, 0, 1],
    },
    content: { kind: "plain-text", text: "" },
    action: { type: "show-content" },
    ...overrides,
  };
}

function scene(annotations: readonly Annotation[]): SceneDocument {
  return {
    schemaVersion: "1.4.0",
    id: "scene-a",
    name: "Scene",
    revision: 1,
    assets: [],
    entities: [],
    targets: [],
    dataSources: [],
    bindings: [],
    ruleSets: [],
    annotations,
    views: [],
    environment: {
      backgroundMode: "theme",
      background: "#FFFFFF",
      grid: true,
      unit: "m",
      upAxis: "Y",
      lighting: {
        fill: { skyColor: "#FFFFFF", groundColor: "#65706A", intensity: 1 },
        key: { color: "#FFFFFF", intensity: 1, directionToLight: [0, 1, 0] },
      },
    },
  };
}
