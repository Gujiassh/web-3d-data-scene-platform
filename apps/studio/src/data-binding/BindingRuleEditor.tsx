import { useId, useState } from "react";
import { ArrowDown, ArrowUp, Link2, Plus, Trash2 } from "lucide-react";

import type { DocumentCommand, MockDataSource, SceneDocument, SceneTarget } from "@web3d/document";

import { useStudioI18n } from "../i18n/I18nProvider";
import type { StudioCommandOutcome } from "../workspace/command-outcome";
import { bindingActionAccessibleNames } from "./binding-accessibility";
import { bindingEditorModels, buildConfigureBindingCommand } from "./command-builders";
import { DataPathPicker } from "./DataPathPicker";
import { bindingRuleEditorKey } from "./editor-keys";
import {
  createBindingDraft,
  editBindingDraft,
  emptyRuleDraft,
  selectBindingPointer,
} from "./form-models";
import { mockScenario } from "./mock-scenarios";
import { enumerateSampleFields } from "./sample-fields";
import type { BindingRuleDraft, DataBindingIdFactory, EqualityRuleDraft } from "./types";
import { STRING_EXPECTED_MAX_LENGTH } from "./validation";

interface BindingRuleEditorProps {
  readonly document: SceneDocument;
  readonly target: SceneTarget;
  readonly selectedSourceId: string;
  readonly ids: DataBindingIdFactory;
  readonly execute: (command: DocumentCommand) => StudioCommandOutcome;
}

export function BindingRuleEditor(props: BindingRuleEditorProps) {
  return <BindingRuleEditorForTarget {...props} key={props.target.id} />;
}

type BindingDraftSelection =
  | { readonly type: "new"; readonly draft: BindingRuleDraft }
  | { readonly type: "existing"; readonly bindingId: string };

function BindingRuleEditorForTarget(props: BindingRuleEditorProps) {
  const { t } = useStudioI18n();
  const models = bindingEditorModels(props.document, props.target.id);
  const sources = props.document.dataSources.filter(
    (source): source is MockDataSource => source.adapter === "mock",
  );
  const [selection, setSelection] = useState<BindingDraftSelection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const errorId = useId();
  const selectedModel =
    selection?.type === "existing"
      ? models.find((model) => model.binding.id === selection.bindingId)
      : undefined;
  const editor =
    selection?.type === "new"
      ? { key: `new:${selection.draft.bindingId}`, initialDraft: selection.draft }
      : selectedModel !== undefined && selectedModel.supported && !selectedModel.sharedRuleSet
        ? {
            key: bindingRuleEditorKey(selectedModel),
            initialDraft: editBindingDraft(selectedModel),
          }
        : null;

  const startNew = (): void => {
    if ((props.target.businessId ?? "").trim() === "") {
      setError(t.dataBinding.validation("business-id-required"));
      return;
    }
    const source = sources.find((candidate) => candidate.id === props.selectedSourceId);
    if (source === undefined) {
      setError(t.dataBinding.validation("source-required"));
      return;
    }
    setSelection({
      type: "new",
      draft: createBindingDraft(source, props.ids, t.dataBinding.binding.defaultRuleSetName),
    });
    setError(null);
  };

  const executePanelCommand = (command: DocumentCommand): StudioCommandOutcome => {
    const outcome = props.execute(command);
    setError(
      outcome.status === "rejected" || outcome.status === "unavailable"
        ? t.dataBinding.commandRejected
        : null,
    );
    return outcome;
  };

  return (
    <section className="data-section" aria-labelledby="binding-rules-heading">
      <div className="data-section-heading">
        <h2 id="binding-rules-heading">
          <Link2 size={13} /> {t.dataBinding.binding.heading}
        </h2>
        <button
          aria-label={t.dataBinding.binding.new}
          className="data-icon-command"
          title={t.dataBinding.binding.new}
          type="button"
          onClick={startNew}
        >
          <Plus size={14} />
        </button>
      </div>
      {models.length === 0 && editor === null && (
        <p className="data-empty">{t.dataBinding.binding.noBindings}</p>
      )}
      <div className="binding-summary-list">
        {models.map((model) => {
          const accessibleNames = bindingActionAccessibleNames(
            model.binding,
            t.dataBinding.binding,
          );
          return (
            <div className="binding-summary" key={model.binding.id}>
              <label className="binding-toggle">
                <input
                  checked={model.binding.enabled}
                  aria-label={accessibleNames.enabled}
                  aria-describedby={error === null ? undefined : errorId}
                  type="checkbox"
                  onChange={(event) => {
                    executePanelCommand({
                      type: "configure-binding-rule-set",
                      binding: { ...model.binding, enabled: event.target.checked },
                      ruleSet: model.ruleSet,
                    });
                  }}
                />
                <span>{t.dataBinding.binding.enabled}</span>
              </label>
              <span className="mono binding-pointer" title={model.binding.pointer}>
                {model.binding.pointer}
              </span>
              <span className="binding-summary-actions">
                <button
                  aria-label={accessibleNames.edit}
                  className="data-icon-command"
                  disabled={model.sharedRuleSet || !model.supported}
                  title={accessibleNames.edit}
                  type="button"
                  onClick={() => {
                    setSelection({ type: "existing", bindingId: model.binding.id });
                    setError(null);
                  }}
                >
                  <Link2 size={13} />
                </button>
                <button
                  aria-label={accessibleNames.remove}
                  className="data-icon-command data-icon-danger"
                  aria-describedby={error === null ? undefined : errorId}
                  title={accessibleNames.remove}
                  type="button"
                  onClick={() => {
                    const outcome = executePanelCommand({
                      type: "remove-binding",
                      bindingId: model.binding.id,
                    });
                    if (
                      outcome.status !== "rejected" &&
                      outcome.status !== "unavailable" &&
                      selection?.type === "existing" &&
                      selection.bindingId === model.binding.id
                    ) {
                      setSelection(null);
                    }
                  }}
                >
                  <Trash2 size={13} />
                </button>
              </span>
              <small>
                {t.dataBinding.binding.writes(
                  model.binding.writes.map((effect) => t.dataBinding.effectTypes[effect]),
                )}
              </small>
              {model.sharedRuleSet && (
                <p className="data-notice">{t.dataBinding.binding.sharedReadOnly}</p>
              )}
              {!model.supported && (
                <p className="data-notice">{t.dataBinding.binding.unsupportedReadOnly}</p>
              )}
            </div>
          );
        })}
      </div>
      {editor !== null && (
        <BindingDraftSession
          document={props.document}
          ids={props.ids}
          initialDraft={editor.initialDraft}
          key={editor.key}
          targetId={props.target.id}
          execute={props.execute}
          onClose={() => setSelection(null)}
        />
      )}
      {error !== null && (
        <div className="data-form-error" id={errorId} role="alert">
          {error}
        </div>
      )}
    </section>
  );
}

function BindingDraftSession({
  document,
  initialDraft,
  ids,
  targetId,
  execute,
  onClose,
}: {
  readonly document: SceneDocument;
  readonly initialDraft: BindingRuleDraft;
  readonly ids: DataBindingIdFactory;
  readonly targetId: string;
  readonly execute: (command: DocumentCommand) => StudioCommandOutcome;
  readonly onClose: () => void;
}) {
  const { t } = useStudioI18n();
  const sources = document.dataSources.filter(
    (source): source is MockDataSource => source.adapter === "mock",
  );
  const [draft, setDraft] = useState(initialDraft);
  const [error, setError] = useState<string | null>(null);
  const errorId = useId();

  return (
    <>
      <BindingForm
        draft={draft}
        errorId={error === null ? undefined : errorId}
        ids={ids}
        sources={sources}
        onChange={setDraft}
      />
      {error !== null && (
        <div className="data-form-error" id={errorId} role="alert">
          {error}
        </div>
      )}
      <div className="data-actions">
        <button className="secondary-command" type="button" onClick={onClose}>
          {t.dataBinding.actions.cancel}
        </button>
        <button
          aria-describedby={error === null ? undefined : errorId}
          className="primary-command"
          type="button"
          onClick={() => {
            const built = buildConfigureBindingCommand(document, targetId, draft);
            if (!built.ok) {
              setError(t.dataBinding.validation(built.issues[0]?.code ?? "rules-required"));
              return;
            }
            const outcome = execute(built.value);
            if (outcome.status === "rejected" || outcome.status === "unavailable") {
              setError(t.dataBinding.commandRejected);
              return;
            }
            onClose();
          }}
        >
          {t.dataBinding.actions.saveBinding}
        </button>
      </div>
    </>
  );
}

function BindingForm({
  draft,
  ids,
  sources,
  errorId,
  onChange,
}: {
  readonly draft: BindingRuleDraft;
  readonly ids: DataBindingIdFactory;
  readonly sources: readonly MockDataSource[];
  readonly errorId: string | undefined;
  readonly onChange: (draft: BindingRuleDraft) => void;
}) {
  const { t } = useStudioI18n();
  const source = sources.find((candidate) => candidate.id === draft.sourceId) ?? null;
  const scenario = source === null ? null : mockScenario(source.options.scenario);
  const fields = scenario === null ? [] : enumerateSampleFields(scenario.sample);
  const selectedField = fields.find((field) => field.pointer === draft.pointer);
  const updateRule = (index: number, rule: EqualityRuleDraft): void => {
    const rules = [...draft.rules];
    rules[index] = rule;
    onChange({ ...draft, rules });
  };

  return (
    <div aria-describedby={errorId} className="binding-editor">
      <label className="data-field data-field-full">
        <span>{t.dataBinding.source.source}</span>
        <select
          value={draft.sourceId}
          onChange={(event) => onChange({ ...draft, sourceId: event.target.value, pointer: "" })}
        >
          <option value="">{t.dataBinding.source.none}</option>
          {sources.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.name}
            </option>
          ))}
        </select>
      </label>
      <DataPathPicker
        source={source}
        value={draft.pointer}
        onChange={(pointer) => onChange(selectBindingPointer(draft, pointer, fields))}
      />
      <label className="data-field data-field-full">
        <span>{t.dataBinding.binding.ruleSetName}</span>
        <input
          maxLength={160}
          value={draft.ruleSetName}
          onChange={(event) => onChange({ ...draft, ruleSetName: event.target.value })}
        />
      </label>
      <label className="binding-toggle binding-enabled-editor">
        <input
          checked={draft.enabled}
          type="checkbox"
          onChange={(event) => onChange({ ...draft, enabled: event.target.checked })}
        />
        <span>{t.dataBinding.binding.enabled}</span>
      </label>
      <label className="data-field data-color-field">
        <span>{t.dataBinding.binding.fallback}</span>
        <input
          aria-label={t.dataBinding.binding.fallback}
          type="color"
          value={draft.fallbackColor}
          onChange={(event) => onChange({ ...draft, fallbackColor: event.target.value })}
        />
      </label>
      <div className="rule-editor-list">
        {draft.rules.map((rule, index) => (
          <RuleRow
            index={index}
            key={rule.id}
            rule={rule}
            count={draft.rules.length}
            onChange={(next) => updateRule(index, next)}
            onMove={(offset) =>
              onChange({ ...draft, rules: move(draft.rules, index, index + offset) })
            }
            onRemove={() =>
              onChange({
                ...draft,
                rules: draft.rules.filter((_, candidate) => candidate !== index),
              })
            }
          />
        ))}
      </div>
      <button
        className="secondary-command data-add-rule"
        type="button"
        onClick={() =>
          onChange({
            ...draft,
            rules: [...draft.rules, emptyRuleDraft(selectedField, ids.next("rule"))],
          })
        }
      >
        <Plus size={13} /> {t.dataBinding.binding.addRule}
      </button>
    </div>
  );
}

function RuleRow({
  rule,
  index,
  count,
  onChange,
  onMove,
  onRemove,
}: {
  readonly rule: EqualityRuleDraft;
  readonly index: number;
  readonly count: number;
  readonly onChange: (rule: EqualityRuleDraft) => void;
  readonly onMove: (offset: -1 | 1) => void;
  readonly onRemove: () => void;
}) {
  const { t } = useStudioI18n();
  return (
    <fieldset className="binding-rule-row">
      <legend className="mono">{String(index + 1).padStart(2, "0")}</legend>
      <span className="rule-order-actions">
        <button
          aria-label={t.dataBinding.rule.moveUp}
          className="data-icon-command"
          disabled={index === 0}
          title={t.dataBinding.rule.moveUp}
          type="button"
          onClick={() => onMove(-1)}
        >
          <ArrowUp size={12} />
        </button>
        <button
          aria-label={t.dataBinding.rule.moveDown}
          className="data-icon-command"
          disabled={index === count - 1}
          title={t.dataBinding.rule.moveDown}
          type="button"
          onClick={() => onMove(1)}
        >
          <ArrowDown size={12} />
        </button>
        <button
          aria-label={t.dataBinding.rule.remove}
          className="data-icon-command data-icon-danger"
          title={t.dataBinding.rule.remove}
          type="button"
          onClick={onRemove}
        >
          <Trash2 size={12} />
        </button>
      </span>
      <label className="data-field">
        <span>{t.dataBinding.rule.expected}</span>
        {rule.expectedType === "boolean" ? (
          <select
            value={rule.expected}
            onChange={(event) => onChange({ ...rule, expected: event.target.value })}
          >
            <option value="true">{t.dataBinding.rule.booleanValues.true}</option>
            <option value="false">{t.dataBinding.rule.booleanValues.false}</option>
          </select>
        ) : (
          <input
            disabled={rule.expectedType === "null"}
            inputMode={rule.expectedType === "number" ? "decimal" : "text"}
            maxLength={rule.expectedType === "string" ? STRING_EXPECTED_MAX_LENGTH : undefined}
            value={rule.expected}
            onChange={(event) => onChange({ ...rule, expected: event.target.value })}
          />
        )}
      </label>
      <label className="data-field data-color-field">
        <span>{t.dataBinding.rule.color}</span>
        <input
          aria-label={t.dataBinding.rule.color}
          type="color"
          value={rule.color}
          onChange={(event) => onChange({ ...rule, color: event.target.value })}
        />
      </label>
      <label className="binding-toggle">
        <input
          checked={rule.alarmEnabled}
          type="checkbox"
          onChange={(event) => onChange({ ...rule, alarmEnabled: event.target.checked })}
        />
        <span>{t.dataBinding.rule.alarm}</span>
      </label>
      {rule.alarmEnabled && (
        <>
          <label className="data-field">
            <span>{t.dataBinding.rule.alarmLevel}</span>
            <select
              value={rule.alarmLevel}
              onChange={(event) =>
                onChange({
                  ...rule,
                  alarmLevel: event.target.value as EqualityRuleDraft["alarmLevel"],
                })
              }
            >
              {Object.entries(t.dataBinding.rule.levels).map(([level, label]) => (
                <option key={level} value={level}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="data-field data-field-full">
            <span>{t.dataBinding.rule.alarmMessage}</span>
            <input
              maxLength={240}
              value={rule.alarmMessage}
              onChange={(event) => onChange({ ...rule, alarmMessage: event.target.value })}
            />
          </label>
        </>
      )}
    </fieldset>
  );
}

function move<T>(values: readonly T[], from: number, to: number): readonly T[] {
  if (to < 0 || to >= values.length) return values;
  const next = [...values];
  const [value] = next.splice(from, 1);
  if (value !== undefined) next.splice(to, 0, value);
  return next;
}
