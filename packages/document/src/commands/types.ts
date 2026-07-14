import type { SceneAsset, SceneDocument, SceneEntity, SceneTarget, Transform } from "../types.js";

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

export type DocumentCommand =
  | RenameEntityCommand
  | SetEntityVisibilityCommand
  | SetEntityLockCommand
  | TransformEntityCommand
  | DuplicateSubtreeCommand
  | DeleteSubtreeCommand
  | ImportAssetInstanceCommand;

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
