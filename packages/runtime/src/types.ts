import type { Transform, Vec3 } from "@web3d/document";

import type { SceneAsset, SceneDocument } from "./document-contract";

export type JsonPrimitive = boolean | number | string | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type ConnectionStatus = "connecting" | "online" | "stale" | "offline" | "error";
export type DataQuality = "good" | "uncertain" | "bad";

export interface ConnectionEnvelope {
  kind: "connection";
  sourceId: string;
  status: ConnectionStatus;
  sourceTime?: string;
  detailCode?: string;
}

export interface SnapshotEnvelope {
  kind: "snapshot";
  sourceId: string;
  streamId: string;
  sequence: number;
  sourceTime?: string;
  quality: DataQuality;
  value: JsonValue;
}

export interface PatchEnvelope {
  kind: "patch";
  sourceId: string;
  streamId: string;
  sequence: number;
  sourceTime?: string;
  quality: DataQuality;
  changes: Array<{ pointer: string; value: JsonValue }>;
}

export type DataEnvelope = ConnectionEnvelope | SnapshotEnvelope | PatchEnvelope;

export type DiagnosticSeverity = "info" | "warning" | "error";

export type DiagnosticCode =
  | "ADAPTER_SOURCE_MISMATCH"
  | "ASSET_BYTE_LENGTH_MISMATCH"
  | "ASSET_HASH_MISMATCH"
  | "ASSET_LOAD_FAILED"
  | "ASSET_MEDIA_TYPE_UNSUPPORTED"
  | "ASSET_MULTISCENE_UNSUPPORTED"
  | "ASSET_NODE_MISSING"
  | "DATASOURCE_CONNECTION_FAILED"
  | "DATASOURCE_PATCH_INVALID"
  | "DATASOURCE_PATCH_OUT_OF_ORDER"
  | "DATASOURCE_STREAM_RETIRED"
  | "DATASOURCE_STREAM_UNKNOWN"
  | "DOCUMENT_REFERENCE_INVALID"
  | "ENTITY_HIDDEN"
  | "ENTITY_NOT_FOUND"
  | "RENDERER_CONTEXT_LOST"
  | "RULE_EVALUATION_FAILED"
  | "TARGET_HIDDEN"
  | "TARGET_NOT_FOUND"
  | "VIEW_NOT_FOUND"
  | "VIEWER_DISPOSED";

export interface Diagnostic {
  code: DiagnosticCode;
  severity: DiagnosticSeverity;
  source: "adapter" | "asset" | "document" | "renderer" | "rule" | "viewer";
  message: string;
  action?: string;
  assetId?: string;
  entityId?: string;
  targetId?: string;
  sourceId?: string;
  bindingId?: string;
  ruleId?: string;
  nodeIndex?: number;
}

export interface AdapterContext {
  signal: AbortSignal;
  now(): number;
  emitDiagnostic(diagnostic: Diagnostic): void;
}

export interface DataAdapter {
  readonly sourceId: string;
  start(context: AdapterContext): Promise<void>;
  subscribe(listener: (envelope: DataEnvelope) => void): () => void;
  stop(): Promise<void>;
}

export interface AssetResolver {
  resolve(asset: SceneAsset, signal: AbortSignal): Promise<string | Blob>;
}

export type SceneSource = SceneDocument;

export type AlarmLevel = "info" | "warning" | "critical";

export interface RuntimeAlarm {
  key: string;
  targetId: string;
  bindingId: string;
  ruleId: string;
  sourceId: string;
  level: AlarmLevel;
  message: string;
  sourceTime?: string;
}

export interface RuntimeBindingState {
  bindingId: string;
  targetId: string;
  sourceId: string;
  pointer: string;
  value: JsonValue | undefined;
  quality: DataQuality;
  connection: ConnectionStatus;
  ruleId: string;
  sourceTime?: string;
}

export type BindingStateChangeEvent =
  | { type: "binding-state-change"; transition: "updated"; state: RuntimeBindingState }
  | { type: "binding-state-change"; transition: "cleared"; bindingId: string };

export interface PerformanceSample {
  renderDurationMs: number;
  drawCalls: number;
  triangles: number;
}

export type ViewerEvent =
  | { type: "ready"; documentId: string; revision: number }
  | { type: "load-progress"; loaded: number; total?: number }
  | { type: "selection-change"; targetId: string | null; origin: "viewer" | "api" }
  | { type: "alarm"; transition: "opened" | "updated" | "cleared"; alarm: RuntimeAlarm }
  | { type: "connection-change"; sourceId: string; status: ConnectionStatus }
  | { type: "diagnostic"; diagnostic: Diagnostic }
  | { type: "performance"; sample: PerformanceSample };

export type AuthoringTool = "select" | "translate" | "rotate" | "scale";

export interface AuthoringTransformSettings {
  readonly translationSnap: number | null;
  readonly rotationSnapRadians: number | null;
  readonly scaleSnap: number | null;
}

export type WorldMatrix = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

export interface EntityWorldBounds {
  readonly min: Vec3;
  readonly max: Vec3;
}

export interface EntitySpatialSnapshot {
  readonly documentId: string;
  readonly documentRevision: number;
  readonly entityId: string;
  readonly parentId: string | null;
  readonly localTransform: Transform;
  readonly worldMatrix: WorldMatrix;
  readonly worldBounds: EntityWorldBounds | null;
  readonly worldPivot: Vec3;
  readonly visible: boolean;
  readonly locked: boolean;
}

export type AuthoringViewerEvent =
  | ViewerEvent
  | BindingStateChangeEvent
  | { type: "entity-selection-change"; entityId: string | null; origin: "viewport" | "api" }
  | { type: "tool-change"; tool: AuthoringTool }
  | { type: "transform-preview"; entityId: string; transform: Transform }
  | { type: "transform-commit"; entityId: string; before: Transform; after: Transform };

export interface FocusOptions {
  select?: boolean;
  durationMs?: number;
  padding?: number;
}

export type ViewerLifecycle = "created" | "loading" | "ready" | "updating" | "error" | "disposed";

export interface ViewerSnapshot {
  lifecycle: ViewerLifecycle;
  documentId: string | null;
  revision: number | null;
  selectedTargetId: string | null;
  connections: Readonly<Record<string, ConnectionStatus>>;
  alarms: readonly RuntimeAlarm[];
}

export interface AuthoringViewerSnapshot extends ViewerSnapshot {
  selectedEntityId: string | null;
  selectedEntityIds: readonly string[];
  primaryEntityId: string | null;
  activeTool: AuthoringTool;
  dataRuntimeEnabled: boolean;
  bindingStates: readonly RuntimeBindingState[];
}

export interface CreateViewerOptions {
  source?: SceneSource;
  assetResolver?: AssetResolver;
  adapters?: Record<string, DataAdapter>;
  canvasLabel?: string;
  pixelRatio?: number;
  reducedMotion?: boolean;
  onEvent?: (event: ViewerEvent) => void;
}

export interface CreateAuthoringViewerOptions extends Omit<CreateViewerOptions, "onEvent"> {
  initialTool?: AuthoringTool;
  dataRuntimeEnabled?: boolean;
  onEvent?: (event: AuthoringViewerEvent) => void;
}

export interface SceneViewer {
  load(source: SceneSource): Promise<void>;
  setAdapter(sourceId: string, adapter: DataAdapter | null): Promise<void>;
  setThemeBackground(color: string | null): void;
  setBackgroundPreview(color: string | null): void;
  setCanvasLabel(label: string): void;
  selectTarget(targetId: string | null): void;
  focusTarget(targetId: string, options?: FocusOptions): Promise<void>;
  setView(viewId: string): Promise<void>;
  getSnapshot(): ViewerSnapshot;
  getDiagnostics(): readonly Diagnostic[];
  resize(): void;
  dispose(): Promise<void>;
}

export interface AuthoringSceneViewer {
  load(source: SceneSource): Promise<void>;
  setAdapter(sourceId: string, adapter: DataAdapter | null): Promise<void>;
  setDataRuntimeEnabled(enabled: boolean): Promise<void>;
  setThemeBackground(color: string | null): void;
  setBackgroundPreview(color: string | null): void;
  setCanvasLabel(label: string): void;
  selectEntity(entityId: string | null): void;
  selectEntities(entityIds: readonly string[], primaryEntityId: string | null): void;
  focusEntity(entityId: string, options?: FocusOptions): Promise<void>;
  setTool(tool: AuthoringTool): void;
  getTool(): AuthoringTool;
  setTransformSettings(settings: AuthoringTransformSettings): void;
  getEntitySpatialSnapshots(entityIds: readonly string[]): readonly EntitySpatialSnapshot[];
  setView(viewId: string): Promise<void>;
  getSnapshot(): AuthoringViewerSnapshot;
  getDiagnostics(): readonly Diagnostic[];
  resize(): void;
  dispose(): Promise<void>;
}
