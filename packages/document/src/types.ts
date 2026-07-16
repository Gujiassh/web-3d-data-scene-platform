export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  JsonPrimitive | readonly JsonValue[] | { readonly [key: string]: JsonValue };
export type Metadata = Readonly<Record<string, JsonPrimitive>>;
export type Vec3 = readonly [number, number, number];
export type Quaternion = readonly [number, number, number, number];

export interface Transform {
  readonly position: Vec3;
  readonly rotation: Quaternion;
  readonly scale: Vec3;
}

export interface AssetStats {
  readonly nodeCount: number;
  readonly meshCount: number;
  readonly materialCount: number;
  readonly triangleCount: number;
}

export interface SceneAsset {
  readonly id: string;
  readonly name: string;
  readonly uri: string;
  readonly mediaType: "model/gltf-binary" | "model/gltf+json";
  readonly sha256: string;
  readonly byteLength: number;
  readonly stats?: AssetStats;
}

interface EntityBase {
  readonly id: string;
  readonly parentId: string | null;
  readonly name: string;
  readonly visible: boolean;
  readonly locked: boolean;
  readonly transform: Transform;
  readonly metadata: Metadata;
}

export interface GroupEntity extends EntityBase {
  readonly type: "group";
}

export interface AssetEntity extends EntityBase {
  readonly type: "asset";
  readonly assetId: string;
}

export type SceneEntity = GroupEntity | AssetEntity;

export interface SceneTarget {
  readonly id: string;
  readonly entityId: string;
  readonly name: string;
  readonly businessId?: string;
  readonly assetHash: string;
  readonly nodeIndex: number | null;
  readonly metadata: Metadata;
}

export interface MockDataSourceOptions {
  readonly scenario: string;
  readonly seed?: number;
  readonly defaultSpeed?: number;
}

export interface WebSocketDataSourceOptions {
  readonly channel?: string;
  readonly protocolVersion?: string;
}

interface DataSourceBase {
  readonly id: string;
  readonly name: string;
  readonly staleAfterMs: number;
  readonly offlineAfterMs: number;
}

export interface MockDataSource extends DataSourceBase {
  readonly adapter: "mock";
  readonly options: MockDataSourceOptions;
}

export interface WebSocketDataSource extends DataSourceBase {
  readonly adapter: "websocket";
  readonly options: WebSocketDataSourceOptions;
}

export type DataSource = MockDataSource | WebSocketDataSource;
export type EffectType = "color" | "visibility" | "label" | "alarm" | "animation";

export interface Binding {
  readonly id: string;
  readonly targetId: string;
  readonly sourceId: string;
  readonly pointer: string;
  readonly ruleSetId: string;
  readonly writes: readonly EffectType[];
  readonly enabled: boolean;
}

export type ConditionFact = "value" | "quality" | "connection";
export type ComparisonOperator = "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "in";

export interface ComparisonCondition {
  readonly fact: ConditionFact;
  readonly operator: ComparisonOperator;
  readonly expected: JsonValue;
}

export interface ExistenceCondition {
  readonly fact: ConditionFact;
  readonly operator: "exists" | "notExists";
  readonly expected?: never;
}

export type RuleCondition = ComparisonCondition | ExistenceCondition;

export interface ColorEffect {
  readonly type: "color";
  readonly value: string;
}

export interface VisibilityEffect {
  readonly type: "visibility";
  readonly value: boolean;
}

export interface LabelEffect {
  readonly type: "label";
  readonly template: string;
}

export interface AlarmEffect {
  readonly type: "alarm";
  readonly level: "none" | "info" | "warning" | "critical";
  readonly message: string;
}

export interface AnimationEffect {
  readonly type: "animation";
  readonly clip: string;
  readonly playing: boolean;
}

export type RuleEffect =
  ColorEffect | VisibilityEffect | LabelEffect | AlarmEffect | AnimationEffect;

export interface Rule {
  readonly id: string;
  readonly priority: number;
  readonly when: RuleCondition;
  readonly effects: readonly RuleEffect[];
}

export interface RuleSet {
  readonly id: string;
  readonly name: string;
  readonly rules: readonly Rule[];
  readonly fallback: readonly RuleEffect[];
}

export interface Annotation {
  readonly id: string;
  readonly targetId: string;
  readonly title: string;
  readonly contentKey: string;
  readonly localOffset: Vec3;
}

export interface SceneView {
  readonly id: string;
  readonly name: string;
  readonly position: Vec3;
  readonly target: Vec3;
  readonly fov: number;
}

export interface SceneEnvironment {
  readonly backgroundMode: "theme" | "custom";
  readonly background: string;
  readonly grid: boolean;
  readonly unit: "mm" | "cm" | "m";
  readonly upAxis: "Y";
  readonly lighting: SceneLighting;
}

export interface SceneLighting {
  readonly fill: {
    readonly skyColor: string;
    readonly groundColor: string;
    readonly intensity: number;
  };
  readonly key: {
    readonly color: string;
    readonly intensity: number;
    readonly directionToLight: Vec3;
  };
}

export interface SceneDocument {
  readonly schemaVersion: "1.2.0";
  readonly id: string;
  readonly name: string;
  readonly revision: number;
  readonly assets: readonly SceneAsset[];
  readonly entities: readonly SceneEntity[];
  readonly targets: readonly SceneTarget[];
  readonly dataSources: readonly DataSource[];
  readonly bindings: readonly Binding[];
  readonly ruleSets: readonly RuleSet[];
  readonly annotations: readonly Annotation[];
  readonly views: readonly SceneView[];
  readonly environment: SceneEnvironment;
}
