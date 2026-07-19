// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  HotspotInteractionController,
  type HotspotAuthority,
  type HotspotSessionEvidence,
} from "./hotspot-interaction-controller";

describe("Hotspot direct and keyboard interaction", () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows a centered reticle and moves it by 8 or 32 CSS pixels before Enter accepts", () => {
    const harness = createHarness();
    const session = harness.controller.startPlacement();
    expect(document.activeElement).toBe(harness.surface);
    expect(harness.onReticleChange).toHaveBeenLastCalledWith({
      clientX: 60,
      clientY: 60,
      status: "pending",
    });
    harness.flushFrame();

    dispatchKey(harness.surface, "ArrowRight");
    harness.flushFrame();
    expect(harness.hitTest).toHaveBeenLastCalledWith({ clientX: 68, clientY: 60 });
    dispatchKey(harness.surface, "ArrowDown", true);
    harness.flushFrame();
    expect(harness.hitTest).toHaveBeenLastCalledWith({ clientX: 68, clientY: 92 });

    dispatchKey(harness.surface, "Enter");
    expect(harness.onAccept).toHaveBeenCalledWith(session, { key: "68:92" });
    expect(harness.controller.activeSession).toBeNull();
    expect(harness.onReticleChange).toHaveBeenLastCalledWith(null);
    harness.controller.dispose();
  });

  it.each(["valid", "rejected"] as const)(
    "owns %s placement release before viewport picking and emits no double event",
    (result) => {
      const harness = createHarness(
        result === "rejected" ? { rejectKey: "40:45", rejection: "no-surface" } : {},
      );
      const viewportPick = vi.fn();
      harness.surface.addEventListener("pointerup", viewportPick);
      const session = harness.controller.startPlacement();

      harness.surface.dispatchEvent(pointerEvent("pointerup", 40, 45, 31));

      expect(viewportPick).not.toHaveBeenCalled();
      if (result === "valid") {
        expect(harness.onAccept).toHaveBeenCalledWith(session, { key: "40:45" });
        expect(harness.onAccept).toHaveBeenCalledOnce();
      } else {
        expect(harness.onPreview).toHaveBeenCalledWith(session, {
          status: "rejected",
          reason: "no-surface",
        });
        expect(harness.onAccept).not.toHaveBeenCalled();
      }
      harness.controller.dispose();
    },
  );

  it.each([
    ["mode", { mode: "run" }],
    ["source", { sourceId: "source-b" }],
    ["revision", { documentRevision: 2 }],
    ["project", { projectId: "project-b" }],
    ["context", { contextId: "context-b" }],
  ] as const)(
    "retains accepted placement evidence for %s cancellation and matching acknowledgment",
    (reason, change) => {
      const harness = createHarness();
      const session = harness.controller.startPlacement();
      harness.surface.dispatchEvent(pointerEvent("pointerup", 40, 45, 32));
      expect(harness.controller.activeSession).toBeNull();
      expect(harness.onAccept).toHaveBeenCalledWith(session, { key: "40:45" });

      harness.controller.setAuthority({ ...authority(), ...change });

      expect(harness.onCancel).toHaveBeenCalledWith(session, reason, true);
      expect(harness.controller.interactive).toBe(false);
      expect(harness.controller.acknowledgeCancellation(session.sessionId + 1)).toBe(false);
      expect(harness.controller.acknowledgeCancellation(session.sessionId)).toBe(true);
      expect(harness.controller.interactive).toBe(reason === "mode" ? false : true);
      harness.controller.dispose();
    },
  );

  it("retains accepted placement evidence until exact finish and cancels it on dispose", () => {
    const harness = createHarness();
    const session = harness.controller.startPlacement();
    harness.surface.dispatchEvent(pointerEvent("pointerup", 40, 45, 33));
    expect(harness.controller.finishAcceptedDraft(session.sessionId + 1)).toBe(false);
    expect(harness.controller.finishAcceptedDraft(session.sessionId)).toBe(true);
    expect(harness.onCancel).not.toHaveBeenCalled();

    const disposeHarness = createHarness();
    const disposeSession = disposeHarness.controller.startPlacement();
    disposeHarness.surface.dispatchEvent(pointerEvent("pointerup", 40, 45, 34));
    disposeHarness.controller.dispose();
    expect(disposeHarness.onCancel).toHaveBeenCalledWith(disposeSession, "dispose", true);
    expect(disposeHarness.onReticleChange).toHaveBeenLastCalledWith(null);
  });

  it("keeps accepted draft evidence across ordinary Canvas focus loss", () => {
    const harness = createHarness();
    const session = harness.controller.startPlacement();
    harness.surface.dispatchEvent(pointerEvent("pointerup", 40, 45, 35));
    const input = document.createElement("input");
    document.body.append(input);
    input.focus();

    expect(harness.onCancel).not.toHaveBeenCalled();
    expect(harness.controller.finishAcceptedDraft(session.sessionId)).toBe(true);
    harness.controller.dispose();
  });

  it("clamps keyboard reticle movement and Escape cancels without acceptance", () => {
    const harness = createHarness();
    const session = harness.controller.startReposition("hotspot-a", {
      clientX: 109,
      clientY: 99,
    });
    dispatchKey(harness.surface, "ArrowRight", true);
    dispatchKey(harness.surface, "ArrowDown", true);
    harness.flushFrame();
    expect(harness.hitTest).toHaveBeenLastCalledWith({ clientX: 110, clientY: 100 });

    dispatchKey(harness.surface, "Escape");
    expect(harness.onAccept).not.toHaveBeenCalled();
    expect(harness.onCancel).toHaveBeenCalledWith(session, "cancel", false);
    expect(harness.onReticleChange).toHaveBeenLastCalledWith(null);
    harness.controller.dispose();
  });

  it("keeps motion below the Euclidean 4 CSS pixel threshold as a normal click", () => {
    const harness = createHarness();
    const capture = captureTarget();
    expect(
      harness.controller.beginDirectReposition({
        annotationId: "hotspot-a",
        captureTarget: capture.element,
        event: pointerEvent("pointerdown", 20, 20, 7),
      }),
    ).toBe(true);

    capture.element.dispatchEvent(pointerEvent("pointermove", 22, 23, 7));
    capture.element.dispatchEvent(pointerEvent("pointerup", 22, 23, 7));

    expect(harness.controller.activeSession).toBeNull();
    expect(harness.hitTest).not.toHaveBeenCalled();
    expect(harness.onDirectDragStart).not.toHaveBeenCalled();
    expect(harness.onAccept).not.toHaveBeenCalled();
    expect(harness.onCancel).not.toHaveBeenCalled();
    expect(capture.release).toHaveBeenCalledWith(7);
    harness.controller.dispose();
  });

  it("starts at the Euclidean threshold and accepts one current valid release", () => {
    const harness = createHarness();
    const capture = captureTarget();
    harness.controller.beginDirectReposition({
      annotationId: "hotspot-a",
      captureTarget: capture.element,
      event: pointerEvent("pointerdown", 20, 20, 8),
    });

    capture.element.dispatchEvent(pointerEvent("pointermove", 24, 20, 8));
    const session = harness.controller.activeSession;
    expect(session).toMatchObject({ kind: "reposition", annotationId: "hotspot-a" });
    expect(harness.onDirectDragStart).toHaveBeenCalledWith(session);
    capture.element.dispatchEvent(pointerEvent("pointerup", 40, 45, 8));

    expect(harness.hitTest).toHaveBeenLastCalledWith({ clientX: 40, clientY: 45 });
    expect(harness.onAccept).toHaveBeenCalledWith(session, { key: "40:45" });
    expect(harness.onAccept).toHaveBeenCalledOnce();
    expect(harness.onCancel).not.toHaveBeenCalled();
    expect(harness.onDirectDragEnd).toHaveBeenCalledWith(session);
    expect(capture.release).toHaveBeenCalledWith(8);
    harness.flushFrame();
    expect(harness.onAccept).toHaveBeenCalledOnce();
    harness.controller.dispose();
  });

  it.each(["no-surface", "unsupported"] as const)(
    "cancels and restores after an invalid direct release with %s",
    (rejection) => {
      const harness = createHarness({ rejectKey: "40:45", rejection });
      const capture = captureTarget();
      harness.controller.beginDirectReposition({
        annotationId: "hotspot-a",
        captureTarget: capture.element,
        event: pointerEvent("pointerdown", 20, 20, 9),
      });
      capture.element.dispatchEvent(pointerEvent("pointermove", 24, 20, 9));
      const session = harness.controller.activeSession!;

      capture.element.dispatchEvent(pointerEvent("pointerup", 40, 45, 9));

      expect(harness.onPreview).toHaveBeenCalledWith(session, {
        status: "rejected",
        reason: rejection,
      });
      expect(harness.onAccept).not.toHaveBeenCalled();
      expect(harness.onCancel).toHaveBeenCalledWith(session, "cancel", false, rejection);
      expect(harness.onDirectDragEnd).toHaveBeenCalledWith(session);
      expect(harness.controller.activeSession).toBeNull();
      expect(capture.release).toHaveBeenCalledWith(9);
      harness.controller.dispose();
    },
  );

  it("keeps direct Escape cancellation generic while releasing transient resources", () => {
    const harness = createHarness();
    const capture = captureTarget();
    harness.controller.beginDirectReposition({
      annotationId: "hotspot-a",
      captureTarget: capture.element,
      event: pointerEvent("pointerdown", 20, 20, 12),
    });
    capture.element.dispatchEvent(pointerEvent("pointermove", 24, 20, 12));
    const session = harness.controller.activeSession!;

    capture.element.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));

    expect(harness.onCancel).toHaveBeenCalledWith(session, "cancel", false);
    expect(harness.onCancel.mock.calls[0]).toHaveLength(3);
    expect(harness.onAccept).not.toHaveBeenCalled();
    expect(harness.controller.activeSession).toBeNull();
    expect(capture.release).toHaveBeenCalledWith(12);
    expect(harness.onReticleChange).toHaveBeenLastCalledWith(null);
    harness.controller.dispose();
  });

  it("releases capture, listeners, RAF and reticle on authority loss", () => {
    const harness = createHarness();
    const capture = captureTarget();
    harness.controller.beginDirectReposition({
      annotationId: "hotspot-a",
      captureTarget: capture.element,
      event: pointerEvent("pointerdown", 20, 20, 10),
    });
    capture.element.dispatchEvent(pointerEvent("pointermove", 24, 20, 10));
    const session = harness.controller.activeSession!;
    expect(harness.pendingFrames).toBe(1);

    harness.controller.setAuthority({ ...authority(), documentRevision: 2 });

    expect(harness.onCancel).toHaveBeenCalledWith(session, "revision", true);
    expect(harness.cancelFrame).toHaveBeenCalledOnce();
    expect(harness.onReticleChange).toHaveBeenLastCalledWith(null);
    expect(capture.release).toHaveBeenCalledWith(10);
    capture.element.dispatchEvent(pointerEvent("pointermove", 50, 50, 10));
    harness.flushFrame();
    expect(harness.hitTest).not.toHaveBeenCalled();
    harness.controller.dispose();
  });

  it("cancels direct drag on pointer cancellation, browser blur, and dispose", () => {
    for (const reason of ["pointercancel", "blur", "dispose"] as const) {
      const harness = createHarness();
      const capture = captureTarget();
      harness.controller.beginDirectReposition({
        annotationId: "hotspot-a",
        captureTarget: capture.element,
        event: pointerEvent("pointerdown", 20, 20, 11),
      });
      capture.element.dispatchEvent(pointerEvent("pointermove", 24, 20, 11));
      if (reason === "pointercancel") {
        capture.element.dispatchEvent(pointerEvent("pointercancel", 24, 20, 11));
      } else if (reason === "blur") {
        window.dispatchEvent(new Event("blur"));
      } else {
        harness.controller.dispose();
      }
      expect(harness.controller.activeSession).toBeNull();
      expect(capture.release).toHaveBeenCalledWith(11);
      expect(harness.onReticleChange).toHaveBeenLastCalledWith(null);
      if (reason !== "dispose") harness.controller.dispose();
    }
  });

  it("uses invocation-safe native RAF wrappers while preserving injected callbacks", () => {
    const receiver = globalThis;
    const callbacks = new Map<number, FrameRequestCallback>();
    let nextHandle = 1;
    const request = vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation(function (
      this: typeof globalThis,
      callback,
    ) {
      if (this !== receiver) throw new TypeError("Illegal invocation");
      const handle = nextHandle++;
      callbacks.set(handle, callback);
      return handle;
    });
    const cancel = vi.spyOn(globalThis, "cancelAnimationFrame").mockImplementation(function (
      this: typeof globalThis,
      handle,
    ) {
      if (this !== receiver) throw new TypeError("Illegal invocation");
      callbacks.delete(handle);
    });
    const surface = surfaceElement();
    const native = new HotspotInteractionController(authority(), {
      surface,
      hitTest: () => ({ status: "valid", hit: "hit" }),
      onPreview: vi.fn(),
      onAccept: vi.fn(),
      onCancel: vi.fn(),
      onReticleChange: vi.fn(),
    });

    expect(() => native.startPlacement()).not.toThrow();
    expect(request).toHaveBeenCalledOnce();
    native.dispose();
    expect(cancel).toHaveBeenCalledOnce();

    const injected = createHarness();
    injected.controller.startPlacement();
    expect(injected.requestFrame).toHaveBeenCalledOnce();
    injected.controller.dispose();
    expect(injected.cancelFrame).toHaveBeenCalledOnce();
  });
});

function createHarness(
  options: {
    readonly rejectKey?: string;
    readonly rejection?: "no-surface" | "unsupported";
  } = {},
) {
  const surface = surfaceElement();
  const frames = new Map<number, FrameRequestCallback>();
  let nextFrame = 1;
  const requestFrame = vi.fn((callback: FrameRequestCallback) => {
    const handle = nextFrame++;
    frames.set(handle, callback);
    return handle;
  });
  const cancelFrame = vi.fn((handle: number) => frames.delete(handle));
  const hitTest = vi.fn(({ clientX, clientY }: { clientX: number; clientY: number }) => {
    const key = `${clientX}:${clientY}`;
    return key === options.rejectKey
      ? { status: "rejected" as const, reason: options.rejection ?? "no-surface" }
      : { status: "valid" as const, hit: { key } };
  });
  const onPreview = vi.fn();
  const onAccept = vi.fn<(session: HotspotSessionEvidence, hit: { key: string }) => void>();
  const onCancel = vi.fn();
  const onReticleChange = vi.fn();
  const onDirectDragStart = vi.fn();
  const onDirectDragEnd = vi.fn();
  const controller = new HotspotInteractionController(authority(), {
    surface,
    hitTest,
    onPreview,
    onAccept,
    onCancel,
    onReticleChange,
    onDirectDragStart,
    onDirectDragEnd,
    requestFrame,
    cancelFrame,
  });
  return {
    surface,
    controller,
    hitTest,
    onPreview,
    onAccept,
    onCancel,
    onReticleChange,
    onDirectDragStart,
    onDirectDragEnd,
    requestFrame,
    cancelFrame,
    get pendingFrames() {
      return frames.size;
    },
    flushFrame() {
      const entry = frames.entries().next().value as
        readonly [number, FrameRequestCallback] | undefined;
      if (entry === undefined) return;
      frames.delete(entry[0]);
      entry[1](0);
    },
  };
}

function surfaceElement(): HTMLCanvasElement {
  const container = document.createElement("div");
  const surface = document.createElement("canvas");
  surface.tabIndex = 0;
  surface.getBoundingClientRect = () => rect(10, 20, 100, 80);
  container.append(surface);
  document.body.append(container);
  return surface;
}

function captureTarget() {
  const element = document.createElement("button");
  const captured = new Set<number>();
  const set = vi.fn((pointerId: number) => captured.add(pointerId));
  const release = vi.fn((pointerId: number) => captured.delete(pointerId));
  Object.assign(element, {
    setPointerCapture: set,
    releasePointerCapture: release,
    hasPointerCapture: (pointerId: number) => captured.has(pointerId),
  });
  document.body.append(element);
  return { element, set, release };
}

function dispatchKey(surface: HTMLElement, key: string, shiftKey = false): void {
  surface.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key, shiftKey }));
}

function pointerEvent(
  type: "pointerdown" | "pointermove" | "pointerup" | "pointercancel",
  clientX: number,
  clientY: number,
  pointerId: number,
): PointerEvent {
  const event = new Event(type, { bubbles: true, cancelable: true }) as PointerEvent;
  Object.assign(event, { button: 0, clientX, clientY, isPrimary: true, pointerId });
  return event;
}

function authority(): HotspotAuthority {
  return {
    mode: "edit",
    documentId: "document-a",
    documentRevision: 1,
    projectId: "project-a",
    sourceId: "source-a",
    contextId: "context-a",
  };
}

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    bottom: top + height,
    height,
    left,
    right: left + width,
    top,
    width,
    x: left,
    y: top,
    toJSON: () => ({}),
  };
}
