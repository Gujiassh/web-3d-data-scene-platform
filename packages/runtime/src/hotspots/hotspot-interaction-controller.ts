export type HotspotSessionKind = "placement" | "reposition";

export type HotspotSessionCancellationReason =
  "cancel" | "mode" | "source" | "revision" | "project" | "context" | "dispose";

export interface HotspotAuthority {
  readonly mode: "edit" | "run";
  readonly documentId: string | null;
  readonly documentRevision: number | null;
  readonly projectId: string | null;
  readonly sourceId: string | null;
  readonly contextId: string | null;
}

export interface HotspotAuthorityContext {
  readonly projectId: string | null;
  readonly sourceId: string | null;
}

export interface HotspotSessionEvidence {
  readonly sessionId: number;
  readonly kind: HotspotSessionKind;
  readonly annotationId: string | null;
  readonly authority: HotspotAuthority;
}

export interface HotspotPointerSample {
  readonly clientX: number;
  readonly clientY: number;
}

export type HotspotPlacementRejectionReason = "unsupported" | "no-surface";

export type HotspotPlacementSampleResult<Hit> =
  | { readonly status: "valid"; readonly hit: Hit }
  | { readonly status: "rejected"; readonly reason: HotspotPlacementRejectionReason };

export type HotspotReticleState =
  | (HotspotPointerSample & { readonly status: "pending" | "valid" })
  | (HotspotPointerSample & {
      readonly status: "rejected";
      readonly reason: HotspotPlacementRejectionReason;
    });

export interface HotspotDirectPointerStart {
  readonly annotationId: string;
  readonly event: PointerEvent;
  readonly captureTarget: Element;
}

export interface HotspotInteractionControllerOptions<Hit> {
  readonly surface: HTMLElement;
  readonly hitTest: (sample: HotspotPointerSample) => HotspotPlacementSampleResult<Hit>;
  readonly onPreview: (
    session: HotspotSessionEvidence,
    result: HotspotPlacementSampleResult<Hit> | null,
  ) => void;
  readonly onAccept: (session: HotspotSessionEvidence, hit: Hit) => void;
  readonly onCancel: (
    session: HotspotSessionEvidence,
    reason: HotspotSessionCancellationReason,
    requiresAcknowledgment: boolean,
    rejectionReason?: HotspotPlacementRejectionReason,
  ) => void;
  readonly onReticleChange?: (state: HotspotReticleState | null) => void;
  readonly onDirectDragStart?: (session: HotspotSessionEvidence) => void;
  readonly onDirectDragEnd?: (session: HotspotSessionEvidence) => void;
  readonly requestFrame?: (callback: FrameRequestCallback) => number;
  readonly cancelFrame?: (handle: number) => void;
}

interface ActiveSession<Hit> {
  readonly evidence: HotspotSessionEvidence;
  readonly input: "surface" | "direct";
  phase: "sampling" | "accepted-draft";
  latestSample: HotspotPointerSample | null;
  latestResult: HotspotPlacementSampleResult<Hit> | null;
  frame: number | null;
}

interface DirectGesture {
  readonly annotationId: string;
  readonly pointerId: number;
  readonly start: HotspotPointerSample;
  readonly captureTarget: Element;
  session: HotspotSessionEvidence | null;
}

const DIRECT_DRAG_THRESHOLD_CSS_PIXELS = 4;
const KEYBOARD_STEP_CSS_PIXELS = 8;
const KEYBOARD_FAST_STEP_CSS_PIXELS = 32;

export class HotspotInteractionController<Hit> {
  readonly #options: HotspotInteractionControllerOptions<Hit>;
  readonly #requestFrame: (callback: FrameRequestCallback) => number;
  readonly #cancelFrame: (handle: number) => void;
  #authority: HotspotAuthority;
  #active: ActiveSession<Hit> | null = null;
  #direct: DirectGesture | null = null;
  #blockedBySessionId: number | null = null;
  #nextSessionId = 1;
  #sessionListenersInstalled = false;
  #lastReticleSample: HotspotPointerSample | null = null;
  #disposed = false;

  constructor(authority: HotspotAuthority, options: HotspotInteractionControllerOptions<Hit>) {
    this.#authority = authority;
    this.#options = options;
    this.#requestFrame = options.requestFrame ?? invocationSafeRequestFrame();
    this.#cancelFrame = options.cancelFrame ?? invocationSafeCancelFrame();
    options.surface.addEventListener("pointerup", this.#handleSurfacePointerUp, true);
  }

  get activeSession(): HotspotSessionEvidence | null {
    return this.#active?.phase === "sampling" ? this.#active.evidence : null;
  }

  get interactive(): boolean {
    return !this.#disposed && this.#blockedBySessionId === null && this.#authority.mode === "edit";
  }

  get activationAllowed(): boolean {
    return !this.#disposed && this.#blockedBySessionId === null && this.#authority.mode === "run";
  }

  setAuthority(next: HotspotAuthority): void {
    this.#ensureActive();
    const reason = authorityChangeReason(this.#authority, next);
    if (reason !== null) {
      if (this.#active !== null) this.#invalidate(reason, true);
      else this.#clearDirectGesture();
    }
    this.#authority = next;
  }

  startPlacement(): HotspotSessionEvidence {
    return this.#startExplicit("placement", null, this.#surfaceCenter());
  }

  startReposition(
    annotationId: string,
    initialReticle?: HotspotPointerSample,
  ): HotspotSessionEvidence {
    if (annotationId.length === 0) throw new Error("Reposition requires an annotation ID.");
    return this.#startExplicit("reposition", annotationId, initialReticle ?? this.#surfaceCenter());
  }

  beginDirectReposition(start: HotspotDirectPointerStart): boolean {
    this.#ensureActive();
    if (
      !this.interactive ||
      this.#active !== null ||
      this.#direct !== null ||
      start.annotationId.length === 0 ||
      start.event.button !== 0 ||
      start.event.isPrimary === false
    ) {
      return false;
    }
    this.#direct = {
      annotationId: start.annotationId,
      pointerId: start.event.pointerId,
      start: { clientX: start.event.clientX, clientY: start.event.clientY },
      captureTarget: start.captureTarget,
      session: null,
    };
    this.#addDirectListeners(start.captureTarget);
    trySetPointerCapture(start.captureTarget, start.event.pointerId);
    this.#installContextListeners();
    return true;
  }

  updateReticle(sample: HotspotPointerSample): void {
    this.#queueSample(this.#clampToSurface(sample));
  }

  acceptReticle(): boolean {
    return this.#acceptCurrent();
  }

  finishAcceptedDraft(sessionId: number): boolean {
    this.#ensureActive();
    const active = this.#active;
    if (
      active === null ||
      active.phase !== "accepted-draft" ||
      active.evidence.sessionId !== sessionId
    ) {
      return false;
    }
    this.#active = null;
    this.#removeContextListenersIfIdle();
    return true;
  }

  cancel(): void {
    if (this.#active !== null) this.#invalidate("cancel", false);
    else this.#clearDirectGesture();
  }

  acknowledgeCancellation(sessionId: number): boolean {
    if (this.#blockedBySessionId !== sessionId) return false;
    this.#blockedBySessionId = null;
    return true;
  }

  dispose(): void {
    if (this.#disposed) return;
    if (this.#active !== null) this.#invalidate("dispose", true);
    else this.#clearDirectGesture();
    this.#options.surface.removeEventListener("pointerup", this.#handleSurfacePointerUp, true);
    this.#disposed = true;
  }

  #startExplicit(
    kind: HotspotSessionKind,
    annotationId: string | null,
    initialReticle: HotspotPointerSample,
  ): HotspotSessionEvidence {
    const evidence = this.#start(kind, annotationId, "surface");
    this.#focusSurface();
    if (this.#options.onReticleChange !== undefined) this.#queueSample(initialReticle);
    return evidence;
  }

  #start(
    kind: HotspotSessionKind,
    annotationId: string | null,
    input: ActiveSession<Hit>["input"],
  ): HotspotSessionEvidence {
    this.#ensureActive();
    if (!this.interactive) throw new Error("Hotspot authoring is not interactive.");
    if (this.#active !== null) this.#invalidate("cancel", false);
    const evidence = Object.freeze({
      sessionId: this.#nextSessionId++,
      kind,
      annotationId,
      authority: Object.freeze({ ...this.#authority }),
    });
    this.#active = {
      evidence,
      input,
      phase: "sampling",
      latestSample: null,
      latestResult: null,
      frame: null,
    };
    if (input === "surface") this.#addSurfacePointerListeners();
    this.#installContextListeners();
    return evidence;
  }

  #queueSample(sample: HotspotPointerSample): void {
    const active = this.#active;
    if (active === null || active.phase !== "sampling" || !this.interactive) return;
    active.latestSample = { clientX: sample.clientX, clientY: sample.clientY };
    this.#lastReticleSample = active.latestSample;
    this.#options.onReticleChange?.({ ...active.latestSample, status: "pending" });
    if (active.frame !== null) return;
    const sessionId = active.evidence.sessionId;
    active.frame = this.#requestFrame(() => {
      const current = this.#active;
      if (current === null || current.evidence.sessionId !== sessionId || !this.interactive) return;
      current.frame = null;
      const currentSample = current.latestSample;
      if (currentSample === null) return;
      current.latestSample = null;
      this.#sampleNow(current, currentSample);
    });
  }

  #sampleNow(active: ActiveSession<Hit>, sample: HotspotPointerSample): void {
    active.latestResult = this.#options.hitTest(sample);
    this.#options.onPreview(active.evidence, active.latestResult);
    this.#options.onReticleChange?.(reticleState(sample, active.latestResult));
  }

  #acceptCurrent(): boolean {
    const active = this.#active;
    if (
      active === null ||
      active.frame !== null ||
      active.latestSample !== null ||
      active.latestResult?.status !== "valid" ||
      active.phase !== "sampling" ||
      !this.interactive
    ) {
      return false;
    }
    const hit = active.latestResult.hit;
    const evidence = active.evidence;
    if (evidence.kind === "placement") this.#retainAcceptedDraft(active);
    else this.#finishActive(active);
    this.#options.onAccept(evidence, hit);
    return true;
  }

  #invalidate(
    reason: HotspotSessionCancellationReason,
    requiresAcknowledgment: boolean,
    rejectionReason?: HotspotPlacementRejectionReason,
  ): void {
    const active = this.#active;
    if (active === null) return;
    const evidence = active.evidence;
    this.#finishActive(active);
    if (requiresAcknowledgment) this.#blockedBySessionId = evidence.sessionId;
    this.#options.onPreview(evidence, null);
    if (rejectionReason === undefined) {
      this.#options.onCancel(evidence, reason, requiresAcknowledgment);
    } else {
      this.#options.onCancel(evidence, reason, requiresAcknowledgment, rejectionReason);
    }
  }

  #finishActive(active: ActiveSession<Hit>): void {
    this.#clearFrame(active);
    this.#active = null;
    this.#lastReticleSample = null;
    this.#options.onReticleChange?.(null);
    if (active.input === "direct") {
      this.#options.onDirectDragEnd?.(active.evidence);
      this.#clearDirectGesture();
    } else {
      this.#removeSurfacePointerListeners();
      this.#removeContextListenersIfIdle();
    }
  }

  #retainAcceptedDraft(active: ActiveSession<Hit>): void {
    this.#clearFrame(active);
    active.phase = "accepted-draft";
    this.#options.onReticleChange?.(null);
    this.#removeSurfacePointerListeners();
  }

  #clearFrame(active: ActiveSession<Hit>): void {
    if (active.frame !== null) this.#cancelFrame(active.frame);
    active.frame = null;
    active.latestSample = null;
    active.latestResult = null;
  }

  #surfaceCenter(): HotspotPointerSample {
    const bounds = this.#surfaceBounds();
    return {
      clientX: bounds.left + bounds.width / 2,
      clientY: bounds.top + bounds.height / 2,
    };
  }

  #clampToSurface(sample: HotspotPointerSample): HotspotPointerSample {
    const bounds = this.#surfaceBounds();
    if (bounds.width <= 0 || bounds.height <= 0) {
      return { clientX: sample.clientX, clientY: sample.clientY };
    }
    return {
      clientX: Math.min(bounds.right, Math.max(bounds.left, sample.clientX)),
      clientY: Math.min(bounds.bottom, Math.max(bounds.top, sample.clientY)),
    };
  }

  #surfaceBounds(): DOMRect {
    if (typeof this.#options.surface.getBoundingClientRect === "function") {
      return this.#options.surface.getBoundingClientRect();
    }
    return {
      bottom: 0,
      height: 0,
      left: 0,
      right: 0,
      top: 0,
      width: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    };
  }

  #focusSurface(): void {
    if (typeof this.#options.surface.focus !== "function") return;
    this.#options.surface.focus({ preventScroll: true });
  }

  #installContextListeners(): void {
    if (this.#sessionListenersInstalled) return;
    this.#sessionListenersInstalled = true;
    this.#options.surface.addEventListener("keydown", this.#handleKeyDown);
    this.#windowTarget()?.addEventListener("blur", this.#handleContextLoss);
    this.#options.surface.ownerDocument?.addEventListener(
      "visibilitychange",
      this.#handleVisibilityChange,
    );
  }

  #removeContextListenersIfIdle(): void {
    if (!this.#sessionListenersInstalled || this.#active !== null || this.#direct !== null) return;
    this.#sessionListenersInstalled = false;
    this.#options.surface.removeEventListener("keydown", this.#handleKeyDown);
    this.#windowTarget()?.removeEventListener("blur", this.#handleContextLoss);
    this.#options.surface.ownerDocument?.removeEventListener(
      "visibilitychange",
      this.#handleVisibilityChange,
    );
  }

  #windowTarget(): (Window & typeof globalThis) | null {
    return this.#options.surface.ownerDocument?.defaultView ?? null;
  }

  #addSurfacePointerListeners(): void {
    this.#options.surface.addEventListener("pointermove", this.#handleSurfacePointerMove, true);
    this.#options.surface.addEventListener("pointercancel", this.#handleSurfacePointerCancel, true);
  }

  #removeSurfacePointerListeners(): void {
    this.#options.surface.removeEventListener("pointermove", this.#handleSurfacePointerMove, true);
    this.#options.surface.removeEventListener(
      "pointercancel",
      this.#handleSurfacePointerCancel,
      true,
    );
  }

  #addDirectListeners(target: Element): void {
    target.addEventListener("keydown", this.#handleDirectKeyDown as EventListener);
    target.addEventListener("pointermove", this.#handleDirectPointerMove as EventListener);
    target.addEventListener("pointerup", this.#handleDirectPointerUp as EventListener);
    target.addEventListener("pointercancel", this.#handleDirectPointerCancel as EventListener);
    target.addEventListener("lostpointercapture", this.#handleLostPointerCapture as EventListener);
  }

  #clearDirectGesture(): void {
    const direct = this.#direct;
    if (direct === null) {
      this.#removeContextListenersIfIdle();
      return;
    }
    this.#direct = null;
    direct.captureTarget.removeEventListener("keydown", this.#handleDirectKeyDown as EventListener);
    direct.captureTarget.removeEventListener(
      "pointermove",
      this.#handleDirectPointerMove as EventListener,
    );
    direct.captureTarget.removeEventListener(
      "pointerup",
      this.#handleDirectPointerUp as EventListener,
    );
    direct.captureTarget.removeEventListener(
      "pointercancel",
      this.#handleDirectPointerCancel as EventListener,
    );
    direct.captureTarget.removeEventListener(
      "lostpointercapture",
      this.#handleLostPointerCapture as EventListener,
    );
    tryReleasePointerCapture(direct.captureTarget, direct.pointerId);
    this.#removeContextListenersIfIdle();
  }

  #ensureActive(): void {
    if (this.#disposed) throw new Error("Hotspot interaction controller is disposed.");
  }

  readonly #handleSurfacePointerMove = (event: PointerEvent): void => {
    this.#queueSample(this.#clampToSurface(event));
  };

  readonly #handleSurfacePointerUp = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    const active = this.#active;
    if (
      active === null ||
      active.input !== "surface" ||
      active.phase !== "sampling" ||
      !this.interactive
    )
      return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.#clearFrame(active);
    const sample = this.#clampToSurface(event);
    this.#sampleNow(active, sample);
    this.#acceptCurrent();
  };

  readonly #handleSurfacePointerCancel = (): void => {
    if (this.#active !== null) this.#invalidate("context", true);
  };

  readonly #handleDirectPointerMove = (rawEvent: Event): void => {
    const event = rawEvent as PointerEvent;
    const direct = this.#direct;
    if (direct === null || direct.pointerId !== event.pointerId || !this.interactive) return;
    if (direct.session === null) {
      const distance = Math.hypot(
        event.clientX - direct.start.clientX,
        event.clientY - direct.start.clientY,
      );
      if (distance < DIRECT_DRAG_THRESHOLD_CSS_PIXELS) return;
      const session = this.#start("reposition", direct.annotationId, "direct");
      direct.session = session;
      this.#options.onDirectDragStart?.(session);
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    this.#queueSample(this.#clampToSurface(event));
  };

  readonly #handleDirectKeyDown = (rawEvent: Event): void => {
    const event = rawEvent as KeyboardEvent;
    if (event.key !== "Escape" || this.#direct === null) return;
    event.preventDefault();
    event.stopPropagation();
    if (this.#active !== null) this.#invalidate("cancel", false);
    else this.#clearDirectGesture();
  };

  readonly #handleDirectPointerUp = (rawEvent: Event): void => {
    const event = rawEvent as PointerEvent;
    const direct = this.#direct;
    if (direct === null || direct.pointerId !== event.pointerId) return;
    const active = this.#active;
    if (active === null || direct.session === null) {
      this.#clearDirectGesture();
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    this.#clearFrame(active);
    const sample = this.#clampToSurface(event);
    this.#sampleNow(active, sample);
    if (!this.#acceptCurrent()) {
      const rejectionReason =
        active.latestResult?.status === "rejected" ? active.latestResult.reason : undefined;
      this.#invalidate("cancel", false, rejectionReason);
    }
  };

  readonly #handleDirectPointerCancel = (rawEvent: Event): void => {
    const event = rawEvent as PointerEvent;
    if (this.#direct?.pointerId !== event.pointerId) return;
    if (this.#active !== null) this.#invalidate("context", true);
    else this.#clearDirectGesture();
  };

  readonly #handleLostPointerCapture = (rawEvent: Event): void => {
    const event = rawEvent as PointerEvent;
    if (this.#direct?.pointerId !== event.pointerId) return;
    if (this.#active !== null) this.#invalidate("context", true);
    else this.#clearDirectGesture();
  };

  readonly #handleKeyDown = (rawEvent: Event): void => {
    const event = rawEvent as KeyboardEvent;
    const active = this.#active;
    if (active === null || active.phase !== "sampling") return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      this.#invalidate("cancel", false);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      if (active.latestSample !== null) {
        const sample = active.latestSample;
        this.#clearFrame(active);
        this.#sampleNow(active, sample);
      }
      this.#acceptCurrent();
      return;
    }
    const direction = keyboardDirection(event.key);
    if (direction === null) return;
    event.preventDefault();
    event.stopPropagation();
    const current = active.latestSample ?? this.#lastReticleSample ?? this.#surfaceCenter();
    const step = event.shiftKey ? KEYBOARD_FAST_STEP_CSS_PIXELS : KEYBOARD_STEP_CSS_PIXELS;
    this.#queueSample(
      this.#clampToSurface({
        clientX: current.clientX + direction.clientX * step,
        clientY: current.clientY + direction.clientY * step,
      }),
    );
  };

  readonly #handleContextLoss = (): void => {
    if (this.#active !== null) this.#invalidate("context", true);
    else this.#clearDirectGesture();
  };

  readonly #handleVisibilityChange = (): void => {
    if (this.#options.surface.ownerDocument?.visibilityState === "hidden") {
      this.#handleContextLoss();
    }
  };
}

function authorityChangeReason(
  previous: HotspotAuthority,
  next: HotspotAuthority,
): HotspotSessionCancellationReason | null {
  if (previous.mode !== next.mode) return "mode";
  if (previous.projectId !== next.projectId) return "project";
  if (previous.sourceId !== next.sourceId || previous.documentId !== next.documentId)
    return "source";
  if (previous.documentRevision !== next.documentRevision) return "revision";
  if (previous.contextId !== next.contextId) return "context";
  return null;
}

function keyboardDirection(key: string): HotspotPointerSample | null {
  if (key === "ArrowLeft") return { clientX: -1, clientY: 0 };
  if (key === "ArrowRight") return { clientX: 1, clientY: 0 };
  if (key === "ArrowUp") return { clientX: 0, clientY: -1 };
  if (key === "ArrowDown") return { clientX: 0, clientY: 1 };
  return null;
}

function reticleState<Hit>(
  sample: HotspotPointerSample,
  result: HotspotPlacementSampleResult<Hit>,
): HotspotReticleState {
  return result.status === "valid"
    ? { ...sample, status: "valid" }
    : { ...sample, status: "rejected", reason: result.reason };
}

function trySetPointerCapture(target: Element, pointerId: number): void {
  if (!("setPointerCapture" in target)) return;
  try {
    target.setPointerCapture(pointerId);
  } catch {
    // Capture can fail if the browser has already canceled the pointer.
  }
}

function tryReleasePointerCapture(target: Element, pointerId: number): void {
  if (!("releasePointerCapture" in target)) return;
  try {
    if (!("hasPointerCapture" in target) || target.hasPointerCapture(pointerId)) {
      target.releasePointerCapture(pointerId);
    }
  } catch {
    // A lost capture is already released from the controller's perspective.
  }
}

function invocationSafeRequestFrame(): (callback: FrameRequestCallback) => number {
  return (callback) => globalThis.requestAnimationFrame(callback);
}

function invocationSafeCancelFrame(): (handle: number) => void {
  return (handle) => globalThis.cancelAnimationFrame(handle);
}
