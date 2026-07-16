import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  type CSSProperties,
} from "react";

import {
  createSceneViewer,
  type AssetResolver,
  type DataAdapter,
  type Diagnostic,
  type SceneSource,
  type SceneViewer as RuntimeViewer,
  type ViewerEvent,
  type ViewerSnapshot,
} from "@web3d/runtime";
import type { SceneLighting } from "@web3d/document";

type ReadyEvent = Extract<ViewerEvent, { type: "ready" }>;
type SelectionEvent = Extract<ViewerEvent, { type: "selection-change" }>;
type AlarmEvent = Extract<ViewerEvent, { type: "alarm" }>;

export interface SceneViewerHandle {
  selectTarget(targetId: string | null): void;
  focusTarget(targetId: string): Promise<void>;
  setThemeBackground(color: string | null): void;
  setBackgroundPreview(color: string | null): void;
  setGridPreview(visible: boolean | null): void;
  setLightingPreview(lighting: SceneLighting | null): void;
  setView(viewId: string): Promise<void>;
  getSnapshot(): ViewerSnapshot;
}

export interface SceneViewerProps {
  readonly source: SceneSource;
  readonly adapters?: Readonly<Record<string, DataAdapter>>;
  readonly assetResolver?: AssetResolver;
  readonly canvasLabel?: string;
  readonly className?: string;
  readonly style?: CSSProperties;
  readonly pixelRatio?: number;
  readonly reducedMotion?: boolean;
  readonly themeBackground?: string | null;
  readonly backgroundPreview?: string | null;
  readonly gridPreview?: boolean | null;
  readonly lightingPreview?: SceneLighting | null;
  readonly onReady?: (event: ReadyEvent) => void;
  readonly onSelectionChange?: (event: SelectionEvent) => void;
  readonly onAlarm?: (event: AlarmEvent) => void;
  readonly onDiagnostic?: (diagnostic: Diagnostic) => void;
  readonly onEvent?: (event: ViewerEvent) => void;
}

export const SceneViewer = forwardRef<SceneViewerHandle, SceneViewerProps>(
  function SceneViewer(props, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const viewerRef = useRef<RuntimeViewer | null>(null);
    const callbacksRef = useRef(callbacks(props));
    const adaptersRef = useRef<Readonly<Record<string, DataAdapter>>>({});
    const initialOptionsRef = useRef({
      assetResolver: props.assetResolver,
      canvasLabel: props.canvasLabel,
      pixelRatio: props.pixelRatio,
      reducedMotion: props.reducedMotion,
    });
    callbacksRef.current = callbacks(props);

    useLayoutEffect(() => {
      const container = containerRef.current;
      if (container === null) return;
      const options = initialOptionsRef.current;
      const viewer = createSceneViewer(container, {
        ...(options.assetResolver === undefined ? {} : { assetResolver: options.assetResolver }),
        ...(options.canvasLabel === undefined ? {} : { canvasLabel: options.canvasLabel }),
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
      const viewer = viewerRef.current;
      if (viewer === null) return;
      reconcileAdapters(viewer, adaptersRef.current, props.adapters ?? {});
      adaptersRef.current = props.adapters ?? {};
    }, [props.adapters]);

    useImperativeHandle(
      ref,
      () => ({
        selectTarget(targetId) {
          requiredViewer(viewerRef).selectTarget(targetId);
        },
        focusTarget(targetId) {
          return requiredViewer(viewerRef).focusTarget(targetId, { select: true });
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
        data-web3d-react-viewer="true"
        style={props.style}
      />
    );
  },
);

interface ViewerCallbacks {
  readonly onReady: SceneViewerProps["onReady"];
  readonly onSelectionChange: SceneViewerProps["onSelectionChange"];
  readonly onAlarm: SceneViewerProps["onAlarm"];
  readonly onDiagnostic: SceneViewerProps["onDiagnostic"];
  readonly onEvent: SceneViewerProps["onEvent"];
}

function callbacks(props: SceneViewerProps): ViewerCallbacks {
  return {
    onReady: props.onReady,
    onSelectionChange: props.onSelectionChange,
    onAlarm: props.onAlarm,
    onDiagnostic: props.onDiagnostic,
    onEvent: props.onEvent,
  };
}

function dispatch(callbacks: ViewerCallbacks, event: ViewerEvent): void {
  callbacks.onEvent?.(event);
  if (event.type === "ready") callbacks.onReady?.(event);
  if (event.type === "selection-change") callbacks.onSelectionChange?.(event);
  if (event.type === "alarm") callbacks.onAlarm?.(event);
  if (event.type === "diagnostic") callbacks.onDiagnostic?.(event.diagnostic);
}

function reconcileAdapters(
  viewer: RuntimeViewer,
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

function requiredViewer(ref: { readonly current: RuntimeViewer | null }): RuntimeViewer {
  if (ref.current === null) throw new Error("SceneViewer is not mounted.");
  return ref.current;
}
