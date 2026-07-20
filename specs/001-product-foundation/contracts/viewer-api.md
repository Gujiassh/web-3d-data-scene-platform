# Viewer API Contract

> Status: Implemented SceneDocument 1.4 / Feature 008 baseline

## Framework-Neutral API

```ts
interface CreateViewerOptions {
  source?: SceneDocument;
  assetResolver?: AssetResolver;
  adapters?: Record<string, DataAdapter>;
  canvasLabel?: string;
  pixelRatio?: number;
  reducedMotion?: boolean;
  onEvent?: (event: ViewerEvent) => void;
}

interface SceneViewer {
  load(source: SceneDocument): Promise<void>;
  setAdapter(sourceId: string, adapter: DataAdapter | null): Promise<void>;
  setThemeBackground(color: string | null): void;
  setBackgroundPreview(color: string | null): void;
  setGridPreview(visible: boolean | null): void;
  setLightingPreview(lighting: SceneLighting | null): void;
  setCanvasLabel(label: string): void;
  selectTarget(targetId: string | null): void;
  focusTarget(targetId: string, options?: FocusOptions): Promise<void>;
  focusHotspot(annotationId: string, options?: FocusOptions): Promise<void>;
  activateHotspot(
    annotationId: string,
    origin?: HotspotActivationOrigin,
  ): Promise<HotspotActivationEvent>;
  setView(viewId: string): Promise<void>;
  getSnapshot(): ViewerSnapshot;
  getDiagnostics(): readonly Diagnostic[];
  resize(): void;
  dispose(): Promise<void>;
}

function createSceneViewer(container: HTMLElement, options?: CreateViewerOptions): SceneViewer;
```

`SceneSource` is exactly one validated `SceneDocument`; Runtime does not fetch URLs or parse ZIPs. A host that consumes a
published bundle first calls `loadPublishedScene`, then gives its verified document and AssetResolver to Runtime:

```ts
const published = await loadPublishedScene({ baseUrl: new URL("./published/", document.baseURI) });
const viewer = createSceneViewer(container, {
  assetResolver: published.assetResolver,
  adapters: hostAdapters,
  onEvent,
});
await viewer.load(published.document);
```

The optional creation-time `source` starts the same transactional load. A failed or superseded load rejects its Promise
without replacing the previous ready generation. `dispose` is idempotent; commands reject after disposal.

## Asset Resolver

```ts
interface AssetResolver {
  resolve(asset: SceneAsset, signal: AbortSignal): Promise<string | Blob>;
}
```

Runtime verifies returned bytes against the SceneAsset hash and byte length before activation. The published-scene
loader supplies a resolver that additionally restricts fetches to manifest-declared bundle paths. Authentication,
credentials and external object-storage URLs remain host concerns and never enter a publish manifest.

## Events

```ts
type ViewerEvent =
  | { type: "ready"; documentId: string; revision: number }
  | { type: "load-progress"; loaded: number; total?: number }
  | { type: "selection-change"; targetId: string | null; origin: "viewer" | "api" }
  | { type: "alarm"; transition: "opened" | "updated" | "cleared"; alarm: RuntimeAlarm }
  | { type: "connection-change"; sourceId: string; status: ConnectionStatus }
  | { type: "diagnostic"; diagnostic: Diagnostic }
  | { type: "performance"; sample: PerformanceSample }
  | HotspotActivationEvent
  | { type: "hotspot-content"; annotationId: string; title: string; text: string }
  | {
      type: "hotspot-host-content-request";
      annotationId: string;
      title: string;
      key: string;
    };
```

Events contain stable authored IDs and domain values, never Three.js objects. Host-content events carry only the opaque
trusted key; the host maps that key to local values. Alarm identity is `(targetId, bindingId, ruleId)`, and repeated data
with the same normalized result does not emit duplicate transitions.

## Focus And Selection

- `selectTarget` changes selection without moving the camera and emits `origin: "api"` only when state changes.
- `focusTarget` moves the camera and selects only when `options.select === true`.
- `focusHotspot` frames a resolved visible Surface hotspot; `activateHotspot` executes its declarative action.
- Viewer pointer selection emits `origin: "viewer"`; host commands emit `origin: "api"`.
- A new camera gesture or focus command cancels the current focus animation.
- Missing or hidden targets reject through stable diagnostics; Runtime does not guess by name or node order.

## Snapshot And Adapter Lifecycle

`getSnapshot` returns lifecycle, document ID/revision, selected target ID, connection health and current alarms. It does
not expose mutable renderer objects, raw payloads or Studio state.

`setAdapter` validates `adapter.sourceId === sourceId`. Add, replace and remove operations are serialized per source;
superseded work is aborted, subscriptions are released, and transient binding/alarm state clears before slow physical
adapter shutdown can complete.

## React Wrapper

```tsx
interface SceneViewerProps {
  source: SceneDocument;
  adapters?: Readonly<Record<string, DataAdapter>>;
  assetResolver?: AssetResolver;
  canvasLabel?: string;
  className?: string;
  style?: CSSProperties;
  pixelRatio?: number;
  reducedMotion?: boolean;
  themeBackground?: string | null;
  backgroundPreview?: string | null;
  gridPreview?: boolean | null;
  lightingPreview?: SceneLighting | null;
  onReady?: (event: ReadyEvent) => void;
  onSelectionChange?: (event: SelectionEvent) => void;
  onAlarm?: (event: AlarmEvent) => void;
  onHotspotActivation?: (event: HotspotActivationEvent) => void;
  onHotspotContent?: (event: HotspotContentEvent) => void;
  onHotspotHostContentRequest?: (event: HotspotHostContentEvent) => void;
  onDiagnostic?: (diagnostic: Diagnostic) => void;
  onEvent?: (event: ViewerEvent) => void;
}

interface SceneViewerHandle {
  selectTarget(targetId: string | null): void;
  focusTarget(targetId: string): Promise<void>;
  focusHotspot(annotationId: string): Promise<void>;
  activateHotspot(
    annotationId: string,
    origin?: HotspotActivationOrigin,
  ): Promise<HotspotActivationEvent>;
  setThemeBackground(color: string | null): void;
  setBackgroundPreview(color: string | null): void;
  setGridPreview(visible: boolean | null): void;
  setLightingPreview(lighting: SceneLighting | null): void;
  setView(viewId: string): Promise<void>;
  getSnapshot(): ViewerSnapshot;
}
```

- The wrapper creates one Runtime Viewer per mounted container and disposes that same instance on unmount.
- `source`, adapters, canvas label and visual preview props reconcile in place without recreating Runtime.
- `assetResolver`, `pixelRatio` and `reducedMotion` are creation-time options; remount to replace them.
- The imperative `focusTarget` intentionally focuses with selection enabled.
- Callback props dispatch the same `ViewerEvent` after the generic `onEvent` callback.
- StrictMode setup/cleanup remains idempotent and suppresses stale async results.

## Host Responsibilities

The host owns authentication, business routing, trusted-content values, equipment detail UI, alarm acknowledgement,
permissions, adapter credentials and persistence of runtime events. Viewer does not make control decisions, save Studio
state or send commands to industrial equipment.
