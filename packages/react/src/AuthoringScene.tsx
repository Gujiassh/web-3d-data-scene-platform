import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  type CSSProperties,
} from "react";

import {
  createAuthoringSceneViewer,
  type AssetResolver,
  type AuthoringMode,
  type AuthoringSceneViewer as RuntimeAuthoringViewer,
  type AuthoringTool,
  type AuthoringTransformSettings,
  type AuthoringViewerEvent,
  type AuthoringViewerSnapshot,
  type DataAdapter,
  type Diagnostic,
  type EntitySpatialSnapshot,
  type LightCreationFrame,
  type AuthoredLightPropertyPreview,
  type HotspotActivationEvent,
  type HotspotActivationOrigin,
  type HotspotAuthorityContext,
  type HotspotSessionEvidence,
  type HotspotViewState,
  type SceneSource,
} from "@web3d/runtime";
import type { SceneLighting } from "@web3d/document";

import { reconcileAuthoringSceneRuntime } from "./authoring-runtime-reconciliation";
import {
  reconcileAuthoringSceneSelection,
  reconcileAuthoringSceneSelectionAfterLoad,
  reconcileAuthoringSmartAlign,
  reconcileAuthoringTransformSettings,
} from "./authoring-controlled-state";

type ReadyEvent = Extract<AuthoringViewerEvent, { type: "ready" }>;
type SelectionEvent = Extract<AuthoringViewerEvent, { type: "entity-selection-change" }>;
type BindingStateEvent = Extract<AuthoringViewerEvent, { type: "binding-state-change" }>;
type PreviewEvent = Extract<AuthoringViewerEvent, { type: "transform-preview" }>;
type CommitEvent = Extract<AuthoringViewerEvent, { type: "transform-commit" }>;
type HotspotPreviewEvent = Extract<AuthoringViewerEvent, { type: "hotspot-placement-preview" }>;
type HotspotSessionStartEvent = Extract<AuthoringViewerEvent, { type: "hotspot-session-start" }>;
type HotspotAcceptEvent = Extract<AuthoringViewerEvent, { type: "hotspot-placement-accept" }>;
type HotspotCancelEvent = Extract<AuthoringViewerEvent, { type: "hotspot-session-cancel" }>;
type HotspotSelectionEvent = Extract<AuthoringViewerEvent, { type: "hotspot-selection-request" }>;
type HotspotContentEvent = Extract<AuthoringViewerEvent, { type: "hotspot-content" }>;
type HotspotHostContentEvent = Extract<
  AuthoringViewerEvent,
  { type: "hotspot-host-content-request" }
>;

export interface AuthoringSceneHandle {
  selectEntity(entityId: string | null): void;
  selectEntities(entityIds: readonly string[], primaryEntityId: string | null): void;
  focusEntity(entityId: string): Promise<void>;
  focusHotspot(annotationId: string): Promise<void>;
  focusHotspotProxy(annotationId: string): boolean;
  getHotspotViewState(annotationId: string): HotspotViewState;
  activateHotspot(
    annotationId: string,
    origin?: HotspotActivationOrigin,
  ): Promise<HotspotActivationEvent>;
  startHotspotPlacement(): HotspotSessionEvidence;
  startHotspotReposition(annotationId: string): HotspotSessionEvidence;
  updateHotspotReticle(clientX: number, clientY: number): void;
  acceptHotspotReticle(): boolean;
  cancelHotspotSession(): void;
  finishHotspotDraft(sessionId: number): boolean;
  acknowledgeHotspotCancellation(sessionId: number): boolean;
  setTool(tool: AuthoringTool): void;
  getTool(): AuthoringTool;
  isTransformDragging(): boolean;
  setTransformSettings(settings: AuthoringTransformSettings): void;
  setSmartAlignEnabled(enabled: boolean): void;
  getEntitySpatialSnapshots(entityIds: readonly string[]): readonly EntitySpatialSnapshot[];
  setDataRuntimeEnabled(enabled: boolean): Promise<void>;
  setAuthoringMode(mode: AuthoringMode): void;
  setThemeBackground(color: string | null): void;
  setBackgroundPreview(color: string | null): void;
  setGridPreview(visible: boolean | null): void;
  setLightingPreview(lighting: SceneLighting | null): void;
  setAuthoredLightPropertyPreview(preview: AuthoredLightPropertyPreview | null): boolean;
  getLightCreationFrame(): Readonly<LightCreationFrame> | null;
  setView(viewId: string): Promise<void>;
  getSnapshot(): AuthoringViewerSnapshot;
}

export interface AuthoringSceneProps {
  readonly source: SceneSource;
  readonly adapters?: Readonly<Record<string, DataAdapter>>;
  readonly assetResolver?: AssetResolver;
  readonly canvasLabel?: string;
  readonly className?: string;
  readonly style?: CSSProperties;
  readonly pixelRatio?: number;
  readonly reducedMotion?: boolean;
  readonly initialTool?: AuthoringTool;
  readonly authoringMode?: AuthoringMode;
  readonly dataRuntimeEnabled?: boolean;
  readonly hotspotAuthority?: HotspotAuthorityContext;
  readonly hotspotOrder?: readonly string[];
  readonly themeBackground?: string | null;
  readonly backgroundPreview?: string | null;
  readonly gridPreview?: boolean | null;
  readonly lightingPreview?: SceneLighting | null;
  readonly selectedEntityIds?: readonly string[];
  readonly primaryEntityId?: string | null;
  readonly transformSettings?: AuthoringTransformSettings;
  readonly smartAlignEnabled?: boolean;
  readonly onReady?: (event: ReadyEvent) => void;
  readonly onSelectionChange?: (event: SelectionEvent) => void;
  readonly onBindingStateChange?: (event: BindingStateEvent) => void;
  readonly onTransformPreview?: (event: PreviewEvent) => void;
  readonly onTransformCommit?: (event: CommitEvent) => void;
  readonly onHotspotPlacementPreview?: (event: HotspotPreviewEvent) => void;
  readonly onHotspotSessionStart?: (event: HotspotSessionStartEvent) => void;
  readonly onHotspotPlacementAccept?: (event: HotspotAcceptEvent) => void;
  readonly onHotspotSessionCancel?: (event: HotspotCancelEvent) => void;
  readonly onHotspotSelectionRequest?: (event: HotspotSelectionEvent) => void;
  readonly onHotspotActivation?: (event: HotspotActivationEvent) => void;
  readonly onHotspotContent?: (event: HotspotContentEvent) => void;
  readonly onHotspotHostContentRequest?: (event: HotspotHostContentEvent) => void;
  readonly onDiagnostic?: (diagnostic: Diagnostic) => void;
  readonly onEvent?: (event: AuthoringViewerEvent) => void;
}

export const AuthoringScene = /* @__PURE__ */ forwardRef<AuthoringSceneHandle, AuthoringSceneProps>(
  function AuthoringScene(props, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const viewerRef = useRef<RuntimeAuthoringViewer | null>(null);
    const callbacksRef = useRef(callbacks(props));
    const sourceLoadRef = useRef<Promise<void> | null>(null);
    const adaptersRef = useRef<Readonly<Record<string, DataAdapter>>>({});
    const runtimeReconciliationRef = useRef(0);
    const hotspotOrderKeyRef = useRef<string | null>(null);
    const initialOptionsRef = useRef({
      assetResolver: props.assetResolver,
      authoringMode: props.authoringMode,
      canvasLabel: props.canvasLabel,
      dataRuntimeEnabled: props.dataRuntimeEnabled,
      initialTool: props.initialTool,
      hotspotAuthority: props.hotspotAuthority,
      hotspotOrder: props.hotspotOrder,
      pixelRatio: props.pixelRatio,
      reducedMotion: props.reducedMotion,
    });
    callbacksRef.current = callbacks(props);

    useLayoutEffect(() => {
      const container = containerRef.current;
      if (container === null) return;
      const options = initialOptionsRef.current;
      const viewer = createAuthoringSceneViewer(container, {
        ...(options.assetResolver === undefined ? {} : { assetResolver: options.assetResolver }),
        ...(options.canvasLabel === undefined ? {} : { canvasLabel: options.canvasLabel }),
        ...(options.authoringMode === undefined ? {} : { authoringMode: options.authoringMode }),
        ...(options.dataRuntimeEnabled === undefined
          ? {}
          : { dataRuntimeEnabled: options.dataRuntimeEnabled }),
        ...(options.initialTool === undefined ? {} : { initialTool: options.initialTool }),
        ...(options.hotspotAuthority === undefined
          ? {}
          : { hotspotAuthority: options.hotspotAuthority }),
        ...(options.hotspotOrder === undefined ? {} : { hotspotOrder: options.hotspotOrder }),
        ...(options.pixelRatio === undefined ? {} : { pixelRatio: options.pixelRatio }),
        ...(options.reducedMotion === undefined ? {} : { reducedMotion: options.reducedMotion }),
        onEvent: (event) => dispatch(callbacksRef.current, event),
      });
      viewerRef.current = viewer;
      hotspotOrderKeyRef.current = orderKey(options.hotspotOrder);
      adaptersRef.current = {};

      return () => {
        if (viewerRef.current === viewer) viewerRef.current = null;
        void viewer.dispose();
      };
    }, []);

    useEffect(() => {
      const viewer = viewerRef.current;
      if (viewer === null) return;
      const loading = viewer.load(props.source);
      sourceLoadRef.current = loading;
      void loading.then(
        () => {
          if (sourceLoadRef.current === loading) sourceLoadRef.current = null;
        },
        () => {
          if (sourceLoadRef.current === loading) sourceLoadRef.current = null;
        },
      );
    }, [props.source]);

    useEffect(() => {
      viewerRef.current?.setCanvasLabel(props.canvasLabel ?? "Interactive 3D scene");
    }, [props.canvasLabel]);

    useEffect(() => {
      viewerRef.current?.setThemeBackground(props.themeBackground ?? null);
    }, [props.themeBackground]);

    useEffect(() => {
      viewerRef.current?.setBackgroundPreview(props.backgroundPreview ?? null);
    }, [props.backgroundPreview]);

    useEffect(() => {
      viewerRef.current?.setGridPreview(props.gridPreview ?? null);
    }, [props.gridPreview]);

    useEffect(() => {
      viewerRef.current?.setLightingPreview(props.lightingPreview ?? null);
    }, [props.lightingPreview]);

    useEffect(() => {
      viewerRef.current?.setAuthoringMode(props.authoringMode ?? "edit");
    }, [props.authoringMode]);

    useEffect(() => {
      viewerRef.current?.setHotspotAuthority(
        props.hotspotAuthority ?? { projectId: null, sourceId: null },
      );
    }, [props.hotspotAuthority]);

    useEffect(() => {
      const key = orderKey(props.hotspotOrder);
      if (hotspotOrderKeyRef.current === key) return;
      hotspotOrderKeyRef.current = key;
      viewerRef.current?.setHotspotOrder(props.hotspotOrder ?? []);
    }, [props.hotspotOrder]);

    useEffect(() => {
      const viewer = viewerRef.current;
      if (viewer === null) return;
      let current = true;
      const reconcile = (): void => {
        if (!current || viewerRef.current !== viewer) return;
        reconcileAuthoringSceneSelection(viewer, props.selectedEntityIds, props.primaryEntityId);
      };
      const loading = sourceLoadRef.current;
      if (loading === null) reconcile();
      else {
        void reconcileAuthoringSceneSelectionAfterLoad(
          viewer,
          loading,
          props.selectedEntityIds,
          props.primaryEntityId,
          () => current && viewerRef.current === viewer,
        ).catch(() => undefined);
      }
      return () => {
        current = false;
      };
    }, [props.primaryEntityId, props.selectedEntityIds, props.source]);

    useEffect(() => {
      const viewer = viewerRef.current;
      if (viewer === null) return;
      reconcileAuthoringTransformSettings(viewer, props.transformSettings);
    }, [props.transformSettings]);

    useEffect(() => {
      const viewer = viewerRef.current;
      if (viewer !== null) reconcileAuthoringSmartAlign(viewer, props.smartAlignEnabled);
    }, [props.smartAlignEnabled]);

    useEffect(() => {
      const viewer = viewerRef.current;
      if (viewer === null) return;
      const nextAdapters = props.adapters ?? {};
      const generation = runtimeReconciliationRef.current + 1;
      runtimeReconciliationRef.current = generation;
      void reconcileAuthoringSceneRuntime(
        viewer,
        adaptersRef.current,
        nextAdapters,
        props.dataRuntimeEnabled ?? false,
        () => viewerRef.current === viewer && runtimeReconciliationRef.current === generation,
      ).catch(() => undefined);
      adaptersRef.current = nextAdapters;
      return () => {
        if (runtimeReconciliationRef.current === generation) {
          runtimeReconciliationRef.current += 1;
        }
      };
    }, [props.adapters, props.dataRuntimeEnabled]);

    useImperativeHandle(
      ref,
      () => ({
        selectEntity(entityId) {
          requiredViewer(viewerRef).selectEntity(entityId);
        },
        selectEntities(entityIds, primaryEntityId) {
          requiredViewer(viewerRef).selectEntities(entityIds, primaryEntityId);
        },
        focusEntity(entityId) {
          return requiredViewer(viewerRef).focusEntity(entityId, { select: true });
        },
        focusHotspot(annotationId) {
          return requiredViewer(viewerRef).focusHotspot(annotationId);
        },
        focusHotspotProxy(annotationId) {
          return requiredViewer(viewerRef).focusHotspotProxy(annotationId);
        },
        getHotspotViewState(annotationId) {
          return requiredViewer(viewerRef).getHotspotViewState(annotationId);
        },
        activateHotspot(annotationId, origin) {
          return requiredViewer(viewerRef).activateHotspot(annotationId, origin);
        },
        startHotspotPlacement() {
          return requiredViewer(viewerRef).startHotspotPlacement();
        },
        startHotspotReposition(annotationId) {
          return requiredViewer(viewerRef).startHotspotReposition(annotationId);
        },
        updateHotspotReticle(clientX, clientY) {
          requiredViewer(viewerRef).updateHotspotReticle(clientX, clientY);
        },
        acceptHotspotReticle() {
          return requiredViewer(viewerRef).acceptHotspotReticle();
        },
        cancelHotspotSession() {
          requiredViewer(viewerRef).cancelHotspotSession();
        },
        finishHotspotDraft(sessionId) {
          return requiredViewer(viewerRef).finishHotspotDraft(sessionId);
        },
        acknowledgeHotspotCancellation(sessionId) {
          return requiredViewer(viewerRef).acknowledgeHotspotCancellation(sessionId);
        },
        setTool(tool) {
          requiredViewer(viewerRef).setTool(tool);
        },
        getTool() {
          return requiredViewer(viewerRef).getTool();
        },
        isTransformDragging() {
          return requiredViewer(viewerRef).isTransformDragging();
        },
        setTransformSettings(settings) {
          requiredViewer(viewerRef).setTransformSettings(settings);
        },
        setSmartAlignEnabled(enabled) {
          requiredViewer(viewerRef).setSmartAlignEnabled(enabled);
        },
        getEntitySpatialSnapshots(entityIds) {
          return requiredViewer(viewerRef).getEntitySpatialSnapshots(entityIds);
        },
        setDataRuntimeEnabled(enabled) {
          return requiredViewer(viewerRef).setDataRuntimeEnabled(enabled);
        },
        setAuthoringMode(mode) {
          requiredViewer(viewerRef).setAuthoringMode(mode);
        },
        setThemeBackground(color) {
          requiredViewer(viewerRef).setThemeBackground(color);
        },
        setBackgroundPreview(color) {
          requiredViewer(viewerRef).setBackgroundPreview(color);
        },
        setGridPreview(visible) {
          requiredViewer(viewerRef).setGridPreview(visible);
        },
        setLightingPreview(lighting) {
          requiredViewer(viewerRef).setLightingPreview(lighting);
        },
        setAuthoredLightPropertyPreview(preview) {
          return requiredViewer(viewerRef).setAuthoredLightPropertyPreview(preview);
        },
        getLightCreationFrame() {
          return requiredViewer(viewerRef).getLightCreationFrame();
        },
        setView(viewId) {
          return requiredViewer(viewerRef).setView(viewId);
        },
        getSnapshot() {
          return requiredViewer(viewerRef).getSnapshot();
        },
      }),
      [],
    );

    return (
      <div
        ref={containerRef}
        className={props.className}
        data-web3d-react-authoring="true"
        style={props.style}
      />
    );
  },
);

interface AuthoringCallbacks {
  readonly onReady: AuthoringSceneProps["onReady"];
  readonly onSelectionChange: AuthoringSceneProps["onSelectionChange"];
  readonly onBindingStateChange: AuthoringSceneProps["onBindingStateChange"];
  readonly onTransformPreview: AuthoringSceneProps["onTransformPreview"];
  readonly onTransformCommit: AuthoringSceneProps["onTransformCommit"];
  readonly onHotspotPlacementPreview: AuthoringSceneProps["onHotspotPlacementPreview"];
  readonly onHotspotSessionStart: AuthoringSceneProps["onHotspotSessionStart"];
  readonly onHotspotPlacementAccept: AuthoringSceneProps["onHotspotPlacementAccept"];
  readonly onHotspotSessionCancel: AuthoringSceneProps["onHotspotSessionCancel"];
  readonly onHotspotSelectionRequest: AuthoringSceneProps["onHotspotSelectionRequest"];
  readonly onHotspotActivation: AuthoringSceneProps["onHotspotActivation"];
  readonly onHotspotContent: AuthoringSceneProps["onHotspotContent"];
  readonly onHotspotHostContentRequest: AuthoringSceneProps["onHotspotHostContentRequest"];
  readonly onDiagnostic: AuthoringSceneProps["onDiagnostic"];
  readonly onEvent: AuthoringSceneProps["onEvent"];
}

function callbacks(props: AuthoringSceneProps): AuthoringCallbacks {
  return {
    onReady: props.onReady,
    onSelectionChange: props.onSelectionChange,
    onBindingStateChange: props.onBindingStateChange,
    onTransformPreview: props.onTransformPreview,
    onTransformCommit: props.onTransformCommit,
    onHotspotPlacementPreview: props.onHotspotPlacementPreview,
    onHotspotSessionStart: props.onHotspotSessionStart,
    onHotspotPlacementAccept: props.onHotspotPlacementAccept,
    onHotspotSessionCancel: props.onHotspotSessionCancel,
    onHotspotSelectionRequest: props.onHotspotSelectionRequest,
    onHotspotActivation: props.onHotspotActivation,
    onHotspotContent: props.onHotspotContent,
    onHotspotHostContentRequest: props.onHotspotHostContentRequest,
    onDiagnostic: props.onDiagnostic,
    onEvent: props.onEvent,
  };
}

function dispatch(callbacks: AuthoringCallbacks, event: AuthoringViewerEvent): void {
  callbacks.onEvent?.(event);
  if (event.type === "ready") callbacks.onReady?.(event);
  if (event.type === "entity-selection-change") callbacks.onSelectionChange?.(event);
  if (event.type === "binding-state-change") callbacks.onBindingStateChange?.(event);
  if (event.type === "transform-preview") callbacks.onTransformPreview?.(event);
  if (event.type === "transform-commit") callbacks.onTransformCommit?.(event);
  if (event.type === "hotspot-placement-preview") callbacks.onHotspotPlacementPreview?.(event);
  if (event.type === "hotspot-session-start") callbacks.onHotspotSessionStart?.(event);
  if (event.type === "hotspot-placement-accept") callbacks.onHotspotPlacementAccept?.(event);
  if (event.type === "hotspot-session-cancel") callbacks.onHotspotSessionCancel?.(event);
  if (event.type === "hotspot-selection-request") callbacks.onHotspotSelectionRequest?.(event);
  if (event.type === "hotspot-activation") callbacks.onHotspotActivation?.(event);
  if (event.type === "hotspot-content") callbacks.onHotspotContent?.(event);
  if (event.type === "hotspot-host-content-request") {
    callbacks.onHotspotHostContentRequest?.(event);
  }
  if (event.type === "diagnostic") callbacks.onDiagnostic?.(event.diagnostic);
}

function requiredViewer(ref: {
  readonly current: RuntimeAuthoringViewer | null;
}): RuntimeAuthoringViewer {
  if (ref.current === null) throw new Error("AuthoringScene is not mounted.");
  return ref.current;
}

function orderKey(order: readonly string[] | undefined): string {
  return JSON.stringify(order ?? []);
}
