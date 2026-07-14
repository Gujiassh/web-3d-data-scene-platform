# Viewer API Contract

> Status: MVP v1 design

## Framework-neutral API

```ts
interface CreateViewerOptions {
  source?: SceneSource;
  assetResolver?: AssetResolver;
  adapters?: Record<string, DataAdapter>;
  pixelRatio?: number;
  reducedMotion?: boolean;
  onEvent?: (event: ViewerEvent) => void;
}

interface SceneViewer {
  load(source: SceneSource): Promise<void>;
  setAdapter(sourceId: string, adapter: DataAdapter | null): Promise<void>;
  selectTarget(targetId: string | null): void;
  focusTarget(targetId: string, options?: FocusOptions): Promise<void>;
  setView(viewId: string): Promise<void>;
  getSnapshot(): ViewerSnapshot;
  getDiagnostics(): readonly Diagnostic[];
  resize(): void;
  dispose(): Promise<void>;
}

function createSceneViewer(container: HTMLElement, options?: CreateViewerOptions): SceneViewer;
```

## Scene Sources

`SceneSource` supports:

- A validated SceneDocument object.
- A URL to `scene.json` plus an AssetResolver.
- A ZIP Blob/File containing `manifest.json`, `scene.json` and `assets/`.

Loading is transactional. A failed load rejects its Promise and leaves the previous ready scene
active. `dispose` is idempotent; all other commands reject after disposal.

## Asset Resolver

```ts
interface AssetResolver {
  resolve(asset: SceneAsset, signal: AbortSignal): Promise<string | Blob>;
}
```

The resolver is responsible for authenticated URLs or object storage integration. Viewer validates
the returned content against the asset hash before activation.

## Events

```ts
type ViewerEvent =
  | { type: "ready"; documentId: string; revision: number }
  | { type: "load-progress"; loaded: number; total?: number }
  | { type: "selection-change"; targetId: string | null; origin: "viewer" | "api" }
  | { type: "alarm"; transition: "opened" | "updated" | "cleared"; alarm: RuntimeAlarm }
  | { type: "connection-change"; sourceId: string; status: ConnectionStatus }
  | { type: "diagnostic"; diagnostic: Diagnostic }
  | { type: "performance"; sample: PerformanceSample };
```

Events contain stable target IDs and domain values, never Object3D instances. Event delivery order
matches accepted runtime state transitions.

Alarm identity is `(targetId, bindingId, ruleId)`. Viewer emits transitions only when the normalized
alarm state changes; repeated data with the same result does not emit duplicate alarm events.

## Focus and Selection

- `selectTarget` changes selection without moving the camera.
- `focusTarget` moves the camera and selects only when `select: true` is passed.
- A new user camera gesture or focus command cancels the current focus animation.
- Missing targets reject with a stable diagnostic code.
- Hidden targets can be selected through API but cannot be focused until made visible by current
  rules; Viewer reports this explicitly.

## Viewer Snapshot

`getSnapshot` returns read-only diagnostic state: lifecycle, document ID/revision, selected target,
connection health and current alarms. It does not expose mutable renderer objects or the full live
data payload.

## React Wrapper

```tsx
type SceneViewerProps = {
  source: SceneSource;
  adapters?: Record<string, DataAdapter>;
  className?: string;
  onReady?: (event: ReadyEvent) => void;
  onSelectionChange?: (event: SelectionChangeEvent) => void;
  onAlarm?: (event: AlarmEvent) => void;
  onDiagnostic?: (event: DiagnosticEvent) => void;
};

type SceneViewerHandle = Pick<
  SceneViewer,
  "selectTarget" | "focusTarget" | "setView" | "getSnapshot"
>;
```

- Prop identity changes do not recreate Viewer unless the container changes.
- Source changes call transactional `load`.
- Adapter map changes add, replace or remove only affected adapters.
- Unmount always calls `dispose` and suppresses late async updates.

## Host Responsibilities

The host owns authentication, business routing, equipment detail UI, alarm acknowledgement,
permissions, persistence of runtime events and data adapter credentials. Viewer does not make
control decisions or send commands to industrial equipment.
