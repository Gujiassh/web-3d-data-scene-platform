import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  parseSceneDocument,
  validateSceneDocument,
  type Binding,
  type MockDataSource,
  type RuleSet,
  type SceneDocument,
} from "../index.js";
import { executeDocumentCommand } from "./document-command.js";
import {
  createDocumentHistory,
  executeHistoryCommand,
  redoHistoryCommand,
  undoHistoryCommand,
} from "./history.js";

const fixtureUrl = new URL(
  "../../../../specs/001-product-foundation/contracts/scene.example.json",
  import.meta.url,
);

describe("data-binding document commands", () => {
  it("sets, clears, undoes, and redoes a target business ID with monotonic revisions", () => {
    const original = loadFixture();
    let history = createDocumentHistory(original);

    history = executeHistoryCommand(history, {
      type: "set-target-business-id",
      targetId: "press-01-target",
      businessId: "  PRESS-RENAMED  ",
    });
    expect(target(history.document).businessId).toBe("PRESS-RENAMED");
    expect(history.document.revision).toBe(original.revision + 1);
    expect(history.undoStack).toHaveLength(1);

    history = undoHistoryCommand(history);
    expect(target(history.document).businessId).toBe("MACHINE-PRESS-01");
    expect(history.document.revision).toBe(original.revision + 2);

    history = redoHistoryCommand(history);
    expect(target(history.document).businessId).toBe("PRESS-RENAMED");
    expect(history.document.revision).toBe(original.revision + 3);

    history = executeHistoryCommand(history, {
      type: "set-target-business-id",
      targetId: "press-01-target",
      businessId: null,
    });
    expect(target(history.document)).not.toHaveProperty("businessId");
    expect(history.document.revision).toBe(original.revision + 4);
  });

  it("treats normalized target and source records as no-ops without clearing redo", () => {
    const original = loadFixture();
    const changed = executeHistoryCommand(createDocumentHistory(original), {
      type: "set-target-business-id",
      targetId: "press-01-target",
      businessId: "temporary",
    });
    const history = undoHistoryCommand(changed);
    const businessNoop = executeHistoryCommand(history, {
      type: "set-target-business-id",
      targetId: "press-01-target",
      businessId: "  MACHINE-PRESS-01  ",
    });
    const sourceNoop = executeHistoryCommand(businessNoop, {
      type: "upsert-mock-data-source",
      source: { ...mockSource(original), name: "  Factory Telemetry  " },
    });

    expect(sourceNoop).toBe(history);
    expect(sourceNoop.undoStack).toEqual([]);
    expect(sourceNoop.redoStack).toHaveLength(1);
    expect(sourceNoop.document.revision).toBe(history.document.revision);
  });

  it("upserts only Mock sources as one validated revision and rejects invalid replacements", () => {
    const original = loadFixture();
    const source: MockDataSource = {
      id: "secondary-mock",
      name: " Secondary telemetry ",
      adapter: "mock",
      staleAfterMs: 2000,
      offlineAfterMs: 5000,
      options: { scenario: " status-cycle ", seed: 7, defaultSpeed: 2 },
    };
    const inserted = executeDocumentCommand(original, {
      type: "upsert-mock-data-source",
      source,
    });
    expect(inserted.dataSources.at(-1)).toEqual({
      ...source,
      name: "Secondary telemetry",
      options: { ...source.options, scenario: "status-cycle" },
    });
    expect(inserted.revision).toBe(original.revision + 1);

    const updated = executeDocumentCommand(inserted, {
      type: "upsert-mock-data-source",
      source: { ...source, name: "Backup telemetry", staleAfterMs: 3000 },
    });
    expect(updated.dataSources.find((candidate) => candidate.id === source.id)?.name).toBe(
      "Backup telemetry",
    );
    expect(updated.revision).toBe(original.revision + 2);

    const invalid = { ...source, offlineAfterMs: 1000 };
    expect(() =>
      executeDocumentCommand(original, { type: "upsert-mock-data-source", source: invalid }),
    ).toThrow("DATA_SOURCE_THRESHOLD_ORDER");
    expect(original.dataSources.some((candidate) => candidate.id === source.id)).toBe(false);
  });

  it("configures a Binding and RuleSet atomically and rejects partial or conflicting candidates", () => {
    const original = loadFixture();
    const ruleSet = statusRuleSet("secondary-status-rules");
    const binding = statusBinding("secondary-status-binding", ruleSet.id);
    const configured = executeDocumentCommand(original, {
      type: "configure-binding-rule-set",
      binding,
      ruleSet,
    });

    expect(configured.bindings).toContainEqual(binding);
    expect(configured.ruleSets).toContainEqual(ruleSet);
    expect(configured.revision).toBe(original.revision + 1);
    expectValid(configured);

    const noop = executeDocumentCommand(configured, {
      type: "configure-binding-rule-set",
      binding: { ...binding, writes: [...binding.writes] },
      ruleSet: { ...ruleSet, rules: ruleSet.rules.map((rule) => ({ ...rule })) },
    });
    expect(noop).toBe(configured);

    expect(() =>
      executeDocumentCommand(original, {
        type: "configure-binding-rule-set",
        binding: { ...binding, targetId: "missing-target" },
        ruleSet,
      }),
    ).toThrow("BINDING_TARGET_NOT_FOUND");
    expect(() =>
      executeDocumentCommand(original, {
        type: "configure-binding-rule-set",
        binding: { ...binding, id: "conflicting-binding", targetId: "press-01-target" },
        ruleSet: { ...ruleSet, id: "conflicting-rules" },
      }),
    ).toThrow("must reference rule set");
    expect(original.bindings.some((candidate) => candidate.id === binding.id)).toBe(false);
    expect(original.ruleSets.some((candidate) => candidate.id === ruleSet.id)).toBe(false);
  });

  it("accepts canonical pointers, including empty, and rejects malformed pointers without history", () => {
    const original = loadFixture();
    const validRuleSet = statusRuleSet("canonical-pointer-rules");
    const validBinding = {
      ...statusBinding("canonical-pointer-binding", validRuleSet.id),
      pointer: "/machines/a~1b/~0status/0",
    };
    const configured = executeDocumentCommand(original, {
      type: "configure-binding-rule-set",
      binding: validBinding,
      ruleSet: validRuleSet,
    });
    expect(configured.bindings.at(-1)?.pointer).toBe(validBinding.pointer);

    const emptyRuleSet = statusRuleSet("empty-pointer-rules");
    const emptyConfigured = executeDocumentCommand(configured, {
      type: "configure-binding-rule-set",
      binding: {
        ...statusBinding("empty-pointer-binding", emptyRuleSet.id),
        pointer: "",
      },
      ruleSet: emptyRuleSet,
    });
    expect(emptyConfigured.bindings.at(-1)?.pointer).toBe("");

    for (const pointer of ["machines/status", "/machines/~", "/machines/~2status"]) {
      const history = createDocumentHistory(original);
      const ruleSet = statusRuleSet(`invalid-pointer-rules-${pointer}`);
      expect(() =>
        executeHistoryCommand(history, {
          type: "configure-binding-rule-set",
          binding: {
            ...statusBinding(`invalid-pointer-binding-${pointer}`, ruleSet.id),
            pointer,
          },
          ruleSet,
        }),
      ).toThrow("must be a canonical RFC 6901 JSON Pointer");
      expect(history.document).toEqual(original);
      expect(history.document.revision).toBe(original.revision);
      expect(history.undoStack).toEqual([]);
      expect(history.redoStack).toEqual([]);
    }
  });

  it("preserves an unchanged legacy pointer across no-op, toggle, rules, Undo, and Redo", () => {
    const original = withLegacyPointer(loadFixture());
    expect(validateSceneDocument(original).ok).toBe(true);
    const binding = original.bindings[0]!;
    const ruleSet = original.ruleSets.find((candidate) => candidate.id === binding.ruleSetId)!;
    const initial = createDocumentHistory(original);

    const noop = executeHistoryCommand(initial, {
      type: "configure-binding-rule-set",
      binding: { ...binding, writes: [...binding.writes] },
      ruleSet: {
        ...ruleSet,
        rules: ruleSet.rules.map((rule) => ({ ...rule, effects: [...rule.effects] })),
      },
    });
    expect(noop).toBe(initial);

    const toggled = executeHistoryCommand(noop, {
      type: "configure-binding-rule-set",
      binding: { ...binding, enabled: !binding.enabled },
      ruleSet,
    });
    expect(toggled.document.bindings[0]?.pointer).toBe(binding.pointer);
    expect(toggled.document.bindings[0]?.enabled).toBe(!binding.enabled);
    expect(toggled.document.revision).toBe(original.revision + 1);
    expect(toggled.undoStack).toHaveLength(1);

    const undone = undoHistoryCommand(toggled);
    expect(undone.document.bindings).toEqual(original.bindings);
    expect(undone.document.revision).toBe(original.revision + 2);
    const redone = redoHistoryCommand(undone);
    expect(redone.document.bindings[0]?.pointer).toBe(binding.pointer);
    expect(redone.document.bindings[0]?.enabled).toBe(!binding.enabled);
    expect(redone.document.revision).toBe(original.revision + 3);

    const rulesChanged = executeHistoryCommand(initial, {
      type: "configure-binding-rule-set",
      binding,
      ruleSet: { ...ruleSet, name: "Legacy pointer rules" },
    });
    expect(rulesChanged.document.bindings[0]?.pointer).toBe(binding.pointer);
    expect(rulesChanged.document.ruleSets[0]?.name).toBe("Legacy pointer rules");
    expect(rulesChanged.document.revision).toBe(original.revision + 1);
  });

  it("rejects changing an existing pointer to malformed syntax without touching history", () => {
    const original = loadFixture();
    const history = createDocumentHistory(original);
    const binding = original.bindings[0]!;
    const ruleSet = original.ruleSets.find((candidate) => candidate.id === binding.ruleSetId)!;

    expect(() =>
      executeHistoryCommand(history, {
        type: "configure-binding-rule-set",
        binding: { ...binding, pointer: "/machines/~2status" },
        ruleSet,
      }),
    ).toThrow("must be a canonical RFC 6901 JSON Pointer");
    expect(history.document).toEqual(original);
    expect(history.document.revision).toBe(original.revision);
    expect(history.undoStack).toEqual([]);
    expect(history.redoStack).toEqual([]);
  });

  it("rejects changing an existing Binding ruleSetId without touching history", () => {
    const original = loadFixture();
    const history = createDocumentHistory(original);
    const existing = original.bindings[0]!;
    const replacementRules = statusRuleSet("replacement-status-rules");

    expect(() =>
      executeHistoryCommand(history, {
        type: "configure-binding-rule-set",
        binding: { ...existing, ruleSetId: replacementRules.id },
        ruleSet: replacementRules,
      }),
    ).toThrow(`Binding '${existing.id}' cannot change its rule set.`);
    expect(history.document).toEqual(original);
    expect(history.document.revision).toBe(original.revision);
    expect(history.undoStack).toEqual([]);
    expect(history.redoStack).toEqual([]);
  });

  it("allows an exact shared RuleSet no-op but rejects hidden shared content changes", () => {
    const original = withSharedRuleSet(loadFixture());
    const history = createDocumentHistory(original);
    const binding = original.bindings[0]!;
    const ruleSet = original.ruleSets.find((candidate) => candidate.id === binding.ruleSetId)!;

    const noop = executeHistoryCommand(history, {
      type: "configure-binding-rule-set",
      binding: { ...binding, writes: [...binding.writes] },
      ruleSet: {
        ...ruleSet,
        rules: ruleSet.rules.map((rule) => ({ ...rule, effects: [...rule.effects] })),
      },
    });
    expect(noop).toBe(history);

    expect(() =>
      executeHistoryCommand(history, {
        type: "configure-binding-rule-set",
        binding,
        ruleSet: { ...ruleSet, name: "Hidden shared change" },
      }),
    ).toThrow(`Rule set '${ruleSet.id}' is shared and cannot be changed by this command.`);
    expect(history.document).toEqual(original);
    expect(history.document.revision).toBe(original.revision);
    expect(history.undoStack).toEqual([]);
    expect(history.redoStack).toEqual([]);
  });

  it("enforces the SceneTarget businessId length without creating history", () => {
    const original = loadFixture();
    const accepted = executeDocumentCommand(original, {
      type: "set-target-business-id",
      targetId: "press-01-target",
      businessId: "x".repeat(160),
    });
    expect(target(accepted).businessId).toHaveLength(160);
    expect(accepted.revision).toBe(original.revision + 1);

    const history = createDocumentHistory(original);

    expect(() =>
      executeHistoryCommand(history, {
        type: "set-target-business-id",
        targetId: "press-01-target",
        businessId: "x".repeat(161),
      }),
    ).toThrow("must not exceed 160 characters");
    expect(history.document).toEqual(original);
    expect(history.undoStack).toEqual([]);
  });

  it("removes a Binding and only its now-unreferenced RuleSet", () => {
    const original = withSharedRuleSet(loadFixture());
    const first = original.bindings[0]!;
    const history = executeHistoryCommand(createDocumentHistory(original), {
      type: "remove-binding",
      bindingId: first.id,
    });
    const firstRemoved = history.document;

    expect(firstRemoved.bindings.some((binding) => binding.id === first.id)).toBe(false);
    expect(firstRemoved.ruleSets.some((ruleSet) => ruleSet.id === first.ruleSetId)).toBe(true);
    expect(firstRemoved.targets).toEqual(original.targets);
    expect(firstRemoved.dataSources).toEqual(original.dataSources);
    expect(history.undoStack).toHaveLength(1);
    const undone = undoHistoryCommand(history);
    expect(undone.document.bindings).toEqual(original.bindings);
    expect(undone.document.ruleSets).toEqual(original.ruleSets);
    expect(undone.document.revision).toBe(original.revision + 2);

    const lastBinding = firstRemoved.bindings.find(
      (binding) => binding.ruleSetId === first.ruleSetId,
    )!;
    const lastRemoved = executeDocumentCommand(firstRemoved, {
      type: "remove-binding",
      bindingId: lastBinding.id,
    });
    expect(lastRemoved.ruleSets.some((ruleSet) => ruleSet.id === first.ruleSetId)).toBe(false);
    expect(lastRemoved.targets).toEqual(original.targets);
    expect(lastRemoved.dataSources).toEqual(original.dataSources);
    expect(lastRemoved.revision).toBe(original.revision + 2);
    expectValid(lastRemoved);
  });

  it("removes a Mock source, dependent Bindings, and only newly orphaned RuleSets atomically", () => {
    const original = withSourceRemovalGraph(loadFixture());
    const history = executeHistoryCommand(createDocumentHistory(original), {
      type: "remove-mock-data-source",
      sourceId: "secondary-mock",
    });

    expect(history.document.dataSources.map((source) => source.id)).toEqual(["factory-telemetry"]);
    expect(history.document.bindings.map((binding) => binding.id)).toEqual([
      "press-01-status-binding",
      "shared-rule-survivor",
    ]);
    expect(history.document.ruleSets.map((ruleSet) => ruleSet.id).sort()).toEqual([
      "machine-status-rules",
      "shared-status-rules",
    ]);
    expect(history.document.targets).toEqual(original.targets);
    expect(history.document.revision).toBe(original.revision + 1);
    expect(history.undoStack).toHaveLength(1);
    expectValid(history.document);

    const undone = undoHistoryCommand(history);
    expect(undone.document.dataSources).toEqual(original.dataSources);
    expect(undone.document.bindings).toEqual(original.bindings);
    expect(undone.document.ruleSets).toEqual(original.ruleSets);
    expect(undone.document.revision).toBe(original.revision + 2);
  });

  it("rejects missing and non-Mock removals without changing history", () => {
    const original = loadFixture();
    const websocketDocument: SceneDocument = {
      ...original,
      dataSources: [
        ...original.dataSources,
        {
          id: "live-source",
          name: "Live",
          adapter: "websocket",
          staleAfterMs: 2000,
          offlineAfterMs: 5000,
          options: {},
        },
      ],
    };
    const history = createDocumentHistory(websocketDocument);

    expect(() =>
      executeHistoryCommand(history, {
        type: "remove-mock-data-source",
        sourceId: "live-source",
      }),
    ).toThrow("is not a Mock data source");
    expect(() =>
      executeHistoryCommand(history, { type: "remove-binding", bindingId: "missing" }),
    ).toThrow("does not exist");
    expect(() =>
      executeHistoryCommand(history, {
        type: "remove-mock-data-source",
        sourceId: "missing",
      }),
    ).toThrow("does not exist");
    expect(history.document).toEqual(websocketDocument);
    expect(history.document.revision).toBe(websocketDocument.revision);
    expect(history.undoStack).toEqual([]);
  });
});

function loadFixture(): SceneDocument {
  const result = parseSceneDocument(readFileSync(fixtureUrl, "utf8"));
  if (!result.ok) throw new Error(result.diagnostics[0]?.message ?? "Fixture is invalid.");
  return result.value;
}

function mockSource(document: SceneDocument): MockDataSource {
  const source = document.dataSources[0];
  if (source?.adapter !== "mock") throw new Error("Expected fixture Mock source.");
  return source;
}

function target(document: SceneDocument) {
  const value = document.targets.find((candidate) => candidate.id === "press-01-target");
  if (value === undefined) throw new Error("Fixture target is missing.");
  return value;
}

function statusBinding(id: string, ruleSetId: string, sourceId = "factory-telemetry"): Binding {
  return {
    id,
    targetId: "press-01-target",
    sourceId,
    pointer: "/machines/PRESS-01/status",
    ruleSetId,
    writes: ["color", "alarm"],
    enabled: false,
  };
}

function statusRuleSet(id: string): RuleSet {
  return {
    id,
    name: "Secondary status",
    rules: [
      {
        id: `${id}:fault`,
        priority: 100,
        when: { fact: "value", operator: "eq", expected: "fault" },
        effects: [
          { type: "color", value: "#B93632" },
          { type: "alarm", level: "critical", message: "Fault" },
        ],
      },
    ],
    fallback: [
      { type: "color", value: "#2E7D4D" },
      { type: "alarm", level: "none", message: "" },
    ],
  };
}

function withSharedRuleSet(document: SceneDocument): SceneDocument {
  const binding = document.bindings[0]!;
  return {
    ...document,
    bindings: [binding, { ...binding, id: "shared-binding", enabled: false }],
  };
}

function withLegacyPointer(document: SceneDocument): SceneDocument {
  return {
    ...document,
    bindings: document.bindings.map((binding, index) =>
      index === 0 ? { ...binding, pointer: "/machines/legacy~2status" } : binding,
    ),
  };
}

function withSourceRemovalGraph(document: SceneDocument): SceneDocument {
  const sharedRuleSet = statusRuleSet("shared-status-rules");
  const orphanRuleSet = statusRuleSet("orphan-status-rules");
  const source: MockDataSource = {
    id: "secondary-mock",
    name: "Secondary",
    adapter: "mock",
    staleAfterMs: 2000,
    offlineAfterMs: 5000,
    options: { scenario: "status-cycle" },
  };
  const next: SceneDocument = {
    ...document,
    dataSources: [...document.dataSources, source],
    ruleSets: [...document.ruleSets, sharedRuleSet, orphanRuleSet],
    bindings: [
      ...document.bindings,
      statusBinding("shared-rule-removed", sharedRuleSet.id, source.id),
      statusBinding("shared-rule-survivor", sharedRuleSet.id),
      statusBinding("orphan-rule-removed", orphanRuleSet.id, source.id),
    ],
  };
  expectValid(next);
  return next;
}

function expectValid(document: SceneDocument): void {
  const result = validateSceneDocument(document);
  expect(result.ok).toBe(true);
}
