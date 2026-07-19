import type {
  Annotation,
  Binding,
  GroupEntity,
  LightEntity,
  MockDataSource,
  RuleSet,
  SceneAsset,
  SceneDocument,
  SceneEntity,
  SceneEnvironment,
  SceneTarget,
  Transform,
} from "../types.js";

export interface RenameDocumentCommand {
  readonly type: "rename-document";
  readonly name: string;
}

export interface SceneBackgroundSettings {
  readonly mode: "theme" | "custom";
  readonly color: string;
}

export interface SetSceneBackgroundCommand {
  readonly type: "set-scene-background";
  readonly before: SceneBackgroundSettings;
  readonly after: SceneBackgroundSettings;
}

export interface SetSceneEnvironmentCommand {
  readonly type: "set-scene-environment";
  readonly before: SceneEnvironment;
  readonly after: SceneEnvironment;
}

export interface RenameEntityCommand {
  readonly type: "rename-entity";
  readonly entityId: string;
  readonly name: string;
}

export interface SetEntityVisibilityCommand {
  readonly type: "set-entity-visibility";
  readonly entityId: string;
  readonly visible: boolean;
}

export interface SetEntityLockCommand {
  readonly type: "set-entity-lock";
  readonly entityId: string;
  readonly locked: boolean;
}

export interface TransformEntityCommand {
  readonly type: "transform-entity";
  readonly entityId: string;
  readonly before: Transform;
  readonly after: Transform;
}

export interface AddLightEntityCommand {
  readonly type: "add-light-entity";
  readonly after: LightEntity;
}

export interface UpdateLightEntityCommand {
  readonly type: "update-light-entity";
  readonly before: LightEntity;
  readonly after: LightEntity;
}

export interface RemoveLightEntityCommand {
  readonly type: "remove-light-entity";
  readonly before: LightEntity;
}

export interface AddAnnotationCommand {
  readonly type: "add-annotation";
  readonly after: Annotation;
}

export interface UpdateAnnotationCommand {
  readonly type: "update-annotation";
  readonly before: Annotation;
  readonly after: Annotation;
}

export interface RemoveAnnotationCommand {
  readonly type: "remove-annotation";
  readonly before: Annotation;
}

export interface EntityPlacement {
  readonly parentId: string | null;
  readonly transform: Transform;
}

export interface EntityPlacementChange {
  readonly entityId: string;
  readonly before: EntityPlacement;
  readonly after: EntityPlacement;
}

export interface CreateGroupCommand {
  readonly type: "create-group";
  readonly group: GroupEntity;
  readonly members: readonly EntityPlacementChange[];
}

export interface ReparentEntitiesCommand {
  readonly type: "reparent-entities";
  readonly changes: readonly EntityPlacementChange[];
}

export interface TransformEntitiesCommand {
  readonly type: "transform-entities";
  readonly changes: readonly {
    readonly entityId: string;
    readonly before: Transform;
    readonly after: Transform;
  }[];
}

export interface DuplicateSubtreeCommand {
  readonly type: "duplicate-subtree";
  readonly rootEntityId: string;
  readonly entityIdMap: Readonly<Record<string, string>>;
  readonly targetIdMap: Readonly<Record<string, string>>;
  readonly rootPlacement?: {
    readonly before: EntityPlacement;
    readonly after: EntityPlacement;
  };
}

export interface DuplicateSubtreeItem {
  readonly rootEntityId: string;
  readonly entityIdMap: Readonly<Record<string, string>>;
  readonly targetIdMap: Readonly<Record<string, string>>;
  readonly rootPlacement: {
    readonly before: EntityPlacement;
    readonly after: EntityPlacement;
  };
}

export interface DuplicateSubtreesCommand {
  readonly type: "duplicate-subtrees";
  readonly items: readonly DuplicateSubtreeItem[];
}

export interface DeleteSubtreeCommand {
  readonly type: "delete-subtree";
  readonly rootEntityId: string;
}

export interface ImportAssetInstanceCommand {
  readonly type: "import-asset-instance";
  readonly asset: SceneAsset;
  readonly entity: SceneEntity;
  readonly target: SceneTarget;
}

export interface SetTargetBusinessIdCommand {
  readonly type: "set-target-business-id";
  readonly targetId: string;
  readonly businessId: string | null;
}

export interface UpsertMockDataSourceCommand {
  readonly type: "upsert-mock-data-source";
  readonly source: MockDataSource;
}

export interface ConfigureBindingRuleSetCommand {
  readonly type: "configure-binding-rule-set";
  readonly binding: Binding;
  readonly ruleSet: RuleSet;
}

export interface RemoveBindingCommand {
  readonly type: "remove-binding";
  readonly bindingId: string;
}

export interface RemoveMockDataSourceCommand {
  readonly type: "remove-mock-data-source";
  readonly sourceId: string;
}

export type DataBindingDocumentCommand =
  | SetTargetBusinessIdCommand
  | UpsertMockDataSourceCommand
  | ConfigureBindingRuleSetCommand
  | RemoveBindingCommand
  | RemoveMockDataSourceCommand;

export type LayoutDocumentCommand =
  | CreateGroupCommand
  | ReparentEntitiesCommand
  | TransformEntitiesCommand
  | DuplicateSubtreeCommand
  | DuplicateSubtreesCommand;

export type DocumentCommand =
  | RenameDocumentCommand
  | SetSceneBackgroundCommand
  | SetSceneEnvironmentCommand
  | RenameEntityCommand
  | SetEntityVisibilityCommand
  | SetEntityLockCommand
  | TransformEntityCommand
  | AddLightEntityCommand
  | UpdateLightEntityCommand
  | RemoveLightEntityCommand
  | AddAnnotationCommand
  | UpdateAnnotationCommand
  | RemoveAnnotationCommand
  | DeleteSubtreeCommand
  | ImportAssetInstanceCommand
  | LayoutDocumentCommand
  | DataBindingDocumentCommand;

export interface DocumentHistoryEntry {
  readonly before: SceneDocument;
  readonly command: DocumentCommand;
}

export interface DocumentHistoryState {
  readonly document: SceneDocument;
  readonly undoStack: readonly DocumentHistoryEntry[];
  readonly redoStack: readonly DocumentHistoryEntry[];
}

export interface ExecuteDocumentCommandOptions {
  readonly mode?: "edit" | "run";
}
