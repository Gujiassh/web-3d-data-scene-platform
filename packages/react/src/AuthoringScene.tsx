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

type ReadyEvent = Extract<AuthoringViewerEvent, { type: "ready" }>;
type SelectionEvent = Extract<AuthoringViewerEvent, { type: "entity-selection-change" }>;
type PreviewEvent = Extract<AuthoringViewerEvent, { type: "transform-preview" }>;
type CommitEvent = Extract<AuthoringViewerEvent, { type: "transform-commit" }>;

export interface AuthoringSceneHandle {
  selectEntity(entityId: string | null): void;
  focusEntity(entityId: string): Promise<void>;
  setTool(tool: AuthoringTool): void;
  getTool(): AuthoringTool;
  setView(viewId: string): Promise<void>;
  getSnapshot(): AuthoringViewerSnapshot;
}

export interface AuthoringSceneProps {
  readonly source: SceneSource;
  readonly adapters?: Readonly<Record<string, DataAdapter>>;
  readonly assetResolver?: AssetResolver;
  readonly className?: string;
  readonly style?: CSSProperties;
  readonly pixelRatio?: number;
  readonly reducedMotion?: boolean;
  readonly initialTool?: AuthoringTool;
  readonly onReady?: (event: ReadyEvent) => void;
  readonly onSelectionChange?: (event: SelectionEvent) => void;
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
    const initialOptionsRef = useRef({
      assetResolver: props.assetResolver,
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
      const viewer = viewerRef.current;
      if (viewer === null) return;
      reconcileAdapters(viewer, adaptersRef.current, props.adapters ?? {});
      adaptersRef.current = props.adapters ?? {};
    }, [props.adapters]);

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
  readonly onTransformPreview: AuthoringSceneProps["onTransformPreview"];
  readonly onTransformCommit: AuthoringSceneProps["onTransformCommit"];
  readonly onDiagnostic: AuthoringSceneProps["onDiagnostic"];
  readonly onEvent: AuthoringSceneProps["onEvent"];
}

function callbacks(props: AuthoringSceneProps): AuthoringCallbacks {
  return {
    onReady: props.onReady,
    onSelectionChange: props.onSelectionChange,
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
  if (event.type === "transform-preview") callbacks.onTransformPreview?.(event);
  if (event.type === "transform-commit") callbacks.onTransformCommit?.(event);
  if (event.type === "diagnostic") callbacks.onDiagnostic?.(event.diagnostic);
}

function reconcileAdapters(
  viewer: RuntimeAuthoringViewer,
  previous: Readonly<Record<string, DataAdapter>>,
  next: Readonly<Record<string, DataAdapter>>,
): void {
  for (const sourceId of Object.keys(previous)) {
    if (!(sourceId in next)) void viewer.setAdapter(sourceId, null).catch(() => undefined);
  }
  for (const [sourceId, adapter] of Object.entries(next)) {
    if (previous[sourceId] !== adapter) {
      void viewer.setAdapter(sourceId, adapter).catch(() => undefined);
    }
  }
}

function requiredViewer(ref: {
  readonly current: RuntimeAuthoringViewer | null;
}): RuntimeAuthoringViewer {
  if (ref.current === null) throw new Error("AuthoringScene is not mounted.");
  return ref.current;
}
