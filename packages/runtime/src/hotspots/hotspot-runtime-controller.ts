import type { Annotation, SceneDocument } from "@web3d/document";
import {
  Group,
  Raycaster,
  Vector2,
  Vector3,
  type Object3D,
  type PerspectiveCamera,
  type Scene,
} from "three";

import { diagnostic } from "../diagnostics";
import type {
  AuthoringMode,
  AuthoringViewerEvent,
  Diagnostic,
  FocusOptions,
  ViewerEvent,
} from "../types";
import type { RuntimeGeneration } from "../viewer/runtime-generation";
import {
  HotspotActionInterpreter,
  type HotspotActivationEvent,
  type HotspotActivationOrigin,
  type HotspotActionSubject,
} from "./hotspot-action-interpreter";
import {
  HotspotInteractionController,
  type HotspotAuthority,
  type HotspotAuthorityContext,
  type HotspotPlacementSampleResult,
  type HotspotSessionEvidence,
} from "./hotspot-interaction-controller";
import {
  HotspotOverlay,
  type HotspotOverlayActivation,
  type HotspotOverlayMarker,
} from "./hotspot-overlay";
import type {
  HotspotScreenAnchor,
  HotspotUnresolvedReason,
  HotspotViewState,
} from "./hotspot-view-state";
import { HotspotSurfaceHitTester, type HotspotSurfaceHitEvidence } from "./surface-hit-tester";

export interface HotspotRuntimeControllerOptions {
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  readonly container: HTMLElement;
  readonly surface: HTMLElement;
  readonly initialMode: AuthoringMode;
  readonly initialAuthority?: HotspotAuthorityContext;
  readonly initialOrder?: readonly string[];
  readonly reducedMotion: boolean;
  readonly emitViewer: (event: ViewerEvent) => void;
  readonly emitAuthoring: (event: Exclude<AuthoringViewerEvent, ViewerEvent>) => void;
  readonly recordDiagnostic: (value: Diagnostic) => void;
  readonly focusPoint: (point: Vector3, options?: FocusOptions) => Promise<void>;
  readonly focusTarget: (targetId: string, options?: FocusOptions) => Promise<void>;
  readonly requestRender: () => void;
}

/** Composes hotspot policy so the viewport only forwards authority, lifecycle and render signals. */
export class HotspotRuntimeController {
  readonly #options: HotspotRuntimeControllerOptions;
  readonly #emptyRoot = new Group();
  readonly #raycaster = new Raycaster();
  readonly #pointer = new Vector2();
  readonly #worldPosition = new Vector3();
  readonly #worldNormal = new Vector3();
  readonly #overlay: HotspotOverlay;
  readonly #interaction: HotspotInteractionController<HotspotSurfaceHitEvidence>;
  readonly #actions: HotspotActionInterpreter;
  #document: SceneDocument | null = null;
  #generation: RuntimeGeneration | null = null;
  #mode: AuthoringMode;
  #context: HotspotAuthorityContext;
  #contextRevision = 0;
  #authorityDocumentId: string | null = null;
  #authorityDocumentRevision: number | null = null;
  #markers: readonly HotspotOverlayMarker[] = [];
  #appliedMarkers: readonly HotspotOverlayMarker[] = [];
  #preview: HotspotOverlayMarker | null = null;
  #resolved = new Map<string, Vector3>();
  #resolvedNodes = new Map<string, Object3D>();
  #unresolvedReasons = new Map<string, HotspotUnresolvedReason>();
  #disposed = false;

  constructor(options: HotspotRuntimeControllerOptions) {
    this.#options = options;
    this.#mode = options.initialMode;
    this.#context = options.initialAuthority ?? { projectId: null, sourceId: null };
    this.#overlay = new HotspotOverlay({
      scene: options.scene,
      container: options.container,
      camera: options.camera,
      occlusionRoot: this.#emptyRoot,
      ...(options.reducedMotion ? { reducedMotionQuery: fixedReducedMotionQuery() } : {}),
      onActivate: (activation) => this.#handleOverlayActivation(activation),
      onPointerStart: (start) => {
        const annotation = this.#document?.annotations.find(
          (candidate) => candidate.id === start.id,
        );
        if (
          this.#mode !== "edit" ||
          annotation === undefined ||
          !annotation.visible ||
          annotation.locked
        ) {
          return;
        }
        this.#interaction.beginDirectReposition({
          annotationId: start.id,
          event: start.event,
          captureTarget: start.captureTarget,
        });
      },
    });
    this.#overlay.setOrder(options.initialOrder ?? []);
    this.#interaction = new HotspotInteractionController(this.#authority(), {
      surface: options.surface,
      hitTest: (sample) => this.#hitTest(sample.clientX, sample.clientY),
      onPreview: (session, hit) => this.#handlePreview(session, hit),
      onReticleChange: (state) => this.#overlay.setReticle(state),
      onDirectDragStart: (session) => {
        this.#overlay.setDirectDrag(session.annotationId);
        options.emitAuthoring({
          type: "hotspot-session-start",
          session,
          origin: "direct-pointer",
        });
      },
      onDirectDragEnd: () => {
        this.#overlay.setDirectDrag(null, true);
      },
      onAccept: (session, hit) => {
        const screenAnchor = this.#previewScreenAnchor(session);
        options.emitAuthoring({
          type: "hotspot-placement-accept",
          session,
          hit,
          screenAnchor,
        });
        if (session.kind === "reposition") {
          this.#preview = null;
          this.#applyMarkers();
        }
      },
      onCancel: (session, reason, requiresAcknowledgment, rejectionReason) => {
        this.#preview = null;
        this.#applyMarkers();
        options.emitAuthoring({
          type: "hotspot-session-cancel",
          session,
          reason,
          requiresAcknowledgment,
          ...(rejectionReason === undefined ? {} : { rejectionReason }),
        });
      },
    });
    this.#actions = new HotspotActionInterpreter({
      showPlainText: (request) => options.emitViewer({ type: "hotspot-content", ...request }),
      requestHostContent: (request) =>
        options.emitViewer({ type: "hotspot-host-content-request", ...request }),
      focusPoint: async (point) => {
        try {
          await options.focusPoint(point);
          return true;
        } catch {
          return false;
        }
      },
      focusTarget: async (targetId) => {
        try {
          await options.focusTarget(targetId);
          return true;
        } catch {
          return false;
        }
      },
    });
  }

  sync(document: SceneDocument, generation: RuntimeGeneration): void {
    this.#ensureActive();
    this.#document = document;
    this.#generation = generation;
    this.#authorityDocumentId = document.id;
    this.#authorityDocumentRevision = document.revision;
    this.#overlay.setOcclusionRoot(generation.root);
    this.#interaction.setAuthority(this.#authority());
    this.#resolveMarkers(true);
  }

  prepareSource(nextDocumentId: string, nextRevision: number): void {
    this.#ensureActive();
    this.#authorityDocumentId = nextDocumentId;
    this.#authorityDocumentRevision = nextRevision;
    this.#document = null;
    this.#generation = null;
    this.#markers = [];
    this.#appliedMarkers = [];
    this.#preview = null;
    this.#resolved.clear();
    this.#resolvedNodes.clear();
    this.#unresolvedReasons.clear();
    this.#overlay.setOcclusionRoot(this.#emptyRoot);
    this.#overlay.setMarkers([]);
    this.#overlay.updateNow();
    this.#interaction.setAuthority(this.#authority());
  }

  setMode(mode: AuthoringMode): void {
    this.#ensureActive();
    if (this.#mode === mode) return;
    this.#mode = mode;
    this.#interaction.setAuthority(this.#authority());
    this.#resolveMarkers(false);
  }

  setAuthorityContext(context: HotspotAuthorityContext): void {
    this.#ensureActive();
    if (
      context.projectId === this.#context.projectId &&
      context.sourceId === this.#context.sourceId
    )
      return;
    this.#context = { ...context };
    this.#interaction.setAuthority(this.#authority());
  }

  setOrder(annotationIds: readonly string[]): void {
    this.#ensureActive();
    this.#overlay.setOrder(annotationIds);
    this.#options.requestRender();
  }

  invalidateContext(): void {
    this.#ensureActive();
    this.#contextRevision += 1;
    this.#interaction.setAuthority(this.#authority());
  }

  render(): void {
    if (this.#disposed) return;
    this.#resolveMarkers(false, false);
  }

  resize(): void {
    if (!this.#disposed) this.#overlay.updateNow();
  }

  startPlacement(): HotspotSessionEvidence {
    this.#ensureActive();
    if (this.#document === null || this.#generation === null) {
      throw new Error("Hotspot placement requires a loaded scene.");
    }
    return this.#interaction.startPlacement();
  }

  startReposition(annotationId: string): HotspotSessionEvidence {
    this.#ensureActive();
    const annotation = this.#document?.annotations.find(
      (candidate) => candidate.id === annotationId,
    );
    if (annotation === undefined || this.#generation === null) {
      throw new Error(`Hotspot ${annotationId} is not available.`);
    }
    if (annotation.locked) throw new Error(`Hotspot ${annotationId} is locked.`);
    return this.#interaction.startReposition(
      annotationId,
      this.#overlay.screenAnchor(annotationId) ?? undefined,
    );
  }

  updateReticle(clientX: number, clientY: number): void {
    this.#interaction.updateReticle({ clientX, clientY });
  }

  acceptReticle(): boolean {
    return this.#interaction.acceptReticle();
  }

  cancelSession(): void {
    this.#interaction.cancel();
  }

  finishDraft(sessionId: number): boolean {
    this.#ensureActive();
    if (!this.#interaction.finishAcceptedDraft(sessionId)) return false;
    this.#preview = null;
    this.#applyMarkers();
    return true;
  }

  acknowledgeCancellation(sessionId: number): boolean {
    return this.#interaction.acknowledgeCancellation(sessionId);
  }

  focus(annotationId: string, options?: FocusOptions): Promise<void> {
    this.#ensureActive();
    const point = this.#resolved.get(annotationId);
    if (point === undefined)
      return Promise.reject(new Error(`Hotspot ${annotationId} is unavailable.`));
    return this.#options.focusPoint(point.clone(), options);
  }

  focusProxy(annotationId: string): boolean {
    this.#ensureActive();
    const annotation = this.#document?.annotations.find(
      (candidate) => candidate.id === annotationId,
    );
    if (
      annotation === undefined ||
      !annotation.visible ||
      this.#unresolvedReasons.has(annotationId)
    ) {
      return false;
    }
    return this.#overlay.focusProxy(annotationId);
  }

  getViewState(annotationId: string): HotspotViewState {
    this.#ensureActive();
    const annotation = this.#document?.annotations.find(
      (candidate) => candidate.id === annotationId,
    );
    if (annotation === undefined) {
      return {
        annotationId,
        availability: "unavailable",
        unavailableReason: "annotation-not-found",
        resolution: "unresolved",
        unresolvedReason: null,
        markerVisible: false,
        screenAnchor: null,
      };
    }
    const unresolvedReason = this.#unresolvedReasons.get(annotationId);
    if (unresolvedReason !== undefined) {
      return {
        annotationId,
        availability: "available",
        unavailableReason: null,
        resolution: "unresolved",
        unresolvedReason,
        markerVisible: false,
        screenAnchor: null,
      };
    }
    const screenAnchor = this.#overlay.screenAnchor(annotationId);
    return {
      annotationId,
      availability: "available",
      unavailableReason: null,
      resolution: "resolved",
      unresolvedReason: null,
      markerVisible: screenAnchor !== null,
      screenAnchor,
    };
  }

  async activate(
    annotationId: string,
    origin: HotspotActivationOrigin = "list",
  ): Promise<HotspotActivationEvent> {
    this.#ensureActive();
    if (!this.#interaction.activationAllowed) {
      throw new Error("Hotspot activation is unavailable outside interactive Run mode.");
    }
    const subject = this.#subject(annotationId);
    const event = await this.#actions.activate(subject, origin);
    this.#options.emitViewer(event);
    return event;
  }

  activateAt(clientX: number, clientY: number): boolean {
    if (this.#overlay.visibleMarkerCount === 0) return false;
    if (this.#interaction.activeSession !== null) return false;
    if (this.#mode === "run" && !this.#interaction.activationAllowed) return false;
    return this.#overlay.activateAt(clientX, clientY) !== null;
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#interaction.dispose();
    this.#overlay.dispose();
    this.#document = null;
    this.#generation = null;
    this.#resolved.clear();
    this.#resolvedNodes.clear();
    this.#unresolvedReasons.clear();
    this.#disposed = true;
  }

  #resolveMarkers(reportDiagnostics: boolean, requestRender = true): void {
    const document = this.#document;
    const generation = this.#generation;
    if (document === null || generation === null) {
      this.#markers = [];
      this.#resolved.clear();
      this.#resolvedNodes.clear();
      this.#unresolvedReasons.clear();
      this.#applyMarkers(requestRender);
      return;
    }
    const markers: HotspotOverlayMarker[] = [];
    const resolved = new Map<string, Vector3>();
    const resolvedNodes = new Map<string, Object3D>();
    const unresolvedReasons = new Map<string, HotspotUnresolvedReason>();
    for (const annotation of document.annotations) {
      if (annotation.anchor.kind !== "surface") {
        unresolvedReasons.set(annotation.id, "legacy-anchor");
        if (reportDiagnostics) this.#reportUnresolved(annotation, "legacy-anchor");
        continue;
      }
      const result = generation.hotspotSurfaces.resolveAnchor(
        annotation.anchor,
        this.#worldPosition,
        this.#worldNormal,
      );
      if (!result.ok) {
        unresolvedReasons.set(annotation.id, result.reason);
        if (reportDiagnostics) this.#reportUnresolved(annotation, result.reason);
        continue;
      }
      const position = this.#worldPosition.clone();
      resolved.set(annotation.id, position);
      resolvedNodes.set(annotation.id, result.node);
      if (!annotation.visible || !isEffectivelyVisibleWithin(result.node, generation.root))
        continue;
      markers.push({
        id: annotation.id,
        title: annotation.title,
        visible: true,
        worldPosition: tuple(position),
        worldNormal: tuple(this.#worldNormal),
      });
    }
    this.#markers = markers;
    this.#resolved = resolved;
    this.#resolvedNodes = resolvedNodes;
    this.#unresolvedReasons = unresolvedReasons;
    this.#applyMarkers(requestRender);
  }

  #applyMarkers(requestRender = true): void {
    const next = this.#preview === null ? this.#markers : [...this.#markers, this.#preview];
    if (sameMarkerStructure(this.#appliedMarkers, next)) this.#overlay.updateMarkerFrames(next);
    else this.#overlay.setMarkers(next);
    this.#appliedMarkers = next;
    this.#overlay.updateNow();
    if (requestRender) this.#options.requestRender();
  }

  #hitTest(
    clientX: number,
    clientY: number,
  ): HotspotPlacementSampleResult<HotspotSurfaceHitEvidence> {
    const document = this.#document;
    const generation = this.#generation;
    if (document === null || generation === null) {
      return { status: "rejected", reason: "no-surface" };
    }
    const bounds = this.#options.surface.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) {
      return { status: "rejected", reason: "no-surface" };
    }
    this.#pointer.set(
      ((clientX - bounds.left) / bounds.width) * 2 - 1,
      -((clientY - bounds.top) / bounds.height) * 2 + 1,
    );
    this.#raycaster.setFromCamera(this.#pointer, this.#options.camera);
    const tester = new HotspotSurfaceHitTester(generation.hotspotSurfaces);
    for (const hit of this.#raycaster.intersectObject(generation.root, true)) {
      if (!isEffectivelyVisibleWithin(hit.object, generation.root)) continue;
      const entityId = generation.entityForObject(hit.object);
      const entity = document.entities.find((candidate) => candidate.id === entityId);
      if (entity?.type !== "asset") continue;
      const result = tester.test(
        {
          object: hit.object,
          point: hit.point,
          ...(hit.face === undefined ? {} : { face: hit.face }),
        },
        { documentId: document.id, revision: document.revision },
      );
      if (result.ok) return { status: "valid", hit: result.evidence };
      return { status: "rejected", reason: "unsupported" };
    }
    return { status: "rejected", reason: "no-surface" };
  }

  #handlePreview(
    session: HotspotSessionEvidence,
    result: HotspotPlacementSampleResult<HotspotSurfaceHitEvidence> | null,
  ): void {
    this.#preview =
      result?.status !== "valid"
        ? null
        : {
            id: `hotspot-preview:${session.sessionId}`,
            title: "preview",
            visible: true,
            interactive: false,
            worldPosition: result.hit.worldPosition,
            worldNormal: result.hit.worldNormal,
          };
    this.#applyMarkers();
    if (result !== null) {
      const screenAnchor = result.status === "valid" ? this.#previewScreenAnchor(session) : null;
      this.#options.emitAuthoring({
        type: "hotspot-placement-preview",
        session,
        screenAnchor,
        result:
          result.status === "valid"
            ? { status: "valid" }
            : { status: "rejected", reason: result.reason },
      });
    }
  }

  #previewScreenAnchor(session: HotspotSessionEvidence): HotspotScreenAnchor | null {
    return this.#overlay.screenAnchor(`hotspot-preview:${session.sessionId}`);
  }

  #handleOverlayActivation(activation: HotspotOverlayActivation): void {
    if (this.#mode === "edit") {
      this.#options.emitAuthoring({
        type: "hotspot-selection-request",
        annotationId: activation.id,
        origin: "viewport",
      });
      return;
    }
    const origin: HotspotActivationOrigin =
      activation.origin === "proxy-keyboard" ? "keyboard" : "pointer";
    void this.activate(activation.id, origin).catch(() => undefined);
  }

  #subject(annotationId: string): HotspotActionSubject {
    const annotation = this.#document?.annotations.find(
      (candidate) => candidate.id === annotationId,
    );
    const worldPosition = this.#resolved.get(annotationId);
    const node = this.#resolvedNodes.get(annotationId);
    const root = this.#generation?.root;
    if (
      annotation === undefined ||
      !annotation.visible ||
      worldPosition === undefined ||
      node === undefined ||
      root === undefined ||
      !isEffectivelyVisibleWithin(node, root)
    ) {
      throw new Error(`Hotspot ${annotationId} is unavailable.`);
    }
    return {
      id: annotation.id,
      title: annotation.title,
      content: annotation.content,
      action: annotation.action,
      worldPosition,
    };
  }

  #reportUnresolved(annotation: Annotation, reason: string): void {
    this.#options.recordDiagnostic(
      diagnostic(
        "ANNOTATION_SURFACE_UNRESOLVED",
        "viewer",
        "warning",
        `Hotspot ${annotation.id} surface is unavailable (${reason}).`,
        { annotationId: annotation.id },
      ),
    );
  }

  #authority(): HotspotAuthority {
    return {
      mode: this.#mode,
      documentId: this.#authorityDocumentId,
      documentRevision: this.#authorityDocumentRevision,
      projectId: this.#context.projectId,
      sourceId: this.#context.sourceId,
      contextId: `webgl:${this.#contextRevision}`,
    };
  }

  #ensureActive(): void {
    if (this.#disposed) throw new Error("Hotspot runtime controller is disposed.");
  }
}

function tuple(value: Vector3): readonly [number, number, number] {
  return [value.x, value.y, value.z];
}

function sameMarkerStructure(
  previous: readonly HotspotOverlayMarker[],
  next: readonly HotspotOverlayMarker[],
): boolean {
  if (previous.length !== next.length) return false;
  return previous.every((marker, index) => {
    const candidate = next[index];
    return (
      candidate !== undefined &&
      marker.id === candidate.id &&
      marker.title === candidate.title &&
      marker.interactive === candidate.interactive
    );
  });
}

function isEffectivelyVisibleWithin(object: Object3D, root: Object3D): boolean {
  let current: Object3D | null = object;
  while (current !== null) {
    if (!current.visible) return false;
    if (current === root) return true;
    current = current.parent;
  }
  return false;
}

function fixedReducedMotionQuery(): MediaQueryList {
  return {
    matches: true,
    media: "(prefers-reduced-motion: reduce)",
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => true,
  };
}
