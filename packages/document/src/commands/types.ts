import type {
  Binding,
  MockDataSource,
  RuleSet,
  SceneAsset,
  SceneDocument,
  SceneEntity,
  SceneTarget,
  Transform,
} from "../types.js";

export interface RenameDocumentCommand {
  readonly type: "rename-document";
  readonly name: string;
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

export interface DuplicateSubtreeCommand {
  readonly type: "duplicate-subtree";
  readonly rootEntityId: string;
  readonly entityIdMap: Readonly<Record<string, string>>;
  readonly targetIdMap: Readonly<Record<string, string>>;
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

export type DocumentCommand =
  | RenameDocumentCommand
  | RenameEntityCommand
  | SetEntityVisibilityCommand
  | SetEntityLockCommand
  | TransformEntityCommand
  | DuplicateSubtreeCommand
  | DeleteSubtreeCommand
  | ImportAssetInstanceCommand
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
