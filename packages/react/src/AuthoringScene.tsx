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
  type AuthoringSceneViewer as RuntimeAuthoringViewer,
  type AuthoringTool,
  type AuthoringViewerEvent,
  type AuthoringViewerSnapshot,
  type DataAdapter,
  type Diagnostic,
  type SceneSource,
} from "@web3d/runtime";

import { reconcileAuthoringSceneRuntime } from "./authoring-runtime-reconciliation";

type ReadyEvent = Extract<AuthoringViewerEvent, { type: "ready" }>;
type SelectionEvent = Extract<AuthoringViewerEvent, { type: "entity-selection-change" }>;
type BindingStateEvent = Extract<AuthoringViewerEvent, { type: "binding-state-change" }>;
type PreviewEvent = Extract<AuthoringViewerEvent, { type: "transform-preview" }>;
type CommitEvent = Extract<AuthoringViewerEvent, { type: "transform-commit" }>;

export interface AuthoringSceneHandle {
  selectEntity(entityId: string | null): void;
  focusEntity(entityId: string): Promise<void>;
  setTool(tool: AuthoringTool): void;
  getTool(): AuthoringTool;
  setDataRuntimeEnabled(enabled: boolean): Promise<void>;
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
  readonly dataRuntimeEnabled?: boolean;
  readonly onReady?: (event: ReadyEvent) => void;
  readonly onSelectionChange?: (event: SelectionEvent) => void;
  readonly onBindingStateChange?: (event: BindingStateEvent) => void;
  readonly onTransformPreview?: (event: PreviewEvent) => void;
  readonly onTransformCommit?: (event: CommitEvent) => void;
  readonly onDiagnostic?: (diagnostic: Diagnostic) => void;
  readonly onEvent?: (event: AuthoringViewerEvent) => void;
}

export const AuthoringScene = /* @__PURE__ */ forwardRef<AuthoringSceneHandle, AuthoringSceneProps>(
  function AuthoringScene(props, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const viewerRef = useRef<RuntimeAuthoringViewer | null>(null);
    const callbacksRef = useRef(callbacks(props));
    const adaptersRef = useRef<Readonly<Record<string, DataAdapter>>>({});
    const runtimeReconciliationRef = useRef(0);
    const initialOptionsRef = useRef({
      assetResolver: props.assetResolver,
      canvasLabel: props.canvasLabel,
      dataRuntimeEnabled: props.dataRuntimeEnabled,
      initialTool: props.initialTool,
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
        ...(options.dataRuntimeEnabled === undefined
          ? {}
          : { dataRuntimeEnabled: options.dataRuntimeEnabled }),
        ...(options.initialTool === undefined ? {} : { initialTool: options.initialTool }),
        ...(options.pixelRatio === undefined ? {} : { pixelRatio: options.pixelRatio }),
        ...(options.reducedMotion === undefined ? {} : { reducedMotion: options.reducedMotion }),
        onEvent: (event) => dispatch(callbacksRef.current, event),
      });
      viewerRef.current = viewer;
      adaptersRef.current = {};

      return () => {
        if (viewerRef.current === viewer) viewerRef.current = null;
        void viewer.dispose();
      };
    }, []);

    useEffect(() => {
      const viewer = viewerRef.current;
      if (viewer === null) return;
      void viewer.load(props.source).catch(() => undefined);
    }, [props.source]);

    useEffect(() => {
      viewerRef.current?.setCanvasLabel(props.canvasLabel ?? "Interactive 3D scene");
    }, [props.canvasLabel]);

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
        focusEntity(entityId) {
          return requiredViewer(viewerRef).focusEntity(entityId, { select: true });
        },
        setTool(tool) {
          requiredViewer(viewerRef).setTool(tool);
        },
        getTool() {
          return requiredViewer(viewerRef).getTool();
        },
        setDataRuntimeEnabled(enabled) {
          return requiredViewer(viewerRef).setDataRuntimeEnabled(enabled);
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
  if (event.type === "diagnostic") callbacks.onDiagnostic?.(event.diagnostic);
}

function requiredViewer(ref: {
  readonly current: RuntimeAuthoringViewer | null;
}): RuntimeAuthoringViewer {
  if (ref.current === null) throw new Error("AuthoringScene is not mounted.");
  return ref.current;
}
