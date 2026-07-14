import { validateSceneDocument, type SceneDocument } from "@web3d/document";
import {
  Box3,
  BoxHelper,
  Color,
  DirectionalLight,
  GridHelper,
  HemisphereLight,
  PerspectiveCamera,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
  type Material,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

import { defaultAssetResolver } from "../assets/asset-loader";
import { RuntimeValueStore } from "../data/value-store";
import { diagnostic, diagnosticError, RuntimeDiagnosticError } from "../diagnostics";
import { AnimationFrameSlot } from "../lifecycle/idempotent-disposer";
import { RuntimeAlarmStore } from "../rules/alarm-store";
import { evaluateRuleSet } from "../rules/rule-engine";
import type {
  CreateViewerOptions,
  DataAdapter,
  DataEnvelope,
  Diagnostic,
  FocusOptions,
  SceneViewer,
  ViewerEvent,
  ViewerLifecycle,
  ViewerSnapshot,
} from "../types";
import { applyRuleEffects } from "./effect-projector";
import {
  buildRuntimeGeneration,
  type RuntimeGeneration,
  type RuntimeTarget,
} from "./runtime-generation";

interface ActiveAdapter {
  readonly adapter: DataAdapter;
  readonly controller: AbortController;
  readonly unsubscribe: () => void;
}

export function createSceneViewer(
  container: HTMLElement,
  options: CreateViewerOptions = {},
): SceneViewer {
  return new ThreeSceneViewer(container, options);
}

class ThreeSceneViewer implements SceneViewer {
  readonly #container: HTMLElement;
  readonly #scene = new Scene();
  readonly #camera = new PerspectiveCamera(45, 1, 0.01, 1000);
  readonly #renderer: WebGLRenderer;
  readonly #controls: OrbitControls;
  readonly #raycaster = new Raycaster();
  readonly #pointer = new Vector2();
  readonly #renderSlot = new AnimationFrameSlot();
  readonly #configuredAdapters = new Map<string, DataAdapter>();
  readonly #activeAdapters = new Map<string, ActiveAdapter>();
  readonly #adapterRevisions = new Map<string, number>();
  readonly #diagnostics: Diagnostic[] = [];
  readonly #pendingGenerations = new Set<RuntimeGeneration>();
  readonly #assetResolver;
  readonly #onEvent: ((event: ViewerEvent) => void) | undefined;
  readonly #reducedMotion: boolean;
  readonly #resizeObserver: ResizeObserver;
  readonly #healthTimer: ReturnType<typeof setInterval>;

  #generation: RuntimeGeneration | null = null;
  #document: SceneDocument | null = null;
  #valueStore = new RuntimeValueStore();
  #alarmStore = new RuntimeAlarmStore();
  #lifecycle: ViewerLifecycle = "created";
  #selectedTargetId: string | null = null;
  #selectionHelper: BoxHelper | null = null;
  #grid: GridHelper | null = null;
  #adapterBarrier: Promise<void> = Promise.resolve();
  #loadBarrier: Promise<void> = Promise.resolve();
  #loadController: AbortController | null = null;
  #focusFrame: number | null = null;
  #focusResolve: (() => void) | null = null;
  #disposing = false;
  #disposePromise: Promise<void> | null = null;
  #pointerStart: { x: number; y: number } | null = null;

  constructor(container: HTMLElement, options: CreateViewerOptions) {
    this.#container = container;
    this.#assetResolver = options.assetResolver ?? defaultAssetResolver;
    this.#onEvent = options.onEvent;
    this.#reducedMotion = options.reducedMotion ?? false;
    for (const [sourceId, adapter] of Object.entries(options.adapters ?? {})) {
      this.#configuredAdapters.set(sourceId, adapter);
    }

    this.#renderer = new WebGLRenderer({ antialias: true });
    this.#renderer.setPixelRatio(
      Math.min(options.pixelRatio ?? globalThis.devicePixelRatio ?? 1, 2),
    );
    this.#renderer.domElement.dataset["web3dViewer"] = "true";
    this.#renderer.domElement.setAttribute("aria-label", "Interactive 3D scene");
    this.#renderer.domElement.tabIndex = 0;
    this.#renderer.domElement.style.display = "block";
    this.#renderer.domElement.style.height = "100%";
    this.#renderer.domElement.style.touchAction = "none";
    this.#renderer.domElement.style.width = "100%";
    this.#container.replaceChildren(this.#renderer.domElement);

    this.#camera.position.set(7.5, 5.5, 8.5);
    this.#controls = new OrbitControls(this.#camera, this.#renderer.domElement);
    this.#controls.enableDamping = false;
    this.#controls.target.set(0, 0.75, 0);
    this.#controls.addEventListener("change", this.#requestRender);

    const hemisphere = new HemisphereLight(0xffffff, 0x65706a, 1.8);
    const key = new DirectionalLight(0xffffff, 2.2);
    key.position.set(5, 10, 7);
    this.#scene.add(hemisphere, key);
    this.#scene.background = new Color("#F4F6F5");

    this.#renderer.domElement.addEventListener("pointerdown", this.#handlePointerDown);
    this.#renderer.domElement.addEventListener("pointerup", this.#handlePointerUp);
    this.#renderer.domElement.addEventListener("webglcontextlost", this.#handleContextLost);
    this.#renderer.domElement.addEventListener("webglcontextrestored", this.#handleContextRestored);
    this.#resizeObserver = new ResizeObserver(() => this.resize());
    this.#resizeObserver.observe(this.#container);
    this.#healthTimer = setInterval(() => this.#updateHealth(), 500);
    this.resize();

    if (options.source !== undefined) {
      queueMicrotask(() => {
        void this.load(options.source!).catch(() => undefined);
      });
    }
  }

  load(source: SceneDocument): Promise<void> {
    this.#ensureActive();
    const validation = validateSceneDocument(source);
    if (!validation.ok) {
      const first = validation.diagnostics[0];
      const value = diagnostic(
        "DOCUMENT_REFERENCE_INVALID",
        "document",
        "error",
        first?.message ?? "SceneDocument validation failed.",
        first?.path === undefined ? {} : { action: first.path },
      );
      this.#recordDiagnostic(value);
      return Promise.reject(diagnosticError(value));
    }

    this.#loadController?.abort();
    const controller = new AbortController();
    this.#loadController = controller;
    const operation = this.#loadBarrier.then(() => this.#performLoad(validation.value, controller));
    this.#loadBarrier = operation.catch(() => undefined);
    return operation;
  }

  async #performLoad(source: SceneDocument, controller: AbortController): Promise<void> {
    if (this.#disposing) throw abortError();
    controller.signal.throwIfAborted();
    const previousLifecycle: ViewerLifecycle = this.#generation === null ? "created" : "ready";
    this.#lifecycle = "loading";
    let candidate: RuntimeGeneration | null = null;
    let committed = false;

    try {
      candidate = await buildRuntimeGeneration(source, this.#assetResolver, controller.signal);
      this.#pendingGenerations.add(candidate);
      controller.signal.throwIfAborted();
      const next = candidate;

      await this.#queueAdapterOperation(async () => {
        controller.signal.throwIfAborted();
        await this.#stopAllAdapters();
        if (this.#disposing) throw abortError();

        const previous = this.#generation;
        if (previous !== null) this.#scene.remove(previous.root);
        this.#generation = next;
        this.#pendingGenerations.delete(next);
        candidate = null;
        this.#document = source;
        this.#scene.add(next.root);
        previous?.dispose();
        committed = true;

        this.#valueStore = new RuntimeValueStore();
        this.#alarmStore = new RuntimeAlarmStore();
        this.#clearSelection(false);
        for (const sourceDefinition of source.dataSources) {
          this.#valueStore.registerSource(sourceDefinition.id, sourceDefinition);
        }
        this.#applyEnvironment(source);
        const initialView = source.views[0];
        if (initialView !== undefined) this.#applyView(initialView.id);
        for (const sourceDefinition of source.dataSources) {
          this.#applyBindings(sourceDefinition.id);
        }
        for (const [sourceId, adapter] of this.#configuredAdapters) {
          const revision = this.#adapterRevisions.get(sourceId) ?? 0;
          await this.#startAdapter(
            sourceId,
            adapter,
            () =>
              (this.#adapterRevisions.get(sourceId) ?? 0) === revision &&
              this.#configuredAdapters.get(sourceId) === adapter,
          );
        }
      });

      if (this.#disposing) throw abortError();
      if (this.#loadController !== controller) return;

      this.#lifecycle = "ready";
      this.#emit({
        type: "ready",
        documentId: source.id,
        revision: source.revision,
      });
      this.#requestRender();
    } catch (error) {
      if (candidate !== null) {
        this.#pendingGenerations.delete(candidate);
        candidate.dispose();
      }
      if (!committed && this.#loadController === controller && !this.#disposing) {
        this.#lifecycle = previousLifecycle;
      }
      if (!isAbortError(error)) {
        const value =
          error instanceof RuntimeDiagnosticError
            ? error.diagnostic
            : diagnostic("ASSET_LOAD_FAILED", "asset", "error", "Scene loading failed.");
        this.#recordDiagnostic(value);
      }
      throw error;
    } finally {
      if (this.#loadController === controller) this.#loadController = null;
    }
  }

  async setAdapter(sourceId: string, adapter: DataAdapter | null): Promise<void> {
    this.#ensureActive();
    if (adapter !== null && adapter.sourceId !== sourceId) {
      const value = diagnostic(
        "ADAPTER_SOURCE_MISMATCH",
        "adapter",
        "error",
        `Adapter source ${adapter.sourceId} does not match ${sourceId}.`,
        { sourceId },
      );
      this.#recordDiagnostic(value);
      throw diagnosticError(value);
    }
    const revision = (this.#adapterRevisions.get(sourceId) ?? 0) + 1;
    this.#adapterRevisions.set(sourceId, revision);
    const stopping = this.#stopAdapter(sourceId);

    await this.#queueAdapterOperation(async () => {
      if (this.#disposing) return;
      await stopping;
      if (this.#disposing || this.#adapterRevisions.get(sourceId) !== revision) return;
      if (adapter === null) {
        this.#configuredAdapters.delete(sourceId);
        return;
      }
      this.#configuredAdapters.set(sourceId, adapter);
      if (this.#document?.dataSources.some((source) => source.id === sourceId) === true) {
        await this.#startAdapter(
          sourceId,
          adapter,
          () =>
            this.#adapterRevisions.get(sourceId) === revision &&
            this.#configuredAdapters.get(sourceId) === adapter,
        );
      }
    });
  }

  selectTarget(targetId: string | null): void {
    this.#ensureActive();
    this.#selectTarget(targetId, "api");
  }

  async focusTarget(targetId: string, options: FocusOptions = {}): Promise<void> {
    this.#ensureActive();
    const target = this.#target(targetId);
    if (!target.object.visible) {
      const value = diagnostic(
        "TARGET_HIDDEN",
        "viewer",
        "warning",
        `Target ${targetId} is hidden.`,
        {
          targetId,
        },
      );
      this.#recordDiagnostic(value);
      throw diagnosticError(value);
    }

    const box = new Box3().setFromObject(target.object);
    if (box.isEmpty()) return;
    const center = box.getCenter(new Vector3());
    const size = box.getSize(new Vector3());
    const padding = options.padding ?? 1.7;
    const verticalFov = (this.#camera.fov * Math.PI) / 180;
    const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * this.#camera.aspect);
    const fitFov = Math.min(verticalFov, horizontalFov);
    const distance = (Math.max(size.x, size.y, size.z, 0.5) * padding) / (2 * Math.tan(fitFov / 2));
    const direction = this.#camera.position.clone().sub(this.#controls.target);
    if (direction.lengthSq() < 0.0001) direction.set(1, 0.8, 1);
    direction.normalize();
    const destination = center.clone().addScaledVector(direction, distance);

    if (options.select === true) this.#selectTarget(targetId, "api");
    await this.#animateCamera(destination, center, options.durationMs ?? 240);
  }

  async setView(viewId: string): Promise<void> {
    this.#ensureActive();
    this.#applyView(viewId);
  }

  getSnapshot(): ViewerSnapshot {
    return {
      lifecycle: this.#lifecycle,
      documentId: this.#document?.id ?? null,
      revision: this.#document?.revision ?? null,
      selectedTargetId: this.#selectedTargetId,
      connections: this.#valueStore.getConnections(),
      alarms: this.#alarmStore.snapshot(),
    };
  }

  getDiagnostics(): readonly Diagnostic[] {
    return [...this.#diagnostics];
  }

  resize(): void {
    if (this.#disposing) return;
    const width = Math.max(1, this.#container.clientWidth);
    const height = Math.max(1, this.#container.clientHeight);
    this.#camera.aspect = width / height;
    this.#camera.updateProjectionMatrix();
    this.#renderer.setSize(width, height, false);
    this.#requestRender();
  }

  dispose(): Promise<void> {
    if (this.#disposePromise === null) {
      this.#disposing = true;
      this.#disposePromise = this.#dispose();
    }
    return this.#disposePromise;
  }

  async #dispose(): Promise<void> {
    this.#lifecycle = "disposed";
    this.#loadController?.abort();
    this.#pendingGenerations.forEach((generation) => generation.dispose());
    this.#pendingGenerations.clear();
    this.#cancelFocus();
    clearInterval(this.#healthTimer);
    this.#resizeObserver.disconnect();
    this.#renderSlot.cancel();
    this.#renderer.domElement.removeEventListener("pointerdown", this.#handlePointerDown);
    this.#renderer.domElement.removeEventListener("pointerup", this.#handlePointerUp);
    this.#renderer.domElement.removeEventListener("webglcontextlost", this.#handleContextLost);
    this.#renderer.domElement.removeEventListener(
      "webglcontextrestored",
      this.#handleContextRestored,
    );
    this.#controls.removeEventListener("change", this.#requestRender);
    this.#controls.dispose();
    const stoppingAdapters = this.#stopAllAdapters();
    this.#disposeSelectionHelper();
    this.#disposeGrid();
    this.#generation?.dispose();
    this.#generation = null;
    this.#renderer.dispose();
    this.#renderer.domElement.remove();
    await stoppingAdapters;
  }

  readonly #requestRender = (): void => {
    if (this.#disposing) return;
    this.#renderSlot.request(() => this.#render());
  };

  #render(): void {
    if (this.#disposing) return;
    this.#selectionHelper?.update();
    const start = performance.now();
    this.#renderer.render(this.#scene, this.#camera);
    const info = this.#renderer.info.render;
    this.#emit({
      type: "performance",
      sample: {
        renderDurationMs: performance.now() - start,
        drawCalls: info.calls,
        triangles: info.triangles,
      },
    });
  }

  async #startAdapter(
    sourceId: string,
    adapter: DataAdapter,
    isCurrent: () => boolean = () => true,
  ): Promise<void> {
    if (this.#disposing || !isCurrent()) return;
    if (this.#document?.dataSources.some((source) => source.id === sourceId) !== true) return;
    if (adapter.sourceId !== sourceId) {
      this.#recordDiagnostic(
        diagnostic(
          "ADAPTER_SOURCE_MISMATCH",
          "adapter",
          "error",
          `Adapter source ${adapter.sourceId} does not match ${sourceId}.`,
          { sourceId },
        ),
      );
      return;
    }

    await this.#stopAdapter(sourceId);
    if (this.#disposing || !isCurrent()) return;
    const controller = new AbortController();
    let unsubscribe: () => void;
    try {
      unsubscribe = adapter.subscribe((envelope) => {
        if (!controller.signal.aborted) this.#acceptEnvelope(envelope);
      });
    } catch {
      this.#recordAdapterFailure(sourceId);
      return;
    }
    this.#activeAdapters.set(sourceId, { adapter, controller, unsubscribe });
    try {
      await abortable(
        adapter.start({
          signal: controller.signal,
          now: () => performance.now(),
          emitDiagnostic: (value) => this.#recordDiagnostic(value),
        }),
        controller.signal,
      );
    } catch {
      if (controller.signal.aborted) return;
      this.#recordAdapterFailure(sourceId);
    }
  }

  #recordAdapterFailure(sourceId: string): void {
    const value = diagnostic(
      "DATASOURCE_CONNECTION_FAILED",
      "adapter",
      "error",
      `Adapter ${sourceId} failed to start.`,
      { sourceId },
    );
    this.#recordDiagnostic(value);
    this.#acceptEnvelope({
      kind: "connection",
      sourceId,
      status: "error",
      detailCode: value.code,
    });
  }

  async #stopAdapter(sourceId: string): Promise<void> {
    const active = this.#activeAdapters.get(sourceId);
    if (active === undefined) return;
    this.#activeAdapters.delete(sourceId);
    active.controller.abort();
    active.unsubscribe();
    try {
      await active.adapter.stop();
    } catch {
      this.#recordDiagnostic(
        diagnostic(
          "DATASOURCE_CONNECTION_FAILED",
          "adapter",
          "warning",
          `Adapter ${sourceId} failed to stop cleanly.`,
          { sourceId },
        ),
      );
    }
  }

  async #stopAllAdapters(): Promise<void> {
    await Promise.all(
      [...this.#activeAdapters.keys()].map((sourceId) => this.#stopAdapter(sourceId)),
    );
  }

  #queueAdapterOperation<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.#adapterBarrier.then(operation);
    this.#adapterBarrier = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  #acceptEnvelope(envelope: DataEnvelope): void {
    const before = this.#valueStore.getSource(envelope.sourceId)?.connection;
    const update = this.#valueStore.accept(envelope, performance.now());
    for (const value of update.diagnostics) this.#recordDiagnostic(value);
    const after = this.#valueStore.getSource(envelope.sourceId)?.connection;
    if (before !== after && after !== undefined) {
      this.#emit({ type: "connection-change", sourceId: envelope.sourceId, status: after });
    }
    if (update.accepted || update.connectionChanged) this.#applyBindings(envelope.sourceId);
  }

  #updateHealth(): void {
    if (this.#lifecycle !== "ready") return;
    for (const sourceId of this.#valueStore.sourceIds()) {
      const before = this.#valueStore.getSource(sourceId)?.connection;
      const update = this.#valueStore.updateHealth(sourceId, performance.now());
      const after = this.#valueStore.getSource(sourceId)?.connection;
      if (update.connectionChanged && after !== undefined) {
        this.#emit({ type: "connection-change", sourceId, status: after });
        this.#applyBindings(sourceId);
      }
      if (before === after) continue;
    }
  }

  #applyBindings(sourceId: string): void {
    const document = this.#document;
    const generation = this.#generation;
    const source = this.#valueStore.getSource(sourceId);
    if (document === null || generation === null || source === undefined) return;

    for (const binding of document.bindings) {
      if (!binding.enabled || binding.sourceId !== sourceId) continue;
      const target = generation.targets.get(binding.targetId);
      const ruleSet = document.ruleSets.find((candidate) => candidate.id === binding.ruleSetId);
      if (target === undefined || ruleSet === undefined) continue;
      try {
        const result = evaluateRuleSet(ruleSet, {
          value: this.#valueStore.getValue(sourceId, binding.pointer),
          quality: source.quality,
          connection: source.connection,
        });
        applyRuleEffects(target, result.effects);
        for (const transition of this.#alarmStore.reconcile({
          targetId: binding.targetId,
          bindingId: binding.id,
          ruleId: result.ruleId,
          sourceId,
          effects: result.effects,
          ...(source.sourceTime === undefined ? {} : { sourceTime: source.sourceTime }),
        })) {
          this.#emit({ type: "alarm", ...transition });
        }
      } catch {
        this.#recordDiagnostic(
          diagnostic(
            "RULE_EVALUATION_FAILED",
            "rule",
            "error",
            `Rule evaluation failed for binding ${binding.id}.`,
            { sourceId, bindingId: binding.id, targetId: binding.targetId },
          ),
        );
      }
    }
    this.#requestRender();
  }

  #target(targetId: string): RuntimeTarget {
    const target = this.#generation?.targets.get(targetId);
    if (target !== undefined) return target;
    const value = diagnostic(
      "TARGET_NOT_FOUND",
      "viewer",
      "warning",
      `Target ${targetId} does not exist.`,
      { targetId },
    );
    this.#recordDiagnostic(value);
    throw diagnosticError(value);
  }

  #selectTarget(targetId: string | null, origin: "viewer" | "api"): void {
    if (targetId !== null) this.#target(targetId);
    if (this.#selectedTargetId === targetId) return;
    this.#selectedTargetId = targetId;
    this.#disposeSelectionHelper();
    if (targetId !== null) {
      this.#selectionHelper = new BoxHelper(this.#target(targetId).object, new Color("#2D6CDF"));
      this.#scene.add(this.#selectionHelper);
    }
    this.#emit({ type: "selection-change", targetId, origin });
    this.#requestRender();
  }

  #clearSelection(emit: boolean): void {
    const hadSelection = this.#selectedTargetId !== null;
    this.#selectedTargetId = null;
    this.#disposeSelectionHelper();
    if (emit && hadSelection)
      this.#emit({ type: "selection-change", targetId: null, origin: "api" });
  }

  #disposeSelectionHelper(): void {
    if (this.#selectionHelper === null) return;
    this.#selectionHelper.removeFromParent();
    this.#selectionHelper.geometry.dispose();
    const material = this.#selectionHelper.material;
    if (Array.isArray(material)) material.forEach((value) => value.dispose());
    else material.dispose();
    this.#selectionHelper = null;
  }

  #applyEnvironment(document: SceneDocument): void {
    this.#scene.background = new Color(document.environment.background);
    this.#disposeGrid();
    if (document.environment.grid) {
      this.#grid = new GridHelper(20, 40, 0x9ba7a1, 0xd6dcda);
      this.#scene.add(this.#grid);
    }
  }

  #disposeGrid(): void {
    if (this.#grid === null) return;
    this.#grid.removeFromParent();
    this.#grid.geometry.dispose();
    const material = this.#grid.material;
    if (Array.isArray(material)) material.forEach((value: Material) => value.dispose());
    else material.dispose();
    this.#grid = null;
  }

  #applyView(viewId: string): void {
    const view = this.#document?.views.find((candidate) => candidate.id === viewId);
    if (view === undefined) {
      const value = diagnostic(
        "VIEW_NOT_FOUND",
        "viewer",
        "warning",
        `View ${viewId} does not exist.`,
      );
      this.#recordDiagnostic(value);
      throw diagnosticError(value);
    }
    this.#cancelFocus();
    this.#camera.position.fromArray(view.position);
    this.#camera.fov = view.fov;
    this.#camera.updateProjectionMatrix();
    this.#controls.target.fromArray(view.target);
    this.#controls.update();
    this.#requestRender();
  }

  #animateCamera(destination: Vector3, target: Vector3, durationMs: number): Promise<void> {
    this.#cancelFocus();
    if (this.#reducedMotion || durationMs <= 0) {
      this.#camera.position.copy(destination);
      this.#controls.target.copy(target);
      this.#controls.update();
      this.#requestRender();
      return Promise.resolve();
    }

    const startPosition = this.#camera.position.clone();
    const startTarget = this.#controls.target.clone();
    const startTime = performance.now();
    return new Promise((resolve) => {
      this.#focusResolve = resolve;
      const step = (time: number): void => {
        const progress = Math.min(1, (time - startTime) / durationMs);
        const eased = 1 - Math.pow(1 - progress, 3);
        this.#camera.position.lerpVectors(startPosition, destination, eased);
        this.#controls.target.lerpVectors(startTarget, target, eased);
        this.#controls.update();
        this.#render();
        if (progress < 1) {
          this.#focusFrame = requestAnimationFrame(step);
          return;
        }
        this.#focusFrame = null;
        this.#focusResolve = null;
        resolve();
      };
      this.#focusFrame = requestAnimationFrame(step);
    });
  }

  #cancelFocus(): void {
    if (this.#focusFrame !== null) cancelAnimationFrame(this.#focusFrame);
    this.#focusFrame = null;
    this.#focusResolve?.();
    this.#focusResolve = null;
  }

  readonly #handlePointerDown = (event: PointerEvent): void => {
    this.#pointerStart = { x: event.clientX, y: event.clientY };
    this.#cancelFocus();
  };

  readonly #handlePointerUp = (event: PointerEvent): void => {
    const start = this.#pointerStart;
    this.#pointerStart = null;
    if (start === null || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 4) return;
    const generation = this.#generation;
    if (generation === null) return;
    const bounds = this.#renderer.domElement.getBoundingClientRect();
    this.#pointer.set(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
    );
    this.#raycaster.setFromCamera(this.#pointer, this.#camera);
    const hit = this.#raycaster.intersectObject(generation.root, true)[0];
    const targetId = hit === undefined ? null : (generation.targetForObject(hit.object) ?? null);
    this.#selectTarget(targetId, "viewer");
  };

  readonly #handleContextLost = (event: Event): void => {
    event.preventDefault();
    this.#recordDiagnostic(
      diagnostic(
        "RENDERER_CONTEXT_LOST",
        "renderer",
        "error",
        "The WebGL rendering context was lost.",
      ),
    );
  };

  readonly #handleContextRestored = (): void => {
    this.#requestRender();
  };

  #recordDiagnostic(value: Diagnostic): void {
    this.#diagnostics.push(value);
    if (this.#diagnostics.length > 100) this.#diagnostics.splice(0, this.#diagnostics.length - 100);
    this.#emit({ type: "diagnostic", diagnostic: value });
  }

  #emit(event: ViewerEvent): void {
    try {
      this.#onEvent?.(event);
    } catch (error) {
      reportErrorAsync(error);
    }
  }

  #ensureActive(): void {
    if (!this.#disposing) return;
    throw diagnosticError(
      diagnostic("VIEWER_DISPOSED", "viewer", "error", "Viewer has already been disposed."),
    );
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function abortError(): DOMException {
  return new DOMException("The operation was aborted.", "AbortError");
}

function abortable<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise<T>((resolve, reject) => {
    const cleanup = (): void => signal.removeEventListener("abort", abort);
    const abort = (): void => {
      cleanup();
      reject(abortError());
    };
    signal.addEventListener("abort", abort, { once: true });
    operation.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error: unknown) => {
        cleanup();
        reject(error);
      },
    );
  });
}

function reportErrorAsync(error: unknown): void {
  const reporter = (globalThis as { reportError?: (value: unknown) => void }).reportError;
  if (reporter !== undefined) {
    reporter(error);
    return;
  }
  setTimeout(() => {
    throw error;
  }, 0);
}
