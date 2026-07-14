import type {
  SceneAsset as DocumentSceneAsset,
  SceneDocument as DocumentSceneDocument,
} from "@web3d/document";

// Keep document package coupling in one module so contract export changes stay local.
export type SceneAsset = DocumentSceneAsset;
export type SceneDocument = DocumentSceneDocument;
export type SceneEntity = SceneDocument["entities"][number];
export type SceneTarget = SceneDocument["targets"][number];
export type SceneDataSource = SceneDocument["dataSources"][number];
export type SceneBinding = SceneDocument["bindings"][number];
export type SceneRuleSet = SceneDocument["ruleSets"][number];
export type SceneRule = SceneRuleSet["rules"][number];
export type SceneEffect = SceneRule["effects"][number];
export type SceneView = SceneDocument["views"][number];
