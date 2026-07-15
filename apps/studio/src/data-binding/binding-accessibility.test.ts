import { describe, expect, it } from "vitest";

import type { Binding } from "@web3d/document";

import { chinese, english } from "../i18n/catalog";
import { bindingActionAccessibleNames } from "./binding-accessibility";

describe("bindingActionAccessibleNames", () => {
  it.each([
    ["English", english.dataBinding.binding],
    ["Chinese", chinese.dataBinding.binding],
  ] as const)("makes every Binding control role-name unique in %s", (_locale, copy) => {
    const first = binding("binding-a");
    const second = binding("binding-b");
    const firstNames = bindingActionAccessibleNames(first, copy);
    const secondNames = bindingActionAccessibleNames(second, copy);

    expect(firstNames.enabled).not.toBe(secondNames.enabled);
    expect(firstNames.edit).not.toBe(secondNames.edit);
    expect(firstNames.remove).not.toBe(secondNames.remove);
    expect(Object.values(firstNames).every((name) => name.includes(first.id))).toBe(true);
    expect(Object.values(secondNames).every((name) => name.includes(second.id))).toBe(true);
  });
});

function binding(id: string): Binding {
  return {
    id,
    targetId: "target-a",
    sourceId: "source-a",
    pointer: "/telemetry/status",
    ruleSetId: `rules-${id}`,
    writes: ["color"],
    enabled: true,
  };
}
