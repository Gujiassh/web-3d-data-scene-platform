import { validateSceneDocument, type SceneDocument } from "@web3d/document";
import {
  Box3,
  Color,
  DirectionalLight,
  GridHelper,
  HemisphereLight,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
  type Material,
  type Object3D,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

import type {
  TransformAuthoringController,
  TransformAuthoringControllerFactory,
} from "../authoring/transform-authoring-controller";
import { defaultAssetResolver } from "../assets/asset-loader";
import { cloneJson } from "../data/json-pointer";
import { RuntimeValueStore } from "../data/value-store";
import { diagnostic, diagnosticError, RuntimeDiagnosticError } from "../diagnostics";
import { AnimationFrameSlot } from "../lifecycle/idempotent-disposer";
import { RuntimeAlarmStore } from "../rules/alarm-store";
import { evaluateRuleSet } from "../rules/rule-engine";
import type {
  AuthoringSceneViewer,
  AuthoringTool,
  AuthoringViewerEvent,
  AuthoringViewerSnapshot,
  CreateAuthoringViewerOptions,
  CreateViewerOptions,
  DataAdapter,
  DataEnvelope,
  Diagnostic,
  FocusOptions,
  RuntimeBindingState,
  SceneViewer,
  ViewerEvent,
  ViewerLifecycle,
  ViewerSnapshot,
} from "../types";
import { applyRuleEffects, resetRuleEffects } from "./effect-projector";
import { ViewerAdapterRuntime } from "./adapter-runtime";
import { ObjectPicker } from "./object-picker";
import {
  buildRuntimeGeneration,
  type RuntimeEntity,
  type RuntimeGeneration,
  type RuntimeTarget,
} from "./runtime-generation";
import { SelectionOverlay } from "./selection-overlay";

export interface AuthoringViewportOptions {
  readonly enabled: true;
  readonly dataRuntimeEnabled: boolean;
  readonly initialTool: AuthoringTool;
  readonly onEvent: ((event: AuthoringViewerEvent) => void) | undefined;
  readonly createTransformController: TransformAuthoringControllerFactory;
}

interface ReadonlyViewportOptions {
  readonly enabled: false;
  readonly dataRuntimeEnabled: true;
  readonly initialTool: "select";
  readonly onEvent: undefined;
}

interface PendingEntitySelection {
  readonly entityId: string;
  readonly origin: "viewport" | "api";
  readonly controller: AbortController;
}

interface InternalViewportOptions extends CreateViewerOptions {
  readonly authoring?: AuthoringViewportOptions;
}

const DEFAULT_CANVAS_LABEL = "Interactive 3D scene";

class ThreeSceneViewport {
  readonly #container: HTMLElement;
  readonly #scene = new Scene();
  readonly #camera = new PerspectiveCamera(45, 1, 0.01, 1000);
  readonly #renderer: WebGLRenderer;
  readonly #controls: OrbitControls;
  readonly #transformAuthoring: TransformAuthoringController | null;
  readonly #picker = new ObjectPicker<string>();
  readonly #renderSlot = new AnimationFrameSlot();
  readonly #selectionOverlay: SelectionOverlay;
  readonly #assetResolver;
  readonly #adapterRuntime: ViewerAdapterRuntime;
  readonly #resizeObserver: ResizeObserver;
  readonly #healthTimer: ReturnType<typeof setInterval>;
  readonly #onViewerEvent: ((event: ViewerEvent) => void) | undefined;
  readonly #authoring: AuthoringViewportOptions | ReadonlyViewportOptions;
  readonly #reducedMotion: boolean;

  #generation: RuntimeGeneration | null = null;
  #document: SceneDocument | null = null;
  #valueStore = new RuntimeValueStore();
  #alarmStore = new RuntimeAlarmStore();
  readonly #bindingStates = new Map<string, RuntimeBindingState>();
  #dataRuntimeEnabled: boolean;
  #lifecycle: ViewerLifecycle = "created";
  #selectedTargetId: string | null = null;
  #selectedEntityId: string | null = null;
  #grid: GridHelper | null = null;
  #loadBarrier: Promise<void> = Promise.resolve();
  #loadController: AbortController | null = null;
  #focusFrame: number | null = null;
  #focusResolve: (() => void) | null = null;
  #disposePromise: Promise<void> | null = null;
  #disposing = false;
  #pendingGenerations = new Set<RuntimeGeneration>();
  #pendingEntitySelection: PendingEntitySelection | null = null;
  #pointerStart: { x: number; y: number } | null = null;

  constructor(container: HTMLElement, options: InternalViewportOptions = {}) {
    this.#container = container;
    this.#assetResolver = options.assetResolver ?? defaultAssetResolver;
    this.#onViewerEvent = options.onEvent;
    this.#authoring = options.authoring ?? {
      enabled: false,
      dataRuntimeEnabled: true,
      initialTool: "select",
      onEvent: undefined,
    };
    this.#dataRuntimeEnabled = this.#authoring.dataRuntimeEnabled;
    this.#reducedMotion = options.reducedMotion ?? false;

    this.#renderer = new WebGLRenderer({ antialias: true });
    this.#renderer.setPixelRatio(
      Math.min(options.pixelRatio ?? globalThis.devicePixelRatio ?? 1, 2),
    );
    this.#renderer.domElement.dataset["web3dViewer"] = "true";
    this.#applyCanvasLabel(options.canvasLabel ?? DEFAULT_CANVAS_LABEL);
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

    this.#selectionOverlay = new SelectionOverlay(this.#scene);
    this.#transformAuthoring = this.#authoring.enabled
      ? this.#authoring.createTransformController({
          camera: this.#camera,
          surface: this.#renderer.domElement,
          scene: this.#scene,
          orbitControls: this.#controls,
          initialTool: this.#authoring.initialTool,
          emit: (event) => this.#emitAuthoring(event),
          requestRender: this.#requestRender,
        })
      : null;

    this.#adapterRuntime = new ViewerAdapterRuntime({
      ...(options.adapters === undefined ? {} : { adapters: options.adapters }),
      acceptEnvelope: (envelope) => this.#acceptEnvelope(envelope),
      hasSource: (sourceId) =>
        this.#document?.dataSources.some((source) => source.id === sourceId) === true,
      isDisposed: () => this.#disposing,
      isEnabled: () => this.#dataRuntimeEnabled,
      now: () => performance.now(),
      recordDiagnostic: (value) => this.#recordDiagnostic(value),
    });

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

    const supersededController = this.#loadController;
    const supersededAdapters =
      supersededController === null ? Promise.resolve() : this.#adapterRuntime.stopAll();
    supersededController?.abort();
    const controller = new AbortController();
    this.#loadController = controller;
    if (this.#pendingEntitySelection?.controller === supersededController) {
      this.#pendingEntitySelection = { ...this.#pendingEntitySelection, controller };
    }
    const operation = this.#loadBarrier.then(async () => {
      await supersededAdapters;
      await this.#performLoad(validation.value, controller);
    });
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

      await this.#replaceGeneration(source, next, controller, () => {
        candidate = null;
        committed = true;
      });
      await this.#adapterRuntime.applyDocumentAdapters();

      if (this.#disposing) throw abortError();
      if (this.#loadController !== controller) return;

      this.#lifecycle = "ready";
      this.#emitViewer({
        type: "ready",
        documentId: source.id,
        revision: source.revision,
      });
      this.#requestRender();
    } catch (error) {
      if (this.#pendingEntitySelection?.controller === controller) {
        this.#pendingEntitySelection = null;
      }
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

  async #replaceGeneration(
    source: SceneDocument,
    next: RuntimeGeneration,
    controller: AbortController,
    transferOwnership: () => void,
  ): Promise<void> {
    controller.signal.throwIfAborted();
    await this.#adapterRuntime.stopAll();
    if (this.#disposing) throw abortError();

    const previousDocumentId = this.#document?.id ?? null;
    const previousSelectedEntityId = this.#selectedEntityId;
    const pendingSelection =
      this.#pendingEntitySelection?.controller === controller ? this.#pendingEntitySelection : null;
    const nextSelectedEntityId =
      pendingSelection !== null
        ? next.entities.has(pendingSelection.entityId)
          ? pendingSelection.entityId
          : null
        : this.#authoring.enabled &&
            previousDocumentId === source.id &&
            previousSelectedEntityId !== null &&
            next.entities.has(previousSelectedEntityId)
          ? previousSelectedEntityId
          : null;
    const previous = this.#generation;
    this.#clearDataRuntimeState();
    this.#transformAuthoring?.sync(null, previousSelectedEntityId);
    this.#selectionOverlay.clear();
    if (previous !== null) this.#scene.remove(previous.root);
    this.#generation = next;
    this.#pendingGenerations.delete(next);
    this.#document = source;
    this.#scene.add(next.root);
    transferOwnership();
    if (this.#pendingEntitySelection?.controller === controller) {
      this.#pendingEntitySelection = null;
    }
    previous?.dispose();

    this.#valueStore = new RuntimeValueStore();
    this.#alarmStore = new RuntimeAlarmStore();
    this.#bindingStates.clear();
    this.#selectedTargetId = null;
    this.#selectedEntityId = nextSelectedEntityId;
    if (this.#dataRuntimeEnabled) {
      for (const sourceDefinition of source.dataSources) {
        this.#valueStore.registerSource(sourceDefinition.id, sourceDefinition);
      }
    }
    this.#applyEnvironment(source);
    const initialView = source.views[0];
    if (initialView !== undefined) this.#applyView(initialView.id);
    if (this.#dataRuntimeEnabled) {
      for (const sourceDefinition of source.dataSources) {
        this.#applyBindings(sourceDefinition.id);
      }
    }
    this.#syncSelectionOverlay();
    this.#transformAuthoring?.sync(next, nextSelectedEntityId);
    if (previousSelectedEntityId !== nextSelectedEntityId) {
      this.#emitAuthoring({
        type: "entity-selection-change",
        entityId: nextSelectedEntityId,
        origin: pendingSelection?.origin ?? "api",
      });
    }
  }

  setAdapter(sourceId: string, adapter: DataAdapter | null): Promise<void> {
    this.#ensureActive();
    return this.#adapterRuntime.setAdapter(sourceId, adapter);
  }

  async setDataRuntimeEnabled(enabled: boolean): Promise<void> {
    this.#ensureActive();
    if (!this.#authoring.enabled || this.#dataRuntimeEnabled === enabled) return;
    this.#dataRuntimeEnabled = enabled;
    if (!enabled) {
      const stopping = this.#adapterRuntime.reconcileDocumentAdapters(false);
      this.#clearDataRuntimeState();
      await stopping;
      return;
    }

    this.#resetValueStore(true);
    for (const sourceId of this.#valueStore.sourceIds()) this.#applyBindings(sourceId);
    await this.#adapterRuntime.reconcileDocumentAdapters(true);
  }

  setCanvasLabel(label: string): void {
    this.#ensureActive();
    this.#applyCanvasLabel(label);
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
        { targetId },
      );
      this.#recordDiagnostic(value);
      throw diagnosticError(value);
    }
    if (options.select === true) this.#selectTarget(targetId, "api");
    await this.#focusObject(target.object, options);
  }

  selectEntity(entityId: string | null): void {
    this.#ensureActive();
    this.#selectEntity(entityId, "api");
  }

  async focusEntity(entityId: string, options: FocusOptions = {}): Promise<void> {
    this.#ensureActive();
    const entity = this.#entity(entityId);
    if (!entity.object.visible) {
      const value = diagnostic(
        "ENTITY_HIDDEN",
        "viewer",
        "warning",
        `Entity ${entityId} is hidden.`,
        { entityId },
      );
      this.#recordDiagnostic(value);
      throw diagnosticError(value);
    }
    if (options.select === true) this.#selectEntity(entityId, "api");
    await this.#focusObject(entity.object, options);
  }

  setTool(tool: AuthoringTool): void {
    this.#ensureActive();
    if (this.#transformAuthoring === null || this.#transformAuthoring.getTool() === tool) return;
    this.#transformAuthoring.setTool(tool);
    this.#emitAuthoring({ type: "tool-change", tool });
    this.#requestRender();
  }

  getTool(): AuthoringTool {
    return this.#transformAuthoring?.getTool() ?? "select";
  }

  async setView(viewId: string): Promise<void> {
    this.#ensureActive();
    this.#applyView(viewId);
  }

  getSnapshot(): ViewerSnapshot | AuthoringViewerSnapshot {
    const snapshot: ViewerSnapshot = {
      lifecycle: this.#lifecycle,
      documentId: this.#document?.id ?? null,
      revision: this.#document?.revision ?? null,
      selectedTargetId: this.#selectedTargetId,
      connections: this.#valueStore.getConnections(),
      alarms: this.#alarmStore.snapshot(),
    };
    if (this.#transformAuthoring === null) return snapshot;
    return {
      ...snapshot,
      selectedEntityId: this.#selectedEntityId,
      activeTool: this.#transformAuthoring.getTool(),
      dataRuntimeEnabled: this.#dataRuntimeEnabled,
      bindingStates: this.#bindingStateSnapshot(),
    };
  }

  getDiagnostics(): readonly Diagnostic[] {
    return [...this.#diagnostics];
  }

  readonly #diagnostics: Diagnostic[] = [];

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
    this.#transformAuthoring?.dispose();
    this.#selectionOverlay.dispose();
    this.#disposeGrid();
    this.#generation?.dispose();
    this.#generation = null;
    this.#renderer.dispose();
    this.#renderer.domElement.remove();
    await this.#adapterRuntime.stopAll();
  }

  readonly #requestRender = (): void => {
    if (this.#disposing) return;
    this.#renderSlot.request(() => this.#render());
  };

  #render(): void {
    if (this.#disposing) return;
    this.#selectionOverlay.update();
    const start = performance.now();
    this.#renderer.render(this.#scene, this.#camera);
    const info = this.#renderer.info.render;
    this.#emitViewer({
      type: "performance",
      sample: {
        renderDurationMs: performance.now() - start,
        drawCalls: info.calls,
        triangles: info.triangles,
      },
    });
  }

  #acceptEnvelope(envelope: DataEnvelope): void {
    if (!this.#dataRuntimeEnabled) return;
    const before = this.#valueStore.getSource(envelope.sourceId)?.connection;
    const update = this.#valueStore.accept(envelope, performance.now());
    for (const value of update.diagnostics) this.#recordDiagnostic(value);
    const after = this.#valueStore.getSource(envelope.sourceId)?.connection;
    if (before !== after && after !== undefined) {
      this.#emitViewer({ type: "connection-change", sourceId: envelope.sourceId, status: after });
    }
    if (update.accepted || update.connectionChanged) this.#applyBindings(envelope.sourceId);
  }

  #updateHealth(): void {
    if (this.#lifecycle !== "ready" || !this.#dataRuntimeEnabled) return;
    for (const sourceId of this.#valueStore.sourceIds()) {
      const afterBefore = this.#valueStore.getSource(sourceId)?.connection;
      const update = this.#valueStore.updateHealth(sourceId, performance.now());
      const after = this.#valueStore.getSource(sourceId)?.connection;
      if (update.connectionChanged && after !== undefined) {
        this.#emitViewer({ type: "connection-change", sourceId, status: after });
        this.#applyBindings(sourceId);
      }
      if (afterBefore === after) continue;
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
        const value = this.#valueStore.getValue(sourceId, binding.pointer);
        const result = evaluateRuleSet(ruleSet, {
          value,
          quality: source.quality,
          connection: source.connection,
        });
        resetRuleEffects(target, binding.writes);
        applyRuleEffects(target, result.effects);
        this.#updateBindingState({
          bindingId: binding.id,
          targetId: binding.targetId,
          sourceId,
          pointer: binding.pointer,
          value,
          quality: source.quality,
          connection: source.connection,
          ruleId: result.ruleId,
          ...(source.sourceTime === undefined ? {} : { sourceTime: source.sourceTime }),
        });
        for (const transition of this.#alarmStore.reconcile({
          targetId: binding.targetId,
          bindingId: binding.id,
          ruleId: result.ruleId,
          sourceId,
          effects: result.effects,
          ...(source.sourceTime === undefined ? {} : { sourceTime: source.sourceTime }),
        })) {
          this.#emitViewer({ type: "alarm", ...transition });
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

  #clearDataRuntimeState(): void {
    this.#generation?.targets.forEach((target) => resetRuleEffects(target));
    for (const transition of this.#alarmStore.clearAll()) {
      this.#emitViewer({ type: "alarm", ...transition });
    }
    for (const bindingId of [...this.#bindingStates.keys()].sort(compare)) {
      this.#emitAuthoring({
        type: "binding-state-change",
        transition: "cleared",
        bindingId,
      });
    }
    this.#bindingStates.clear();
    this.#resetValueStore(false);
    this.#requestRender();
  }

  #resetValueStore(registerSources: boolean): void {
    this.#valueStore = new RuntimeValueStore();
    if (!registerSources) return;
    for (const source of this.#document?.dataSources ?? []) {
      this.#valueStore.registerSource(source.id, source);
    }
  }

  #updateBindingState(state: RuntimeBindingState): void {
    const snapshot = cloneBindingState(state);
    const current = this.#bindingStates.get(snapshot.bindingId);
    if (bindingStatesEqual(current, snapshot)) return;
    this.#bindingStates.set(snapshot.bindingId, snapshot);
    this.#emitAuthoring({
      type: "binding-state-change",
      transition: "updated",
      state: cloneBindingState(snapshot),
    });
  }

  #bindingStateSnapshot(): readonly RuntimeBindingState[] {
    return [...this.#bindingStates.values()]
      .sort((left, right) => compare(left.bindingId, right.bindingId))
      .map(cloneBindingState);
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

  #entity(entityId: string): RuntimeEntity {
    const entity = this.#generation?.entities.get(entityId);
    if (entity !== undefined) return entity;
    const value = diagnostic(
      "ENTITY_NOT_FOUND",
      "viewer",
      "warning",
      `Entity ${entityId} does not exist.`,
      { entityId },
    );
    this.#recordDiagnostic(value);
    throw diagnosticError(value);
  }

  #selectTarget(targetId: string | null, origin: "viewer" | "api"): void {
    if (targetId !== null) this.#target(targetId);
    if (this.#selectedTargetId === targetId) return;
    this.#selectedTargetId = targetId;
    if (!this.#authoring.enabled) this.#syncSelectionOverlay();
    this.#emitViewer({ type: "selection-change", targetId, origin });
    this.#requestRender();
  }

  #selectEntity(entityId: string | null, origin: "viewport" | "api"): void {
    if (!this.#authoring.enabled) return;
    if (entityId !== null && this.#generation?.entities.has(entityId) !== true) {
      if (this.#loadController !== null) {
        this.#pendingEntitySelection = {
          entityId,
          origin,
          controller: this.#loadController,
        };
        return;
      }
      this.#entity(entityId);
    }
    this.#pendingEntitySelection = null;
    if (this.#selectedEntityId === entityId) return;
    this.#selectedEntityId = entityId;
    this.#syncSelectionOverlay();
    this.#transformAuthoring?.sync(this.#generation, entityId);
    this.#emitAuthoring({ type: "entity-selection-change", entityId, origin });
    this.#requestRender();
  }

  #syncSelectionOverlay(): void {
    if (this.#authoring.enabled) {
      const object =
        this.#selectedEntityId === null
          ? null
          : (this.#generation?.entities.get(this.#selectedEntityId)?.object ?? null);
      this.#selectionOverlay.set(object);
      return;
    }
    const object =
      this.#selectedTargetId === null
        ? null
        : (this.#generation?.targets.get(this.#selectedTargetId)?.object ?? null);
    this.#selectionOverlay.set(object);
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

  async #focusObject(object: Object3D, options: FocusOptions): Promise<void> {
    const box = new Box3().setFromObject(object);
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
    await this.#animateCamera(destination, center, options.durationMs ?? 240);
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
    if (!ObjectPicker.isClick(start, { x: event.clientX, y: event.clientY })) return;
    const generation = this.#generation;
    if (generation === null) return;
    if (this.#authoring.enabled) {
      const entityId = this.#picker.pick({
        camera: this.#camera,
        clientX: event.clientX,
        clientY: event.clientY,
        root: generation.root,
        surface: this.#renderer.domElement,
        resolveId: (object) => generation.entityForObject(object),
      });
      this.#selectEntity(entityId, "viewport");
      return;
    }
    const targetId = this.#picker.pick({
      camera: this.#camera,
      clientX: event.clientX,
      clientY: event.clientY,
      root: generation.root,
      surface: this.#renderer.domElement,
      resolveId: (object) => generation.targetForObject(object),
    });
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

  #applyCanvasLabel(label: string): void {
    this.#renderer.domElement.setAttribute("aria-label", label);
  }

  #recordDiagnostic(value: Diagnostic): void {
    this.#diagnostics.push(value);
    if (this.#diagnostics.length > 100) this.#diagnostics.splice(0, this.#diagnostics.length - 100);
    this.#emitViewer({ type: "diagnostic", diagnostic: value });
  }

  #emitViewer(event: ViewerEvent): void {
    try {
      const listener = this.#authoring.enabled ? this.#authoring.onEvent : this.#onViewerEvent;
      listener?.(event);
    } catch (error) {
      reportErrorAsync(error);
    }
  }

  #emitAuthoring(event: Exclude<AuthoringViewerEvent, ViewerEvent>): void {
    try {
      this.#authoring.onEvent?.(event);
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

function bindingStatesEqual(
  left: RuntimeBindingState | undefined,
  right: RuntimeBindingState,
): boolean {
  return (
    left !== undefined &&
    left.targetId === right.targetId &&
    left.sourceId === right.sourceId &&
    left.pointer === right.pointer &&
    left.quality === right.quality &&
    left.connection === right.connection &&
    left.ruleId === right.ruleId &&
    left.sourceTime === right.sourceTime &&
    jsonValuesEqual(left.value, right.value)
  );
}

function cloneBindingState(state: RuntimeBindingState): RuntimeBindingState {
  return {
    ...state,
    value: state.value === undefined ? undefined : cloneJson(state.value),
  };
}

function jsonValuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length &&
      left.every((value, index) => jsonValuesEqual(value, right[index]))
    );
  }
  if (!isRecord(left) || !isRecord(right)) return false;
  const leftKeys = Object.keys(left).sort(compare);
  const rightKeys = Object.keys(right).sort(compare);
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key, index) => key === rightKeys[index] && jsonValuesEqual(left[key], right[key]),
    )
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
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

export function createThreeSceneViewport(
  container: HTMLElement,
  options?: CreateViewerOptions,
): SceneViewer;
export function createThreeSceneViewport(
  container: HTMLElement,
  options: Omit<CreateAuthoringViewerOptions, "initialTool" | "onEvent">,
  authoring: AuthoringViewportOptions,
): AuthoringSceneViewer;
export function createThreeSceneViewport(
  container: HTMLElement,
  options: CreateViewerOptions | Omit<CreateAuthoringViewerOptions, "initialTool" | "onEvent"> = {},
  authoring?: AuthoringViewportOptions,
): SceneViewer | AuthoringSceneViewer {
  const viewport = new ThreeSceneViewport(container, {
    ...options,
    ...(authoring === undefined ? {} : { authoring }),
  });
  return viewport as unknown as SceneViewer | AuthoringSceneViewer;
}
