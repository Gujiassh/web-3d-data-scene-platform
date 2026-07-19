// @vitest-environment happy-dom

import type { SceneDocument } from "@web3d/document";
import { BoxGeometry, BufferAttribute, Group, Mesh, PerspectiveCamera, Scene } from "three";
import { describe, expect, it, vi } from "vitest";

import type { AuthoringViewerEvent, ViewerEvent } from "../types";
import type { RuntimeGeneration } from "../viewer/runtime-generation";
import { HotspotOverlay } from "./hotspot-overlay";
import { HotspotRuntimeController } from "./hotspot-runtime-controller";
import { HotspotSurfaceIndex } from "./surface-index";

describe("HotspotRuntimeController", () => {
  it("reports bounded transient view state for resolved, unresolved, and missing annotations", () => {
    const harness = createHarness("edit");
    expect(harness.controller.getViewState("missing")).toEqual({
      annotationId: "missing",
      availability: "unavailable",
      unavailableReason: "annotation-not-found",
      resolution: "unresolved",
      unresolvedReason: null,
      markerVisible: false,
      screenAnchor: null,
    });

    harness.controller.sync(sceneDocument(), generation());
    expect(harness.controller.getViewState("hotspot-a")).toEqual({
      annotationId: "hotspot-a",
      availability: "available",
      unavailableReason: null,
      resolution: "resolved",
      unresolvedReason: null,
      markerVisible: false,
      screenAnchor: null,
    });

    const visibleSource = sceneDocument();
    const visibleAnnotation = visibleSource.annotations[0]!;
    if (visibleAnnotation.anchor.kind !== "surface") throw new Error("Expected surface anchor.");
    harness.controller.sync(
      {
        ...visibleSource,
        annotations: [
          {
            ...visibleAnnotation,
            anchor: {
              ...visibleAnnotation.anchor,
              nodeLocalPosition: [0, 0, 0.5],
            },
          },
        ],
      },
      generation(),
    );
    expect(harness.controller.getViewState("hotspot-a")).toMatchObject({
      resolution: "resolved",
      markerVisible: true,
      screenAnchor: { clientX: 400, clientY: 300 },
    });

    harness.controller.sync(sceneDocument({ assetHash: "b".repeat(64) }), generation());
    expect(harness.controller.getViewState("hotspot-a")).toEqual({
      annotationId: "hotspot-a",
      availability: "available",
      unavailableReason: null,
      resolution: "unresolved",
      unresolvedReason: "asset-hash-mismatch",
      markerVisible: false,
      screenAnchor: null,
    });
    harness.controller.dispose();
  });

  it("emits unresolved diagnostics and no marker activation without guessing", () => {
    const harness = createHarness("run");
    const document = sceneDocument({ assetHash: "wrong-hash" });
    harness.controller.sync(document, generation());

    expect(harness.diagnostics).toHaveLength(1);
    expect(harness.diagnostics[0]).toMatchObject({
      code: "ANNOTATION_SURFACE_UNRESOLVED",
      annotationId: "hotspot-a",
    });
    expect(harness.container.querySelectorAll(".web3d-hotspot-proxy")).toHaveLength(0);
    expect(harness.controller.activateAt(400, 300)).toBe(false);
    return expect(harness.controller.activate("hotspot-a", "list")).rejects.toThrow("unavailable");
  });

  it("blocks Run activation until matching cancellation acknowledgment and emits no mutation route", async () => {
    const harness = createHarness("edit");
    harness.controller.sync(sceneDocument(), generation());
    const session = harness.controller.startPlacement();

    harness.controller.setMode("run");
    expect(harness.authoringEvents).toContainEqual({
      type: "hotspot-session-cancel",
      session,
      reason: "mode",
      requiresAcknowledgment: true,
    });
    await expect(harness.controller.activate("hotspot-a", "list")).rejects.toThrow(
      "interactive Run mode",
    );
    expect(harness.controller.acknowledgeCancellation(session.sessionId + 1)).toBe(false);
    expect(harness.controller.acknowledgeCancellation(session.sessionId)).toBe(true);

    await expect(harness.controller.activate("hotspot-a", "list")).resolves.toMatchObject({
      annotationId: "hotspot-a",
      actionType: "show-content",
      result: "content-shown",
    });
    expect(harness.viewerEvents).toContainEqual({
      type: "hotspot-content",
      annotationId: "hotspot-a",
      title: "Pump",
      text: "Read only",
    });
    expect(
      harness.viewerEvents.filter((event) => event.type === "hotspot-activation"),
    ).toHaveLength(1);
    expect(Object.keys(harness.options)).not.toContain("executeDocumentCommand");
    harness.controller.dispose();
  });

  it("disposes controller-owned DOM and ignores repeated disposal", () => {
    const harness = createHarness("run");
    harness.controller.sync(sceneDocument(), generation());
    expect(harness.container.querySelector(".web3d-hotspot-overlay")).not.toBeNull();

    harness.controller.dispose();
    harness.controller.dispose();

    expect(harness.container.querySelector(".web3d-hotspot-overlay")).toBeNull();
    expect(() => harness.controller.startPlacement()).toThrow("disposed");
  });

  it("diagnoses hidden and legacy anchors while excluding them from Run markers", () => {
    const harness = createHarness("run");
    const source = sceneDocument();
    harness.controller.sync(
      {
        ...source,
        annotations: [
          { ...source.annotations[0]!, visible: false },
          {
            ...source.annotations[0]!,
            id: "legacy-hotspot",
            anchor: { kind: "legacy", targetId: "target-a", localOffset: [0, 0, 0] },
          },
        ],
      },
      generation(),
    );

    expect(harness.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "ANNOTATION_SURFACE_UNRESOLVED",
        annotationId: "legacy-hotspot",
      }),
    );
    expect(harness.container.querySelectorAll(".web3d-hotspot-proxy")).toHaveLength(0);
    harness.controller.dispose();
  });

  it("requires loaded authority and rejects locked reposition", () => {
    const harness = createHarness("edit");
    expect(() => harness.controller.startPlacement()).toThrow("loaded scene");
    const source = sceneDocument();
    harness.controller.sync(
      {
        ...source,
        annotations: [{ ...source.annotations[0]!, locked: true }],
      },
      generation(),
    );
    expect(() => harness.controller.startReposition("hotspot-a")).toThrow("locked");
    harness.controller.dispose();
  });

  it("focuses only a reconciled visible proxy without moving the camera", () => {
    const harness = createHarness("edit");
    const source = visibleSceneDocument();
    harness.controller.sync(source, generation());

    expect(harness.controller.focusProxy("hotspot-a")).toBe(true);
    expect(document.activeElement).toBe(
      harness.container.querySelector('[data-hotspot-id="hotspot-a"]'),
    );
    expect(harness.options.focusPoint).not.toHaveBeenCalled();
    expect(harness.controller.focusProxy("missing")).toBe(false);

    harness.controller.sync(
      { ...source, annotations: [{ ...source.annotations[0]!, visible: false }] },
      generation(),
    );
    expect(harness.controller.focusProxy("hotspot-a")).toBe(false);
    harness.controller.sync(sceneDocument({ assetHash: "wrong" }), generation());
    expect(harness.controller.focusProxy("hotspot-a")).toBe(false);
    expect(harness.options.focusPoint).not.toHaveBeenCalled();
    harness.controller.dispose();
  });

  it("keeps sub-threshold proxy motion as one Edit selection without a reposition session", () => {
    const harness = createHarness("edit");
    harness.controller.sync(visibleSceneDocument(), generation());
    const button = hotspotProxy(harness.container, "hotspot-a");
    installPointerCapture(button);

    button.dispatchEvent(pointerEvent("pointerdown", 400, 300, 21));
    button.dispatchEvent(pointerEvent("pointermove", 402, 303, 21));
    button.dispatchEvent(pointerEvent("pointerup", 402, 303, 21));
    button.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));

    expect(
      harness.authoringEvents.filter((event) => event.type === "hotspot-selection-request"),
    ).toEqual([
      { type: "hotspot-selection-request", annotationId: "hotspot-a", origin: "viewport" },
    ]);
    expect(harness.authoringEvents.some((event) => event.type === "hotspot-session-start")).toBe(
      false,
    );
    expect(harness.authoringEvents.some((event) => event.type === "hotspot-placement-accept")).toBe(
      false,
    );
    harness.controller.dispose();
  });

  it("guards locked markers before direct reposition starts", () => {
    const harness = createHarness("edit");
    const source = visibleSceneDocument();
    harness.controller.sync(
      { ...source, annotations: [{ ...source.annotations[0]!, locked: true }] },
      generation(),
    );
    const button = hotspotProxy(harness.container, "hotspot-a");
    const capture = installPointerCapture(button);

    button.dispatchEvent(pointerEvent("pointerdown", 400, 300, 22));
    button.dispatchEvent(pointerEvent("pointermove", 410, 300, 22));

    expect(capture.set).not.toHaveBeenCalled();
    expect(harness.authoringEvents.some((event) => event.type === "hotspot-session-start")).toBe(
      false,
    );
    expect(
      harness.authoringEvents.some((event) => event.type === "hotspot-placement-preview"),
    ).toBe(false);
    harness.controller.dispose();
  });

  it("emits one direct reposition session and one valid acceptance without click selection", () => {
    const harness = createHarness("edit");
    harness.controller.sync(visibleSceneDocument(), generation());
    const button = hotspotProxy(harness.container, "hotspot-a");
    installPointerCapture(button);

    button.dispatchEvent(pointerEvent("pointerdown", 400, 300, 23));
    button.dispatchEvent(pointerEvent("pointermove", 404, 300, 23));
    button.dispatchEvent(pointerEvent("pointerup", 400, 300, 23));
    button.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));

    const starts = harness.authoringEvents.filter(
      (event) => event.type === "hotspot-session-start",
    );
    expect(starts).toHaveLength(1);
    expect(starts[0]).toMatchObject({
      origin: "direct-pointer",
      session: { kind: "reposition", annotationId: "hotspot-a" },
    });
    expect(
      harness.authoringEvents.filter((event) => event.type === "hotspot-placement-accept"),
    ).toHaveLength(1);
    const accept = harness.authoringEvents.find(
      (event) => event.type === "hotspot-placement-accept",
    );
    expect(accept?.session.sessionId).toBe(starts[0]?.session.sessionId);
    expect(
      harness.authoringEvents.filter((event) => event.type === "hotspot-selection-request"),
    ).toHaveLength(0);
    expect(button.style.opacity).toBe("1");
    expect(harness.options.scene.getObjectByName("web3d-hotspot-overlay")).toMatchObject({
      count: 1,
    });
    harness.controller.dispose();
  });

  it("cancels one invalid direct release and restores marker interactivity", () => {
    const harness = createHarness("edit");
    harness.controller.sync(visibleSceneDocument(), generation());
    const button = hotspotProxy(harness.container, "hotspot-a");
    installPointerCapture(button);

    button.dispatchEvent(pointerEvent("pointerdown", 400, 300, 24));
    button.dispatchEvent(pointerEvent("pointermove", 404, 300, 24));
    button.dispatchEvent(pointerEvent("pointerup", 790, 590, 24));

    expect(harness.authoringEvents).toContainEqual(
      expect.objectContaining({
        type: "hotspot-placement-preview",
        result: { status: "rejected", reason: "no-surface" },
      }),
    );
    expect(harness.authoringEvents).toContainEqual(
      expect.objectContaining({
        type: "hotspot-session-cancel",
        reason: "cancel",
        requiresAcknowledgment: false,
        rejectionReason: "no-surface",
      }),
    );
    expect(harness.authoringEvents.some((event) => event.type === "hotspot-placement-accept")).toBe(
      false,
    );
    expect(button.style.opacity).toBe("1");
    expect(button.style.pointerEvents).toBe("auto");
    harness.controller.dispose();
  });

  it("carries unsupported rejection through direct-drop cancellation with zero acceptance", () => {
    const harness = createHarness("edit");
    const fixture = placementGeneration({ foreground: "morph" });
    fixture.object.visible = false;
    const source = placementDocument();
    const template = sceneDocument().annotations[0]!;
    harness.controller.sync(
      {
        ...source,
        annotations: [
          {
            ...template,
            anchor: {
              kind: "surface",
              entityId: "rear-entity",
              assetHash: "b".repeat(64),
              nodeIndex: 2,
              nodeLocalPosition: [0, 0, 0.1],
              nodeLocalNormal: [0, 0, 1],
            },
          },
        ],
      },
      fixture.generation,
    );
    const button = hotspotProxy(harness.container, "hotspot-a");
    installPointerCapture(button);

    button.dispatchEvent(pointerEvent("pointerdown", 400, 300, 27));
    fixture.object.visible = true;
    button.dispatchEvent(pointerEvent("pointermove", 404, 300, 27));
    button.dispatchEvent(pointerEvent("pointerup", 400, 300, 27));

    expect(harness.authoringEvents).toContainEqual(
      expect.objectContaining({
        type: "hotspot-placement-preview",
        result: { status: "rejected", reason: "unsupported" },
      }),
    );
    expect(harness.authoringEvents).toContainEqual(
      expect.objectContaining({
        type: "hotspot-session-cancel",
        reason: "cancel",
        rejectionReason: "unsupported",
      }),
    );
    expect(harness.authoringEvents.some((event) => event.type === "hotspot-placement-accept")).toBe(
      false,
    );
    expect(button.style.opacity).toBe("1");
    expect(button.style.pointerEvents).toBe("auto");
    harness.controller.dispose();
  });

  it("keeps direct Escape cancellation generic and emits zero acceptance", () => {
    const harness = createHarness("edit");
    harness.controller.sync(visibleSceneDocument(), generation());
    const button = hotspotProxy(harness.container, "hotspot-a");
    installPointerCapture(button);

    button.dispatchEvent(pointerEvent("pointerdown", 400, 300, 26));
    button.dispatchEvent(pointerEvent("pointermove", 404, 300, 26));
    button.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));

    const cancellation = harness.authoringEvents.find(
      (event) => event.type === "hotspot-session-cancel",
    );
    expect(cancellation).toMatchObject({
      type: "hotspot-session-cancel",
      reason: "cancel",
      requiresAcknowledgment: false,
    });
    expect(cancellation).not.toHaveProperty("rejectionReason");
    expect(harness.authoringEvents.some((event) => event.type === "hotspot-placement-accept")).toBe(
      false,
    );
    expect(button.style.opacity).toBe("1");
    expect(button.style.pointerEvents).toBe("auto");
    harness.controller.dispose();
  });

  it("keeps Run marker pointer activation unchanged and never starts direct reposition", async () => {
    const harness = createHarness("run");
    harness.controller.sync(visibleSceneDocument(), generation());
    const button = hotspotProxy(harness.container, "hotspot-a");
    const capture = installPointerCapture(button);

    button.dispatchEvent(pointerEvent("pointerdown", 400, 300, 25));
    button.dispatchEvent(pointerEvent("pointermove", 410, 300, 25));
    button.dispatchEvent(pointerEvent("pointerup", 410, 300, 25));
    button.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
    await vi.waitFor(() => {
      expect(
        harness.viewerEvents.filter((event) => event.type === "hotspot-activation"),
      ).toHaveLength(1);
    });

    expect(capture.set).not.toHaveBeenCalled();
    expect(harness.authoringEvents.some((event) => event.type === "hotspot-session-start")).toBe(
      false,
    );
    harness.controller.dispose();
  });

  it.each(["node", "ancestor"] as const)(
    "removes markers under a hidden %s, preserves resolution, and restores without persistence mutation",
    async (hiddenObject) => {
      const harness = createHarness("run");
      const fixture = generationFixture();
      const source = sceneDocument();
      const bytes = JSON.stringify(source);
      harness.controller.sync(source, fixture.generation);
      expect(harness.container.querySelectorAll(".web3d-hotspot-proxy")).toHaveLength(1);

      fixture[hiddenObject].visible = false;
      harness.controller.render();

      expect(harness.container.querySelectorAll(".web3d-hotspot-proxy")).toHaveLength(0);
      expect(harness.controller.getViewState("hotspot-a")).toMatchObject({
        resolution: "resolved",
        markerVisible: false,
        screenAnchor: null,
      });
      await expect(harness.controller.focus("hotspot-a")).resolves.toBeUndefined();
      await expect(harness.controller.activate("hotspot-a", "list")).rejects.toThrow("unavailable");
      expect(JSON.stringify(source)).toBe(bytes);

      fixture[hiddenObject].visible = true;
      harness.controller.render();

      expect(harness.container.querySelectorAll(".web3d-hotspot-proxy")).toHaveLength(1);
      expect(harness.controller.getViewState("hotspot-a").resolution).toBe("resolved");
      await expect(harness.controller.activate("hotspot-a", "list")).resolves.toMatchObject({
        annotationId: "hotspot-a",
      });
      expect(JSON.stringify(source)).toBe(bytes);
      harness.controller.dispose();
    },
  );

  it.each(["object", "ancestor"] as const)(
    "skips a hidden foreground %s and accepts the visible rear surface",
    (hiddenObject) => {
      const harness = createHarness("edit");
      const fixture = placementGeneration({ foreground: "supported" });
      fixture[hiddenObject].visible = false;
      harness.controller.sync(placementDocument(), fixture.generation);
      const session = harness.controller.startPlacement();

      dispatchPointerUp(harness.surface, 400, 300);

      expect(harness.authoringEvents).toContainEqual({
        type: "hotspot-placement-preview",
        session,
        result: { status: "valid" },
        screenAnchor: { clientX: 400, clientY: 300 },
      });
      expect(harness.authoringEvents).toContainEqual(
        expect.objectContaining({
          type: "hotspot-placement-accept",
          session,
          hit: expect.objectContaining({ entityId: "rear-entity", nodeIndex: 2 }),
          screenAnchor: { clientX: 400, clientY: 300 },
        }),
      );
      harness.controller.dispose();
    },
  );

  it("blocks a supported rear surface behind a registered unsupported AssetEntity surface", () => {
    const harness = createHarness("edit");
    const fixture = placementGeneration({ foreground: "morph" });
    harness.controller.sync(placementDocument(), fixture.generation);
    const session = harness.controller.startPlacement();

    dispatchPointerUp(harness.surface, 400, 300);

    expect(harness.authoringEvents).toContainEqual({
      type: "hotspot-placement-preview",
      session,
      result: { status: "rejected", reason: "unsupported" },
      screenAnchor: null,
    });
    expect(harness.authoringEvents.some((event) => event.type === "hotspot-placement-accept")).toBe(
      false,
    );
    expect(harness.controller.acceptReticle()).toBe(false);
    harness.controller.cancelSession();
    harness.controller.dispose();
  });

  it("blocks a rear surface behind an unassociated Mesh inside an AssetEntity", () => {
    const harness = createHarness("edit");
    const fixture = placementGeneration({ foreground: "unassociated" });
    harness.controller.sync(placementDocument(), fixture.generation);
    const session = harness.controller.startPlacement();

    dispatchPointerUp(harness.surface, 400, 300);

    expect(harness.authoringEvents).toContainEqual({
      type: "hotspot-placement-preview",
      session,
      result: { status: "rejected", reason: "unsupported" },
      screenAnchor: null,
    });
    expect(harness.authoringEvents.some((event) => event.type === "hotspot-placement-accept")).toBe(
      false,
    );
    harness.controller.cancelSession();
    harness.controller.dispose();
  });

  it("skips authored-light and unowned Runtime helpers before a supported model surface", () => {
    const harness = createHarness("edit");
    const fixture = placementGeneration({ foreground: "light-and-runtime-helpers" });
    harness.controller.sync(placementDocument(), fixture.generation);
    const session = harness.controller.startPlacement();

    dispatchPointerUp(harness.surface, 400, 300);

    expect(harness.authoringEvents).toContainEqual({
      type: "hotspot-placement-preview",
      session,
      result: { status: "valid" },
      screenAnchor: null,
    });
    expect(harness.authoringEvents).toContainEqual(
      expect.objectContaining({
        type: "hotspot-placement-accept",
        hit: expect.objectContaining({ entityId: "rear-entity" }),
      }),
    );
    harness.controller.dispose();
  });

  it("emits no-surface without ending the active session", () => {
    const harness = createHarness("edit");
    harness.controller.sync(placementDocument(), emptyGeneration());
    const session = harness.controller.startPlacement();

    dispatchPointerUp(harness.surface, 400, 300);

    expect(harness.authoringEvents).toContainEqual({
      type: "hotspot-placement-preview",
      session,
      result: { status: "rejected", reason: "no-surface" },
      screenAnchor: null,
    });
    expect(harness.authoringEvents.some((event) => event.type === "hotspot-placement-accept")).toBe(
      false,
    );
    harness.controller.cancelSession();
    harness.controller.dispose();
  });

  it("retains an accepted draft marker until Studio confirms or cancels the title", () => {
    const harness = createHarness("edit");
    const fixture = placementGeneration({ foreground: "supported" });
    fixture.object.visible = false;
    harness.controller.sync(placementDocument(), fixture.generation);
    const session = harness.controller.startPlacement();

    dispatchPointerUp(harness.surface, 400, 300);

    const markerMesh = harness.options.scene.getObjectByName("web3d-hotspot-overlay");
    expect(markerMesh).toMatchObject({ count: 1 });
    expect(harness.controller.finishDraft(session.sessionId + 1)).toBe(false);
    expect(markerMesh).toMatchObject({ count: 1 });
    expect(harness.controller.finishDraft(session.sessionId)).toBe(true);
    expect(markerMesh).toMatchObject({ count: 0 });
    harness.controller.dispose();
  });

  it("cancels accepted draft evidence before Run authority without mutating source bytes", async () => {
    const harness = createHarness("edit");
    const fixture = placementGeneration({ foreground: "supported" });
    fixture.object.visible = false;
    const source = placementDocument();
    const bytes = JSON.stringify(source);
    harness.controller.sync(source, fixture.generation);
    const session = harness.controller.startPlacement();
    dispatchPointerUp(harness.surface, 400, 300);
    expect(harness.authoringEvents).toContainEqual(
      expect.objectContaining({ type: "hotspot-placement-accept", session }),
    );

    harness.controller.setMode("run");

    expect(harness.authoringEvents).toContainEqual({
      type: "hotspot-session-cancel",
      session,
      reason: "mode",
      requiresAcknowledgment: true,
    });
    expect(JSON.stringify(source)).toBe(bytes);
    expect(harness.container.querySelector(".web3d-hotspot-reticle")).toMatchObject({
      hidden: true,
    });
    expect(harness.options.scene.getObjectByName("web3d-hotspot-overlay")).toMatchObject({
      count: 0,
    });
    await expect(harness.controller.activate("hotspot-a", "list")).rejects.toThrow(
      "interactive Run mode",
    );
    expect(harness.controller.acknowledgeCancellation(session.sessionId + 1)).toBe(false);
    expect(harness.controller.acknowledgeCancellation(session.sessionId)).toBe(true);
    harness.controller.dispose();
  });

  it.each([
    {
      label: "document replacement",
      reason: "source",
      dispose: false,
      invalidate(controller: HotspotRuntimeController, source: SceneDocument) {
        controller.prepareSource("scene-b", source.revision);
      },
    },
    {
      label: "source context",
      reason: "source",
      dispose: false,
      invalidate(controller: HotspotRuntimeController) {
        controller.setAuthorityContext({ projectId: null, sourceId: "source-b" });
      },
    },
    {
      label: "revision",
      reason: "revision",
      dispose: false,
      invalidate(
        controller: HotspotRuntimeController,
        source: SceneDocument,
        runtimeGeneration: RuntimeGeneration,
      ) {
        controller.sync({ ...source, revision: source.revision + 1 }, runtimeGeneration);
      },
    },
    {
      label: "project",
      reason: "project",
      dispose: false,
      invalidate(controller: HotspotRuntimeController) {
        controller.setAuthorityContext({ projectId: "project-b", sourceId: null });
      },
    },
    {
      label: "WebGL context",
      reason: "context",
      dispose: false,
      invalidate(controller: HotspotRuntimeController) {
        controller.invalidateContext();
      },
    },
    {
      label: "dispose",
      reason: "dispose",
      dispose: true,
      invalidate(controller: HotspotRuntimeController) {
        controller.dispose();
      },
    },
  ] as const)(
    "cleans accepted title-pending draft on $label without mutation or late callbacks",
    ({ reason, dispose, invalidate }) => {
      const callbacks: FrameRequestCallback[] = [];
      const canceledHandles: number[] = [];
      let nextHandle = 1;
      const requestFrame = vi
        .spyOn(globalThis, "requestAnimationFrame")
        .mockImplementation((callback) => {
          callbacks.push(callback);
          return nextHandle++;
        });
      const cancelFrame = vi
        .spyOn(globalThis, "cancelAnimationFrame")
        .mockImplementation((handle) => {
          canceledHandles.push(handle);
        });
      try {
        const harness = createHarness("edit");
        const fixture = placementGeneration({ foreground: "supported" });
        fixture.object.visible = false;
        const source = placementDocument();
        const bytes = JSON.stringify(source);
        harness.controller.sync(source, fixture.generation);
        const session = harness.controller.startPlacement();

        dispatchPointerUp(harness.surface, 400, 300);

        expect(harness.authoringEvents).toContainEqual(
          expect.objectContaining({ type: "hotspot-placement-accept", session }),
        );
        expect(harness.options.scene.getObjectByName("web3d-hotspot-overlay")).toMatchObject({
          count: 1,
        });
        expect(harness.container.querySelector(".web3d-hotspot-reticle")).toMatchObject({
          hidden: true,
        });
        const eventsBeforeInvalidation = harness.authoringEvents.length;

        invalidate(harness.controller, source, fixture.generation);

        expect(harness.authoringEvents.slice(eventsBeforeInvalidation)).toEqual([
          {
            type: "hotspot-session-cancel",
            session,
            reason,
            requiresAcknowledgment: true,
          },
        ]);
        expect(JSON.stringify(source)).toBe(bytes);
        expect(canceledHandles.length).toBeGreaterThan(0);
        if (dispose) {
          expect(harness.options.scene.getObjectByName("web3d-hotspot-overlay")).toBeUndefined();
          expect(harness.container.querySelector(".web3d-hotspot-reticle")).toBeNull();
        } else {
          expect(harness.options.scene.getObjectByName("web3d-hotspot-overlay")).toMatchObject({
            count: 0,
          });
          expect(harness.container.querySelector(".web3d-hotspot-reticle")).toMatchObject({
            hidden: true,
          });
          expect(harness.controller.finishDraft(session.sessionId)).toBe(false);
          expect(harness.controller.acknowledgeCancellation(session.sessionId + 1)).toBe(false);
          expect(harness.controller.acknowledgeCancellation(session.sessionId)).toBe(true);
        }

        const eventCountAfterCancellation = harness.authoringEvents.length;
        for (const callback of [...callbacks]) callback(1_000);
        expect(harness.authoringEvents).toHaveLength(eventCountAfterCancellation);
        expect(JSON.stringify(source)).toBe(bytes);
        if (!dispose) {
          expect(harness.options.scene.getObjectByName("web3d-hotspot-overlay")).toMatchObject({
            count: 0,
          });
          expect(harness.container.querySelector(".web3d-hotspot-reticle")).toMatchObject({
            hidden: true,
          });
          harness.controller.dispose();
        }
      } finally {
        requestFrame.mockRestore();
        cancelFrame.mockRestore();
      }
    },
  );

  it("updates 200 stable marker frames with one projection pass and no DOM reconcile", () => {
    const harness = createHarness("run");
    const fixture = manyMarkerGeneration(200);
    const source = manyMarkerDocument(200);
    const setMarkers = vi.spyOn(HotspotOverlay.prototype, "setMarkers");
    const updateFrames = vi.spyOn(HotspotOverlay.prototype, "updateMarkerFrames");
    const updateNow = vi.spyOn(HotspotOverlay.prototype, "updateNow");
    harness.controller.sync(source, fixture.generation);
    const layer = harness.container.querySelector<HTMLElement>(".web3d-hotspot-overlay")!;
    const insertBefore = vi.spyOn(layer, "insertBefore");
    setMarkers.mockClear();
    updateFrames.mockClear();
    updateNow.mockClear();

    fixture.nodes[0]!.position.x = 0.25;
    harness.controller.render();
    harness.controller.render();

    expect(setMarkers).not.toHaveBeenCalled();
    expect(updateFrames).toHaveBeenCalledTimes(2);
    expect(updateNow).toHaveBeenCalledTimes(2);
    expect(insertBefore).not.toHaveBeenCalled();
    const firstFrame = updateFrames.mock.calls[0]?.[0].find(
      (marker) => marker.id === "hotspot-000",
    );
    expect(firstFrame?.worldPosition[0]).toBeCloseTo(0.25);
    harness.controller.dispose();
  });
});

function createHarness(mode: "edit" | "run") {
  const scene = new Scene();
  const camera = new PerspectiveCamera(45, 4 / 3, 0.01, 100);
  camera.position.set(0, 0, 5);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  const container = document.createElement("div");
  Object.defineProperties(container, {
    clientWidth: { value: 800 },
    clientHeight: { value: 600 },
  });
  container.getBoundingClientRect = () => rect(800, 600);
  const surface = document.createElement("canvas");
  surface.getBoundingClientRect = () => rect(800, 600);
  container.append(surface);
  document.body.append(container);
  const viewerEvents: ViewerEvent[] = [];
  const authoringEvents: Array<Exclude<AuthoringViewerEvent, ViewerEvent>> = [];
  const diagnostics: Parameters<HotspotRuntimeControllerOptionsLike["recordDiagnostic"]>[0][] = [];
  const options = {
    scene,
    camera,
    container,
    surface,
    initialMode: mode,
    reducedMotion: true,
    emitViewer: (event: ViewerEvent) => viewerEvents.push(event),
    emitAuthoring: (event: Exclude<AuthoringViewerEvent, ViewerEvent>) =>
      authoringEvents.push(event),
    recordDiagnostic: (
      value: Parameters<HotspotRuntimeControllerOptionsLike["recordDiagnostic"]>[0],
    ) => diagnostics.push(value),
    focusPoint: vi.fn(() => Promise.resolve()),
    focusTarget: vi.fn(() => Promise.resolve()),
    requestRender: vi.fn(),
  };
  return {
    options,
    controller: new HotspotRuntimeController(options),
    container,
    surface,
    viewerEvents,
    authoringEvents,
    diagnostics,
  };
}

type HotspotRuntimeControllerOptionsLike = ConstructorParameters<
  typeof HotspotRuntimeController
>[0];

function generation(): RuntimeGeneration {
  return generationFixture().generation;
}

function generationFixture() {
  const node = new Mesh(new BoxGeometry());
  const root = new Group();
  const ancestor = new Group();
  ancestor.add(node);
  root.add(ancestor);
  const surfaces = new HotspotSurfaceIndex([
    {
      entityId: "asset-entity",
      assetHash: "a".repeat(64),
      nodesByIndex: new Map([[7, node]]),
      nodeIndexByHitObject: new Map([[node, 7]]),
    },
  ]);
  const generation: RuntimeGeneration = {
    root,
    entities: new Map([
      [
        "asset-entity",
        {
          entity: assetEntity("asset-entity", "asset-a"),
          object: ancestor,
        },
      ],
    ]),
    targets: new Map(),
    diagnostics: [],
    hotspotSurfaces: surfaces,
    authoredLights: {
      stage: vi.fn(() => ({ commit: vi.fn(), dispose: vi.fn() })),
      setAuthoringMode: vi.fn(),
      setPreview: vi.fn(() => true),
      clearPreview: vi.fn(),
      entityForObject: vi.fn(),
      dispose: vi.fn(),
    },
    entityForObject: vi.fn((object) =>
      object === node || object === ancestor ? "asset-entity" : undefined,
    ),
    targetForObject: vi.fn(),
    dispose: vi.fn(),
  };
  return { generation, node, ancestor };
}

type PlacementForeground = "supported" | "morph" | "unassociated" | "light-and-runtime-helpers";

function placementGeneration(options: { readonly foreground: PlacementForeground }) {
  const root = new Group();
  const rear = new Mesh(new BoxGeometry(1, 1, 0.2));
  rear.position.z = 0;
  const rearAncestor = new Group();
  rearAncestor.add(rear);
  root.add(rearAncestor);

  const foregroundAncestor = new Group();
  const foreground = new Mesh(new BoxGeometry(1, 1, 0.2));
  foreground.position.z = 1;
  foregroundAncestor.add(foreground);
  root.add(foregroundAncestor);

  const registrations = [
    {
      entityId: "rear-entity",
      assetHash: "b".repeat(64),
      nodesByIndex: new Map([[2, rear]]),
      nodeIndexByHitObject: new Map([[rear, 2]]),
    },
  ];
  if (options.foreground === "supported" || options.foreground === "morph") {
    if (options.foreground === "morph") {
      const position = foreground.geometry.getAttribute("position");
      const morph = new BufferAttribute(new Float32Array(position.count * 3), 3);
      foreground.geometry.morphAttributes.position = [morph];
    }
    registrations.push({
      entityId: "front-entity",
      assetHash: "c".repeat(64),
      nodesByIndex: new Map([[1, foreground]]),
      nodeIndexByHitObject: new Map([[foreground, 1]]),
    });
  }

  const runtimeHelper = new Mesh(new BoxGeometry(1, 1, 0.2));
  const lightHelper = new Mesh(new BoxGeometry(1, 1, 0.2));
  if (options.foreground === "light-and-runtime-helpers") {
    foregroundAncestor.removeFromParent();
    runtimeHelper.position.z = 2;
    lightHelper.position.z = 1.5;
    root.add(runtimeHelper, lightHelper);
  }

  const entities = [assetEntity("rear-entity", "rear-asset")];
  if (options.foreground !== "light-and-runtime-helpers") {
    entities.push(assetEntity("front-entity", "front-asset"));
  }
  const documentEntities =
    options.foreground === "light-and-runtime-helpers"
      ? [...entities, lightEntity("light-entity")]
      : entities;
  const generation: RuntimeGeneration = {
    ...emptyGeneration(),
    root,
    entities: new Map(
      documentEntities.map((entity) => [
        entity.id,
        {
          entity,
          object: entity.id === "rear-entity" ? rearAncestor : foregroundAncestor,
        },
      ]),
    ),
    hotspotSurfaces: new HotspotSurfaceIndex(registrations),
    entityForObject: vi.fn((object) => {
      if (object === rear || object === rearAncestor) return "rear-entity";
      if (object === lightHelper) return "light-entity";
      if (object === runtimeHelper) return undefined;
      return object === foreground || object === foregroundAncestor ? "front-entity" : undefined;
    }),
  };
  return { generation, object: foreground, ancestor: foregroundAncestor };
}

function emptyGeneration(): RuntimeGeneration {
  return {
    root: new Group(),
    entities: new Map(),
    targets: new Map(),
    diagnostics: [],
    hotspotSurfaces: new HotspotSurfaceIndex(),
    authoredLights: {
      stage: vi.fn(() => ({ commit: vi.fn(), dispose: vi.fn() })),
      setAuthoringMode: vi.fn(),
      setPreview: vi.fn(() => true),
      clearPreview: vi.fn(),
      entityForObject: vi.fn(),
      dispose: vi.fn(),
    },
    entityForObject: vi.fn(),
    targetForObject: vi.fn(),
    dispose: vi.fn(),
  };
}

function placementDocument(): SceneDocument {
  const source = sceneDocument();
  return {
    ...source,
    assets: [sceneAsset("rear-asset"), sceneAsset("front-asset")],
    entities: [
      assetEntity("rear-entity", "rear-asset"),
      assetEntity("front-entity", "front-asset"),
      lightEntity("light-entity"),
    ],
    annotations: [],
  };
}

function sceneAsset(id: string): SceneDocument["assets"][number] {
  return {
    id,
    name: id,
    uri: `/${id}.glb`,
    mediaType: "model/gltf-binary",
    sha256:
      id === "rear-asset" ? "b".repeat(64) : id === "front-asset" ? "c".repeat(64) : "a".repeat(64),
    byteLength: 1,
  };
}

function assetEntity(
  id: string,
  assetId: string,
): Extract<SceneDocument["entities"][number], { type: "asset" }> {
  return {
    id,
    type: "asset",
    assetId,
    parentId: null,
    name: id,
    visible: true,
    locked: false,
    transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
    metadata: {},
  };
}

function lightEntity(id: string): Extract<SceneDocument["entities"][number], { type: "light" }> {
  return {
    id,
    type: "light",
    parentId: null,
    name: id,
    visible: true,
    locked: false,
    transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
    metadata: {},
    light: { kind: "point", color: "#FFFFFF", intensity: 1, range: null },
  };
}

function dispatchPointerUp(surface: HTMLElement, clientX: number, clientY: number): void {
  const event = new Event("pointerup") as PointerEvent;
  Object.assign(event, { button: 0, clientX, clientY });
  surface.dispatchEvent(event);
}

function hotspotProxy(container: HTMLElement, id: string): HTMLButtonElement {
  const button = container.querySelector<HTMLButtonElement>(`[data-hotspot-id="${id}"]`);
  if (button === null) throw new Error(`Missing hotspot proxy ${id}.`);
  return button;
}

function installPointerCapture(element: HTMLElement) {
  const captured = new Set<number>();
  const set = vi.fn((pointerId: number) => captured.add(pointerId));
  const release = vi.fn((pointerId: number) => captured.delete(pointerId));
  Object.assign(element, {
    setPointerCapture: set,
    releasePointerCapture: release,
    hasPointerCapture: (pointerId: number) => captured.has(pointerId),
  });
  return { set, release };
}

function pointerEvent(
  type: "pointerdown" | "pointermove" | "pointerup",
  clientX: number,
  clientY: number,
  pointerId: number,
): PointerEvent {
  const event = new Event(type, { bubbles: true, cancelable: true }) as PointerEvent;
  Object.assign(event, { button: 0, clientX, clientY, isPrimary: true, pointerId });
  return event;
}

function manyMarkerGeneration(count: number) {
  const root = new Group();
  const nodes = Array.from({ length: count }, (_, index) => {
    const node = new Mesh(new BoxGeometry(0.1, 0.1, 0.1));
    node.position.x = index * 0.002;
    root.add(node);
    return node;
  });
  const registration = nodes.map((node, index) => ({
    entityId: `entity-${String(index).padStart(3, "0")}`,
    assetHash: "d".repeat(64),
    nodesByIndex: new Map([[index, node]]),
    nodeIndexByHitObject: new Map([[node, index]]),
  }));
  const generation: RuntimeGeneration = {
    ...emptyGeneration(),
    root,
    hotspotSurfaces: new HotspotSurfaceIndex(registration),
  };
  return { generation, nodes };
}

function manyMarkerDocument(count: number): SceneDocument {
  const source = sceneDocument();
  return {
    ...source,
    assets: [sceneAsset("many-asset")],
    entities: Array.from({ length: count }, (_, index) =>
      assetEntity(`entity-${String(index).padStart(3, "0")}`, "many-asset"),
    ),
    annotations: Array.from({ length: count }, (_, index) => ({
      ...source.annotations[0]!,
      id: `hotspot-${String(index).padStart(3, "0")}`,
      title: `Hotspot ${String(index).padStart(3, "0")}`,
      anchor: {
        kind: "surface" as const,
        entityId: `entity-${String(index).padStart(3, "0")}`,
        assetHash: "d".repeat(64),
        nodeIndex: index,
        nodeLocalPosition: [0, 0, 0] as const,
        nodeLocalNormal: [0, 0, 1] as const,
      },
    })),
  };
}

function sceneDocument(overrides: { readonly assetHash?: string } = {}): SceneDocument {
  return {
    schemaVersion: "1.4.0",
    id: "scene-a",
    name: "Scene",
    revision: 1,
    assets: [sceneAsset("asset-a")],
    entities: [assetEntity("asset-entity", "asset-a")],
    targets: [],
    dataSources: [],
    bindings: [],
    ruleSets: [],
    annotations: [
      {
        id: "hotspot-a",
        title: "Pump",
        visible: true,
        locked: false,
        anchor: {
          kind: "surface",
          entityId: "asset-entity",
          assetHash: overrides.assetHash ?? "a".repeat(64),
          nodeIndex: 7,
          nodeLocalPosition: [0, 0, 0],
          nodeLocalNormal: [0, 0, 1],
        },
        content: { kind: "plain-text", text: "Read only" },
        action: { type: "show-content" },
      },
    ],
    views: [],
    environment: {
      backgroundMode: "theme",
      background: "#FFFFFF",
      grid: false,
      unit: "m",
      upAxis: "Y",
      lighting: {
        fill: { skyColor: "#FFFFFF", groundColor: "#65706A", intensity: 1 },
        key: { color: "#FFFFFF", intensity: 1, directionToLight: [0, 1, 0] },
      },
    },
  };
}

function visibleSceneDocument(): SceneDocument {
  const source = sceneDocument();
  const annotation = source.annotations[0]!;
  if (annotation.anchor.kind !== "surface") throw new Error("Expected a surface hotspot.");
  return {
    ...source,
    annotations: [
      {
        ...annotation,
        anchor: { ...annotation.anchor, nodeLocalPosition: [0, 0, 0.5] },
      },
    ],
  };
}

function rect(width: number, height: number): DOMRect {
  return {
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: width,
    bottom: height,
    width,
    height,
    toJSON: () => ({}),
  };
}
