import type { Transform } from "@web3d/document";

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

export type AuthoringViewerEvent =
  | ViewerEvent
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
  activeTool: AuthoringTool;
}

export interface CreateViewerOptions {
  source?: SceneSource;
  assetResolver?: AssetResolver;
  adapters?: Record<string, DataAdapter>;
  pixelRatio?: number;
  reducedMotion?: boolean;
  onEvent?: (event: ViewerEvent) => void;
}

export interface CreateAuthoringViewerOptions extends Omit<CreateViewerOptions, "onEvent"> {
  initialTool?: AuthoringTool;
  onEvent?: (event: AuthoringViewerEvent) => void;
}

export interface SceneViewer {
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

export interface AuthoringSceneViewer {
  load(source: SceneSource): Promise<void>;
  setAdapter(sourceId: string, adapter: DataAdapter | null): Promise<void>;
  selectEntity(entityId: string | null): void;
  focusEntity(entityId: string, options?: FocusOptions): Promise<void>;
  setTool(tool: AuthoringTool): void;
  getTool(): AuthoringTool;
  setView(viewId: string): Promise<void>;
  getSnapshot(): AuthoringViewerSnapshot;
  getDiagnostics(): readonly Diagnostic[];
  resize(): void;
  dispose(): Promise<void>;
}
