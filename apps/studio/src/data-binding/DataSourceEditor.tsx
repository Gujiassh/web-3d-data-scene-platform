import { useId, useState } from "react";
import { Database, Plus, Trash2 } from "lucide-react";

import type { DocumentCommand, MockDataSource, SceneDocument } from "@web3d/document";

import { useStudioI18n } from "../i18n/I18nProvider";
import type { StudioCommandOutcome } from "../workspace/command-outcome";
import { buildUpsertMockSourceCommand } from "./command-builders";
import { mockSourceEditorKey } from "./editor-keys";
import { MOCK_SCENARIO_IDS } from "./mock-scenarios";
import { effectiveMockSourceId } from "./source-selection";
import type { DataBindingIdFactory, MockSourceDraft } from "./types";
import { sourceDraft } from "./types";

interface DataSourceEditorProps {
  readonly document: SceneDocument;
  readonly selectedSourceId: string;
  readonly ids: DataBindingIdFactory;
  readonly execute: (command: DocumentCommand) => StudioCommandOutcome;
  readonly onSelect: (sourceId: string) => void;
}

export function DataSourceEditor(props: DataSourceEditorProps) {
  const { t } = useStudioI18n();
  const mockSources = props.document.dataSources.filter(
    (source): source is MockDataSource => source.adapter === "mock",
  );
  const [pendingDraft, setPendingDraft] = useState<MockSourceDraft | null>(null);
  const pending = pendingDraft?.id === props.selectedSourceId ? pendingDraft : null;
  const selected =
    pending === null
      ? (mockSources.find(
          (source) =>
            source.id === effectiveMockSourceId(props.document.dataSources, props.selectedSourceId),
        ) ?? null)
      : null;
  const editor =
    selected !== null
      ? {
          key: mockSourceEditorKey(selected),
          initialDraft: sourceDraft(selected),
          source: selected,
        }
      : pending === null
        ? null
        : { key: `new:${pending.id}`, initialDraft: pending, source: null };

  const startNew = (): void => {
    const id = props.ids.next("source");
    setPendingDraft({
      id,
      name: t.dataBinding.source.defaultName,
      scenario: MOCK_SCENARIO_IDS[0],
      staleAfterMs: "2000",
      offlineAfterMs: "5000",
      seed: "",
      defaultSpeed: "1",
    });
    props.onSelect(id);
  };

  return (
    <section className="data-section" aria-labelledby="data-source-heading">
      <div className="data-section-heading">
        <h2 id="data-source-heading">
          <Database size={13} /> {t.dataBinding.source.heading}
        </h2>
        <button
          aria-label={t.dataBinding.source.add}
          className="data-icon-command"
          title={t.dataBinding.source.add}
          type="button"
          onClick={startNew}
        >
          <Plus size={14} />
        </button>
      </div>
      <label className="data-field">
        <span>{t.dataBinding.source.source}</span>
        <select
          value={pending?.id ?? selected?.id ?? ""}
          onChange={(event) => {
            setPendingDraft(null);
            props.onSelect(event.target.value);
          }}
        >
          {mockSources.length === 0 && <option value="">{t.dataBinding.source.none}</option>}
          {mockSources.map((source) => (
            <option key={source.id} value={source.id}>
              {source.name}
            </option>
          ))}
          {pending !== null && <option value={pending.id}>{pending.name}</option>}
        </select>
      </label>
      {editor === null ? (
        <p className="data-empty">{t.dataBinding.source.empty}</p>
      ) : (
        <SourceEditorSession
          execute={props.execute}
          initialDraft={editor.initialDraft}
          key={editor.key}
          source={editor.source}
          onRemoved={() => {
            setPendingDraft(null);
            props.onSelect("");
          }}
          onSaved={(sourceId) => {
            setPendingDraft(null);
            props.onSelect(sourceId);
          }}
        />
      )}
      {props.document.dataSources.some((source) => source.adapter !== "mock") && (
        <p className="data-notice">{t.dataBinding.source.unsupportedPreserved}</p>
      )}
    </section>
  );
}

function SourceEditorSession({
  initialDraft,
  source,
  execute,
  onRemoved,
  onSaved,
}: {
  readonly initialDraft: MockSourceDraft;
  readonly source: MockDataSource | null;
  readonly execute: (command: DocumentCommand) => StudioCommandOutcome;
  readonly onRemoved: () => void;
  readonly onSaved: (sourceId: string) => void;
}) {
  const { t } = useStudioI18n();
  const [draft, setDraft] = useState(initialDraft);
  const [error, setError] = useState<string | null>(null);
  const errorId = useId();

  return (
    <>
      <SourceForm draft={draft} error={error} errorId={errorId} onChange={setDraft} />
      <div className="data-actions data-actions-split">
        {source !== null && (
          <button
            aria-label={t.dataBinding.source.remove}
            className="danger-command"
            title={t.dataBinding.source.remove}
            type="button"
            onClick={() => {
              const outcome = execute({
                type: "remove-mock-data-source",
                sourceId: source.id,
              });
              if (outcome.status === "rejected" || outcome.status === "unavailable") {
                setError(t.dataBinding.commandRejected);
                return;
              }
              onRemoved();
            }}
          >
            <Trash2 size={13} />
          </button>
        )}
        <button
          className="primary-command"
          type="button"
          onClick={() => {
            const built = buildUpsertMockSourceCommand(draft);
            if (!built.ok) {
              setError(t.dataBinding.validation(built.issues[0]?.code ?? "source-name-required"));
              return;
            }
            const outcome = execute(built.value);
            if (outcome.status === "rejected" || outcome.status === "unavailable") {
              setError(t.dataBinding.commandRejected);
              return;
            }
            onSaved(draft.id);
          }}
        >
          {t.dataBinding.actions.saveSource}
        </button>
      </div>
    </>
  );
}

function SourceForm({
  draft,
  error,
  errorId,
  onChange,
}: {
  readonly draft: MockSourceDraft;
  readonly error: string | null;
  readonly errorId: string;
  readonly onChange: (draft: MockSourceDraft) => void;
}) {
  const { t } = useStudioI18n();
  const update = (field: keyof MockSourceDraft, value: string): void =>
    onChange({ ...draft, [field]: value });
  return (
    <div aria-describedby={error === null ? undefined : errorId} className="data-form-grid">
      <label className="data-field data-field-full">
        <span>{t.dataBinding.source.name}</span>
        <input
          aria-describedby={error === null ? undefined : errorId}
          aria-invalid={error !== null}
          maxLength={160}
          value={draft.name}
          onChange={(event) => update("name", event.target.value)}
        />
      </label>
      <label className="data-field data-field-full">
        <span>{t.dataBinding.source.scenario}</span>
        <select value={draft.scenario} onChange={(event) => update("scenario", event.target.value)}>
          {MOCK_SCENARIO_IDS.map((id) => (
            <option key={id} value={id}>
              {t.dataBinding.scenarios[id]}
            </option>
          ))}
        </select>
      </label>
      <label className="data-field">
        <span>{t.dataBinding.source.staleAfter}</span>
        <input
          min={1000}
          step={500}
          type="number"
          value={draft.staleAfterMs}
          onChange={(event) => update("staleAfterMs", event.target.value)}
        />
      </label>
      <label className="data-field">
        <span>{t.dataBinding.source.offlineAfter}</span>
        <input
          min={1000}
          step={500}
          type="number"
          value={draft.offlineAfterMs}
          onChange={(event) => update("offlineAfterMs", event.target.value)}
        />
      </label>
      <label className="data-field">
        <span>{t.dataBinding.source.speed}</span>
        <input
          max={16}
          min={0.1}
          step={0.1}
          type="number"
          value={draft.defaultSpeed}
          onChange={(event) => update("defaultSpeed", event.target.value)}
        />
      </label>
      {error !== null && (
        <div className="data-form-error data-field-full" id={errorId} role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
