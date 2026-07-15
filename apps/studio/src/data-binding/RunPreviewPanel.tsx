import { Activity, AlertTriangle, Radio, TriangleAlert } from "lucide-react";

import type { SceneDocument } from "@web3d/document";
import type { JsonValue } from "@web3d/runtime";

import { useStudioI18n } from "../i18n/I18nProvider";
import { DEFAULT_PREVIEW_CONNECTION } from "./preview-state";
import type { StudioPreviewState } from "./types";

interface RunPreviewPanelProps {
  readonly document: SceneDocument;
  readonly preview: StudioPreviewState;
  readonly selectedEntityId: string | null;
  readonly onFocusTarget: (targetId: string) => void;
}

export function RunPreviewPanel(props: RunPreviewPanelProps) {
  const { t } = useStudioI18n();
  const selectedTargetIds = new Set(
    props.document.targets
      .filter((target) => target.entityId === props.selectedEntityId)
      .map((target) => target.id),
  );
  const values = Object.values(props.preview.values).sort((left, right) => {
    const leftSelected = selectedTargetIds.has(left.targetId) ? 0 : 1;
    const rightSelected = selectedTargetIds.has(right.targetId) ? 0 : 1;
    return leftSelected - rightSelected || left.bindingId.localeCompare(right.bindingId, "en");
  });

  return (
    <div className="run-preview-panel">
      <section className="data-section">
        <h2>
          <Radio size={13} /> {t.dataBinding.run.sourceStatus}
        </h2>
        <div className="runtime-row-list" aria-live="polite">
          {props.document.dataSources.map((source) => {
            const status = props.preview.connections[source.id] ?? DEFAULT_PREVIEW_CONNECTION;
            return (
              <div className="runtime-row" key={source.id}>
                <span className={`runtime-status status-${status}`}>
                  <span className="status-dot" />
                  {t.dataBinding.run.connection[status]}
                </span>
                <strong>{source.name}</strong>
                <small className="mono">{source.id}</small>
              </div>
            );
          })}
          {props.document.dataSources.length === 0 && (
            <p className="data-empty">{t.dataBinding.run.none}</p>
          )}
        </div>
      </section>
      <section className="data-section">
        <h2>
          <Activity size={13} /> {t.dataBinding.run.bindingValues}
        </h2>
        <div className="runtime-row-list">
          {values.map((state) => {
            const binding = props.document.bindings.find(
              (candidate) => candidate.id === state.bindingId,
            );
            return (
              <div className="runtime-row" key={state.bindingId}>
                <strong className="runtime-value mono">{formatRuntimeValue(state.value)}</strong>
                <span className={`runtime-quality quality-${state.quality}`}>
                  {t.dataBinding.run.quality[state.quality]}
                </span>
                <small className="mono" title={binding?.pointer}>
                  {binding?.pointer ?? state.bindingId}
                </small>
              </div>
            );
          })}
          {values.length === 0 && <p className="data-empty">{t.dataBinding.run.waiting}</p>}
        </div>
      </section>
      <section className="data-section">
        <h2>
          <AlertTriangle size={13} /> {t.dataBinding.run.alarms}
          <span className="section-count">{props.preview.alarms.length}</span>
        </h2>
        <div className="runtime-row-list" aria-live="polite">
          {props.preview.alarms.map((alarm) => (
            <button
              aria-label={t.dataBinding.run.focusAlarm(alarm.targetId)}
              className={`runtime-alarm alarm-${alarm.level}`}
              key={alarm.key}
              title={t.dataBinding.run.focusAlarm(alarm.targetId)}
              type="button"
              onClick={() => props.onFocusTarget(alarm.targetId)}
            >
              <AlertTriangle size={14} />
              <span>
                <strong>{alarm.message}</strong>
                <small className="mono">{alarm.targetId}</small>
              </span>
            </button>
          ))}
          {props.preview.alarms.length === 0 && (
            <p className="data-empty">{t.dataBinding.run.none}</p>
          )}
        </div>
      </section>
      <section className="data-section">
        <h2>
          <TriangleAlert size={13} /> {t.dataBinding.run.diagnostics}
          <span className="section-count">{props.preview.diagnostics.length}</span>
        </h2>
        <div className="runtime-diagnostics mono">
          {props.preview.diagnostics.length === 0
            ? t.dataBinding.run.none
            : props.preview.diagnostics.map((diagnostic) => diagnostic.code).join(" · ")}
        </div>
      </section>
    </div>
  );
}

function formatRuntimeValue(value: JsonValue | undefined): string {
  if (value === undefined) return "--";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}
