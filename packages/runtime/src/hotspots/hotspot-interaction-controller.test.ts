import { describe, expect, it, vi } from "vitest";

import {
  HotspotInteractionController,
  type HotspotAuthority,
  type HotspotSessionEvidence,
} from "./hotspot-interaction-controller";

describe("HotspotInteractionController", () => {
  it("raycasts at most once per frame and only during an active session", () => {
    const harness = createHarness();
    dispatchPointer(harness.surface, "pointermove", 4, 5);
    expect(harness.hitTest).not.toHaveBeenCalled();

    const session = harness.controller.startPlacement();
    dispatchPointer(harness.surface, "pointermove", 10, 20);
    dispatchPointer(harness.surface, "pointermove", 30, 40);
    expect(harness.frames).toHaveLength(1);
    harness.flushFrame();

    expect(harness.hitTest).toHaveBeenCalledOnce();
    expect(harness.hitTest).toHaveBeenCalledWith({ clientX: 30, clientY: 40 });
    expect(harness.onPreview).toHaveBeenCalledWith(session, {
      status: "valid",
      hit: { key: "30:40" },
    });
    harness.controller.dispose();
  });

  it("accepts only the current valid hit and cannot mutate a document", () => {
    const harness = createHarness();
    const session = harness.controller.startPlacement();
    harness.controller.updateReticle({ clientX: 1, clientY: 2 });
    expect(harness.controller.acceptReticle()).toBe(false);
    harness.flushFrame();
    expect(harness.controller.acceptReticle()).toBe(true);
    expect(harness.onAccept).toHaveBeenCalledWith(session, { key: "1:2" });
    expect(harness.controller.activeSession).toBeNull();
    harness.controller.dispose();
  });

  it("never accepts an older hit while a newer pointer sample is queued", () => {
    const harness = createHarness();
    const session = harness.controller.startPlacement();
    harness.controller.updateReticle({ clientX: 1, clientY: 2 });
    harness.flushFrame();
    harness.controller.updateReticle({ clientX: 30, clientY: 40 });

    dispatchPointer(harness.surface, "pointerup", 50, 60);

    expect(harness.cancelFrame).toHaveBeenCalledOnce();
    expect(harness.hitTest).toHaveBeenLastCalledWith({ clientX: 50, clientY: 60 });
    expect(harness.onAccept).toHaveBeenCalledWith(session, { key: "50:60" });
    expect(harness.onAccept).not.toHaveBeenCalledWith(session, { key: "1:2" });
    harness.frames[0]?.(0);
    expect(harness.onAccept).toHaveBeenCalledOnce();
    harness.controller.dispose();
  });

  it("owns placement pointerup so a viewport pick listener cannot also run", () => {
    const harness = createHarness();
    const viewportPick = vi.fn();
    harness.surface.addEventListener("pointerup", viewportPick);
    harness.controller.startPlacement();

    dispatchPointer(harness.surface, "pointerup", 50, 60);

    expect(harness.onAccept).toHaveBeenCalledOnce();
    expect(viewportPick).not.toHaveBeenCalled();
    harness.controller.dispose();
  });

  it("rejects keyboard acceptance while a newer reticle sample is queued", () => {
    const harness = createHarness();
    const session = harness.controller.startPlacement();
    harness.controller.updateReticle({ clientX: 1, clientY: 2 });
    harness.flushFrame();
    harness.controller.updateReticle({ clientX: 30, clientY: 40 });

    expect(harness.controller.acceptReticle()).toBe(false);
    expect(harness.onAccept).not.toHaveBeenCalled();
    harness.flushFrame();
    expect(harness.controller.acceptReticle()).toBe(true);
    expect(harness.onAccept).toHaveBeenCalledWith(session, { key: "30:40" });
    harness.controller.dispose();
  });

  it("rejects pointer release when the current release sample is invalid", () => {
    const harness = createHarness({ invalidKey: "50:60" });
    harness.controller.startPlacement();
    harness.controller.updateReticle({ clientX: 1, clientY: 2 });
    harness.flushFrame();

    dispatchPointer(harness.surface, "pointerup", 50, 60);

    expect(harness.onAccept).not.toHaveBeenCalled();
    expect(harness.controller.activeSession).not.toBeNull();
    expect(harness.onPreview).toHaveBeenLastCalledWith(harness.controller.activeSession, {
      status: "rejected",
      reason: "no-surface",
    });
    harness.controller.dispose();
  });

  it("keeps the active session after a typed unsupported rejection", () => {
    const harness = createHarness({ unsupportedKey: "50:60" });
    const session = harness.controller.startPlacement();

    dispatchPointer(harness.surface, "pointerup", 50, 60);

    expect(harness.onPreview).toHaveBeenLastCalledWith(session, {
      status: "rejected",
      reason: "unsupported",
    });
    expect(harness.onAccept).not.toHaveBeenCalled();
    expect(harness.controller.activeSession).toBe(session);
    harness.controller.dispose();
  });

  it.each([
    ["mode", { mode: "run" }],
    ["source", { sourceId: "source-b" }],
    ["revision", { documentRevision: 2 }],
    ["project", { projectId: "project-b" }],
    ["context", { contextId: "context-b" }],
  ] as const)(
    "synchronously invalidates on %s change and waits for matching acknowledgment",
    (reason, change) => {
      const harness = createHarness();
      const session = harness.controller.startReposition("annotation-a");
      harness.controller.updateReticle({ clientX: 1, clientY: 2 });

      harness.controller.setAuthority({ ...authority(), ...change });

      expect(harness.controller.activeSession).toBeNull();
      expect(harness.controller.interactive).toBe(false);
      expect(harness.cancelFrame).toHaveBeenCalledOnce();
      expect(harness.onCancel).toHaveBeenCalledWith(session, reason, true);
      expect(harness.controller.acknowledgeCancellation(session.sessionId + 1)).toBe(false);
      expect(harness.controller.acknowledgeCancellation(session.sessionId)).toBe(true);
      expect(harness.controller.interactive).toBe("mode" in change ? false : true);
      harness.controller.dispose();
    },
  );

  it("ignores stale animation callbacks after cancellation and new session allocation", () => {
    const harness = createHarness();
    const first = harness.controller.startPlacement();
    harness.controller.updateReticle({ clientX: 1, clientY: 1 });
    const staleFrame = harness.frames[0];
    harness.controller.cancel();
    const second = harness.controller.startPlacement();

    staleFrame?.(0);
    expect(harness.hitTest).not.toHaveBeenCalled();
    expect(second.sessionId).toBeGreaterThan(first.sessionId);
    expect(harness.controller.acknowledgeCancellation(first.sessionId)).toBe(false);
    harness.controller.dispose();
  });

  it("removes listeners and queued work idempotently on dispose", () => {
    const harness = createHarness();
    harness.controller.startPlacement();
    dispatchPointer(harness.surface, "pointermove", 2, 3);
    harness.controller.dispose();
    harness.controller.dispose();
    dispatchPointer(harness.surface, "pointermove", 4, 5);

    expect(harness.cancelFrame).toHaveBeenCalledOnce();
    expect(harness.onCancel).toHaveBeenCalledOnce();
    expect(harness.onCancel.mock.calls[0]?.[1]).toBe("dispose");
    harness.frames[0]?.(0);
    expect(harness.hitTest).not.toHaveBeenCalled();
  });

  it("invalidates browser context loss before any late preview", () => {
    const harness = createHarness();
    const session = harness.controller.startPlacement();
    harness.controller.updateReticle({ clientX: 1, clientY: 2 });
    harness.surface.dispatchEvent(new Event("pointercancel"));

    expect(harness.onCancel).toHaveBeenCalledWith(session, "context", true);
    harness.flushFrame();
    expect(harness.hitTest).not.toHaveBeenCalled();
    harness.controller.dispose();
  });
});

function createHarness(
  options: { readonly invalidKey?: string; readonly unsupportedKey?: string } = {},
) {
  const surface = new EventTarget() as HTMLElement;
  const frames: FrameRequestCallback[] = [];
  const hitTest = vi.fn(({ clientX, clientY }) => {
    const key = `${clientX}:${clientY}`;
    if (key === options.invalidKey)
      return { status: "rejected" as const, reason: "no-surface" as const };
    if (key === options.unsupportedKey) {
      return { status: "rejected" as const, reason: "unsupported" as const };
    }
    return { status: "valid" as const, hit: { key } };
  });
  const onPreview = vi.fn();
  const onAccept = vi.fn<(session: HotspotSessionEvidence, hit: { key: string }) => void>();
  const onCancel = vi.fn();
  const cancelFrame = vi.fn();
  const controller = new HotspotInteractionController(authority(), {
    surface,
    hitTest,
    onPreview,
    onAccept,
    onCancel,
    requestFrame(callback) {
      frames.push(callback);
      return frames.length;
    },
    cancelFrame,
  });
  return {
    surface,
    frames,
    hitTest,
    onPreview,
    onAccept,
    onCancel,
    cancelFrame,
    controller,
    flushFrame() {
      frames.shift()?.(0);
    },
  };
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

function dispatchPointer(
  surface: HTMLElement,
  type: "pointermove" | "pointerup",
  clientX: number,
  clientY: number,
): void {
  const event = new Event(type) as PointerEvent;
  Object.assign(event, { clientX, clientY, button: 0 });
  surface.dispatchEvent(event);
}
