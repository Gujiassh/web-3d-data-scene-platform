import { sortDiagnostics, type DocumentDiagnostic } from "./diagnostics.js";
import type {
  Annotation,
  Binding,
  DataSource,
  RuleSet,
  SceneAsset,
  SceneEntity,
  SceneTarget,
  SceneView,
} from "./types.js";

export interface SceneDocumentSemanticsInput {
  readonly id: string;
  readonly assets: readonly SceneAsset[];
  readonly entities: readonly SceneEntity[];
  readonly targets: readonly SceneTarget[];
  readonly dataSources: readonly DataSource[];
  readonly bindings: readonly Binding[];
  readonly ruleSets: readonly RuleSet[];
  readonly annotations: readonly Annotation[];
  readonly views: readonly SceneView[];
}

interface LocatedId {
  readonly id: string;
  readonly path: string;
}

export function validateSceneDocumentSemantics(
  document: SceneDocumentSemanticsInput,
): readonly DocumentDiagnostic[] {
  const diagnostics: DocumentDiagnostic[] = [];
  diagnostics.push(...findDuplicateIds(document));

  const assets = firstById(document.assets);
  const entities = firstById(document.entities);
  const targets = firstById(document.targets);
  const sources = firstById(document.dataSources);
  const ruleSets = firstById(document.ruleSets);

  document.entities.forEach((entity, index) => {
    if (entity.parentId !== null && !entities.has(entity.parentId)) {
      diagnostics.push({
        code: "ENTITY_PARENT_NOT_FOUND",
        path: `/entities/${index}/parentId`,
        message: `Entity parent '${entity.parentId}' does not exist.`,
      });
    }
    if (entity.type === "asset" && !assets.has(entity.assetId)) {
      diagnostics.push({
        code: "ENTITY_ASSET_NOT_FOUND",
        path: `/entities/${index}/assetId`,
        message: `Asset '${entity.assetId}' does not exist.`,
      });
    }
  });
  diagnostics.push(...findEntityCycles(document.entities));

  document.targets.forEach((target, index) => {
    const entity = entities.get(target.entityId);
    if (entity === undefined) {
      diagnostics.push({
        code: "TARGET_ENTITY_NOT_FOUND",
        path: `/targets/${index}/entityId`,
        message: `Target entity '${target.entityId}' does not exist.`,
      });
      return;
    }
    if (entity.type !== "asset") {
      diagnostics.push({
        code: "TARGET_ENTITY_NOT_ASSET",
        path: `/targets/${index}/entityId`,
        message: `Target entity '${target.entityId}' is not an asset instance.`,
      });
      return;
    }

    const asset = assets.get(entity.assetId);
    if (asset === undefined) {
      return;
    }
    validateTargetAsset(target.assetHash, target.nodeIndex, asset, index, diagnostics);
  });

  document.dataSources.forEach((source, index) => {
    if (source.offlineAfterMs <= source.staleAfterMs) {
      diagnostics.push({
        code: "DATA_SOURCE_THRESHOLD_ORDER",
        path: `/dataSources/${index}/offlineAfterMs`,
        message: "offlineAfterMs must be greater than staleAfterMs.",
        relatedPaths: [`/dataSources/${index}/staleAfterMs`],
      });
    }
  });

  document.bindings.forEach((binding, index) => {
    if (!targets.has(binding.targetId)) {
      diagnostics.push({
        code: "BINDING_TARGET_NOT_FOUND",
        path: `/bindings/${index}/targetId`,
        message: `Binding target '${binding.targetId}' does not exist.`,
      });
    }
    if (!sources.has(binding.sourceId)) {
      diagnostics.push({
        code: "BINDING_SOURCE_NOT_FOUND",
        path: `/bindings/${index}/sourceId`,
        message: `Binding data source '${binding.sourceId}' does not exist.`,
      });
    }
    if (!ruleSets.has(binding.ruleSetId)) {
      diagnostics.push({
        code: "BINDING_RULE_SET_NOT_FOUND",
        path: `/bindings/${index}/ruleSetId`,
        message: `Binding rule set '${binding.ruleSetId}' does not exist.`,
      });
    } else {
      const ruleSet = ruleSets.get(binding.ruleSetId);
      if (ruleSet !== undefined) {
        const declared = [...binding.writes].sort(compare);
        const actual = [
          ...new Set([
            ...ruleSet.rules.flatMap((rule) => rule.effects.map((effect) => effect.type)),
            ...ruleSet.fallback.map((effect) => effect.type),
          ]),
        ].sort(compare);
        if (declared.join("\u0000") !== actual.join("\u0000")) {
          diagnostics.push({
            code: "BINDING_WRITES_MISMATCH",
            path: `/bindings/${index}/writes`,
            message: `Binding writes [${declared.join(", ")}] but rule set '${ruleSet.id}' produces [${actual.join(", ")}].`,
            relatedPaths: [`/ruleSets/${document.ruleSets.indexOf(ruleSet)}`],
          });
        }
      }
    }
  });
  diagnostics.push(...findBindingWriteConflicts(document));
  diagnostics.push(...findInvalidLabelTokens(document));

  document.annotations.forEach((annotation, index) => {
    if (!targets.has(annotation.targetId)) {
      diagnostics.push({
        code: "ANNOTATION_TARGET_NOT_FOUND",
        path: `/annotations/${index}/targetId`,
        message: `Annotation target '${annotation.targetId}' does not exist.`,
      });
    }
  });

  return sortDiagnostics(diagnostics);
}

const ALLOWED_LABEL_TOKENS = new Set(["value", "quality", "connection", "sourceTime"]);

function findInvalidLabelTokens(
  document: SceneDocumentSemanticsInput,
): readonly DocumentDiagnostic[] {
  const diagnostics: DocumentDiagnostic[] = [];
  document.ruleSets.forEach((ruleSet, ruleSetIndex) => {
    const groups = [
      ...ruleSet.rules.map((rule, ruleIndex) => ({
        effects: rule.effects,
        path: `/ruleSets/${ruleSetIndex}/rules/${ruleIndex}/effects`,
      })),
      { effects: ruleSet.fallback, path: `/ruleSets/${ruleSetIndex}/fallback` },
    ];

    for (const group of groups) {
      group.effects.forEach((effect, effectIndex) => {
        if (effect.type !== "label") return;
        const tokens = [...effect.template.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/gu)];
        const invalid = tokens
          .map((match) => match[1]?.trim() ?? "")
          .filter((token) => !ALLOWED_LABEL_TOKENS.has(token));
        const remainder = effect.template.replace(/\{\{\s*[^{}]+?\s*\}\}/gu, "");
        if (invalid.length === 0 && !remainder.includes("{{") && !remainder.includes("}}")) {
          return;
        }
        diagnostics.push({
          code: "RULE_LABEL_TOKEN_INVALID",
          path: `${group.path}/${effectIndex}/template`,
          message: `Label contains unsupported or malformed tokens${invalid.length > 0 ? `: ${invalid.join(", ")}` : "."}`,
        });
      });
    }
  });
  return diagnostics;
}

function findDuplicateIds(document: SceneDocumentSemanticsInput): readonly DocumentDiagnostic[] {
  const ids: LocatedId[] = [{ id: document.id, path: "/id" }];
  const add = (values: readonly { readonly id: string }[], section: string): void => {
    values.forEach((value, index) => ids.push({ id: value.id, path: `/${section}/${index}/id` }));
  };
  add(document.assets, "assets");
  add(document.entities, "entities");
  add(document.targets, "targets");
  add(document.dataSources, "dataSources");
  add(document.bindings, "bindings");
  add(document.ruleSets, "ruleSets");
  document.ruleSets.forEach((ruleSet, ruleSetIndex) => {
    ruleSet.rules.forEach((rule, ruleIndex) =>
      ids.push({ id: rule.id, path: `/ruleSets/${ruleSetIndex}/rules/${ruleIndex}/id` }),
    );
  });
  add(document.annotations, "annotations");
  add(document.views, "views");

  const firstPath = new Map<string, string>();
  const diagnostics: DocumentDiagnostic[] = [];
  for (const entry of ids) {
    const originalPath = firstPath.get(entry.id);
    if (originalPath === undefined) {
      firstPath.set(entry.id, entry.path);
    } else {
      diagnostics.push({
        code: "DUPLICATE_ID",
        path: entry.path,
        message: `ID '${entry.id}' is already used.`,
        relatedPaths: [originalPath],
      });
    }
  }
  return diagnostics;
}

function findEntityCycles(entities: readonly SceneEntity[]): readonly DocumentDiagnostic[] {
  const byId = firstById(entities);
  const indexById = new Map(entities.map((entity, index) => [entity.id, index]));
  const state = new Map<string, "visiting" | "done">();
  const stack: string[] = [];
  const reported = new Set<string>();
  const diagnostics: DocumentDiagnostic[] = [];

  const visit = (id: string): void => {
    if (state.get(id) === "done") return;
    if (state.get(id) === "visiting") {
      const start = stack.indexOf(id);
      const cycle = stack.slice(start);
      const key = [...cycle].sort(compare).join("\u0000");
      if (!reported.has(key)) {
        reported.add(key);
        const anchor = [...cycle].sort(compare)[0] ?? id;
        diagnostics.push({
          code: "ENTITY_CYCLE",
          path: `/entities/${indexById.get(anchor) ?? 0}/parentId`,
          message: `Entity hierarchy contains a cycle: ${[...cycle, id].join(" -> ")}.`,
          relatedPaths: cycle.map((cycleId) => `/entities/${indexById.get(cycleId) ?? 0}/parentId`),
        });
      }
      return;
    }

    const entity = byId.get(id);
    if (entity === undefined) return;
    state.set(id, "visiting");
    stack.push(id);
    if (entity.parentId !== null && byId.has(entity.parentId)) visit(entity.parentId);
    stack.pop();
    state.set(id, "done");
  };

  [...byId.keys()].sort(compare).forEach(visit);
  return diagnostics;
}

function validateTargetAsset(
  assetHash: string,
  nodeIndex: number | null,
  asset: SceneAsset,
  targetIndex: number,
  diagnostics: DocumentDiagnostic[],
): void {
  if (assetHash !== asset.sha256) {
    diagnostics.push({
      code: "TARGET_ASSET_HASH_MISMATCH",
      path: `/targets/${targetIndex}/assetHash`,
      message: `Target hash does not match asset '${asset.id}'.`,
    });
  }
  if (nodeIndex !== null && asset.stats !== undefined && nodeIndex >= asset.stats.nodeCount) {
    diagnostics.push({
      code: "TARGET_NODE_INDEX_OUT_OF_RANGE",
      path: `/targets/${targetIndex}/nodeIndex`,
      message: `Target node index ${nodeIndex} is outside asset '${asset.id}'.`,
    });
  }
}

function findBindingWriteConflicts(
  document: SceneDocumentSemanticsInput,
): readonly DocumentDiagnostic[] {
  const owners = new Map<string, { readonly bindingId: string; readonly path: string }[]>();
  document.bindings.forEach((binding, bindingIndex) => {
    if (!binding.enabled) return;
    binding.writes.forEach((write, writeIndex) => {
      const key = `${binding.targetId}\u0000${write}`;
      const entries = owners.get(key) ?? [];
      entries.push({
        bindingId: binding.id,
        path: `/bindings/${bindingIndex}/writes/${writeIndex}`,
      });
      owners.set(key, entries);
    });
  });

  const diagnostics: DocumentDiagnostic[] = [];
  for (const [key, entries] of owners) {
    if (entries.length < 2) continue;
    const sorted = [...entries].sort((left, right) => compare(left.bindingId, right.bindingId));
    const [targetId, write] = key.split("\u0000");
    diagnostics.push({
      code: "BINDING_WRITE_CONFLICT",
      path: sorted[0]?.path ?? "",
      message: `Enabled bindings ${sorted.map((entry) => `'${entry.bindingId}'`).join(", ")} all write '${write}' on target '${targetId}'.`,
      relatedPaths: sorted.slice(1).map((entry) => entry.path),
    });
  }
  return diagnostics;
}

function firstById<T extends { readonly id: string }>(values: readonly T[]): Map<string, T> {
  const result = new Map<string, T>();
  values.forEach((value) => {
    if (!result.has(value.id)) result.set(value.id, value);
  });
  return result;
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
