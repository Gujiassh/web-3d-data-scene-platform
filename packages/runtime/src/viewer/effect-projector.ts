import type { RuleEffect } from "@web3d/document";
import { Color, type Material } from "three";

import type { RuntimeTarget } from "./runtime-generation";

export function applyRuleEffects(target: RuntimeTarget, effects: readonly RuleEffect[]): void {
  for (const effect of effects) {
    if (effect.type === "color") applyColor(target.materials, effect.value);
    if (effect.type === "visibility") target.object.visible = effect.value;
  }
}

function applyColor(materials: readonly Material[], value: string): void {
  const color = new Color(value);
  for (const material of materials) {
    if (hasColor(material)) material.color.copy(color);
  }
}

function hasColor(material: Material): material is Material & { color: Color } {
  return "color" in material && material.color instanceof Color;
}
