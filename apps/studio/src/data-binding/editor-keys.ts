import type { MockDataSource, SceneTarget } from "@web3d/document";

import type { BindingEditorModel } from "./types";

export function targetMappingEditorKey(target: SceneTarget): string {
  return JSON.stringify([target.id, target.businessId ?? null]);
}

export function mockSourceEditorKey(source: MockDataSource): string {
  return JSON.stringify({
    id: source.id,
    name: source.name,
    staleAfterMs: source.staleAfterMs,
    offlineAfterMs: source.offlineAfterMs,
    options: source.options,
  });
}

export function bindingRuleEditorKey(model: BindingEditorModel): string {
  return JSON.stringify({ binding: model.binding, ruleSet: model.ruleSet });
}
