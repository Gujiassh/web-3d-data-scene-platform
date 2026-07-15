import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { LanguageSwitch } from "@web3d/demo-support/language-switch";
import { ThemeSwitch } from "@web3d/demo-support/theme-switch";
import { useTheme } from "@web3d/demo-support/theme-provider";
import { SceneViewer, type SceneViewerHandle } from "@web3d/react";
import type {
  ConnectionStatus,
  Diagnostic,
  RuntimeAlarm,
  ViewerEvent,
  ViewerSnapshot,
} from "@web3d/runtime";
import { Activity, AlertTriangle, Box, Crosshair, RefreshCw, Radio } from "lucide-react";

import { createM0Adapter, equipment, loadM0Scene } from "@web3d/demo-support";

import { useFactoryI18n } from "./i18n/I18nProvider";
import {
  alarmMessage,
  connectionLabel,
  equipmentArea,
  equipmentLabel,
  equipmentStateLabel,
  formatCount,
  resolveEquipmentDisplayState,
  sceneLoadErrorMessage,
} from "./i18n/presentation";

interface SceneLoadFailure {
  readonly error: unknown;
}

export function App() {
  const { catalog, locale, setLocale } = useFactoryI18n();
  const { theme, toggleTheme } = useTheme();
  const viewerRef = useRef<SceneViewerHandle>(null);
  const [scene, setScene] = useState<Awaited<ReturnType<typeof loadM0Scene>> | null>(null);
  const [loadFailure, setLoadFailure] = useState<SceneLoadFailure | null>(null);
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [connection, setConnection] = useState<ConnectionStatus>("connecting");
  const [alarms, setAlarms] = useState<ReadonlyMap<string, RuntimeAlarm>>(new Map());
  const [diagnostics, setDiagnostics] = useState<readonly Diagnostic[]>([]);
  const [snapshot, setSnapshot] = useState<ViewerSnapshot | null>(null);
  const [cycle, setCycle] = useState(0);
  const adapter = useMemo(() => createM0Adapter(cycle), [cycle]);
  const adapters = useMemo(() => ({ "factory-telemetry": adapter }), [adapter]);

  useEffect(() => {
    const controller = new AbortController();
    loadM0Scene(controller.signal)
      .then((value) => {
        setScene(value);
        setLoadFailure(null);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setLoadFailure({ error });
        }
      });
    return () => controller.abort();
  }, []);

  const refreshSnapshot = useCallback(() => {
    try {
      setSnapshot(viewerRef.current?.getSnapshot() ?? null);
    } catch {
      setSnapshot(null);
    }
  }, []);

  const handleEvent = useCallback(
    (event: ViewerEvent) => {
      if (event.type === "selection-change") setSelectedTargetId(event.targetId);
      if (event.type === "connection-change") setConnection(event.status);
      if (event.type === "diagnostic") {
        setDiagnostics((current) => [...current.slice(-5), event.diagnostic]);
      }
      if (event.type === "alarm") {
        setAlarms((current) => {
          const next = new Map(current);
          if (event.transition === "cleared") next.delete(event.alarm.key);
          else next.set(event.alarm.key, event.alarm);
          return next;
        });
      }
      if (event.type !== "performance" && event.type !== "load-progress") refreshSnapshot();
    },
    [refreshSnapshot],
  );

  const focus = useCallback((targetId: string) => {
    void viewerRef.current?.focusTarget(targetId);
  }, []);

  const selectedEquipment = equipment.find((item) => item.id === selectedTargetId) ?? null;
  const activeAlarms = [...alarms.values()];
  const connectionDisplay = connectionLabel(catalog, connection);
  const sceneConnection = snapshot?.connections["factory-telemetry"] ?? connection;

  return (
    <div className="factory-app">
      <header className="factory-header">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">
            <Box size={18} strokeWidth={1.8} />
          </div>
          <div>
            <strong>{catalog.header.name}</strong>
            <span>{catalog.header.subtitle}</span>
          </div>
        </div>
        <div className="header-actions">
          <LanguageSwitch
            ariaLabel={catalog.header.languageSwitch}
            chineseLabel={catalog.header.switchToChinese}
            englishLabel={catalog.header.switchToEnglish}
            locale={locale}
            onChange={setLocale}
          />
          <ThemeSwitch
            darkLabel={catalog.header.switchToDarkTheme}
            lightLabel={catalog.header.switchToLightTheme}
            theme={theme}
            onToggle={toggleTheme}
          />
          <div
            aria-label={`${catalog.header.connection}: ${connectionDisplay}`}
            className={`connection-state connection-${connection}`}
            data-testid="connection-state"
            title={connectionDisplay}
          >
            <span className="status-dot" />
            {connectionDisplay}
          </div>
          <button
            className="header-command"
            title={catalog.header.restartSequenceTitle}
            type="button"
            onClick={() => setCycle((value) => value + 1)}
          >
            <RefreshCw size={15} />
            {catalog.header.restartSequence}
          </button>
        </div>
      </header>

      <main className="factory-workspace">
        <aside className="equipment-rail" aria-label={catalog.rails.equipment}>
          <div className="rail-heading">
            <span>{catalog.rails.equipment}</span>
            <b>{formatCount(locale, equipment.length)}</b>
          </div>
          <div className="equipment-list">
            {equipment.map((item) => {
              const alarm = activeAlarms.find((candidate) => candidate.targetId === item.id);
              const state = resolveEquipmentDisplayState(connection, alarm);
              const label = equipmentLabel(catalog, item.labelKey);
              return (
                <button
                  aria-label={catalog.equipment.focusTitle(label)}
                  className={`equipment-row ${selectedTargetId === item.id ? "is-selected" : ""}`}
                  data-testid={`equipment-${item.id}`}
                  key={item.id}
                  title={catalog.equipment.focusTitle(label)}
                  type="button"
                  onClick={() => focus(item.id)}
                >
                  <span className={`equipment-icon state-${state}`}>
                    {alarm === undefined ? <Activity size={16} /> : <AlertTriangle size={16} />}
                  </span>
                  <span>
                    <strong>{label}</strong>
                    <small>{equipmentArea(catalog, item.areaKey)}</small>
                  </span>
                  <span className={`state-label state-${state}`}>
                    {equipmentStateLabel(catalog, state)}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="rail-footer mono">
            <Radio size={14} />
            {catalog.telemetry.pointer}
          </div>
        </aside>

        <section className="viewer-stage" aria-label={catalog.rails.viewer}>
          {scene === null ? (
            <div className="stage-message" role="status">
              {loadFailure === null
                ? catalog.viewer.loading
                : catalog.viewer.loadError(sceneLoadErrorMessage(catalog, loadFailure.error))}
            </div>
          ) : (
            <SceneViewer
              ref={viewerRef}
              adapters={adapters}
              canvasLabel={catalog.viewer.canvasLabel}
              className="factory-viewer"
              source={scene}
              onEvent={handleEvent}
            />
          )}
          <div className="viewport-badge mono">
            <Crosshair size={13} />
            {selectedEquipment?.businessId ?? catalog.viewer.noSelection}
          </div>
          <div className="viewport-metrics">
            <Metric
              label={catalog.metrics.targets}
              value={formatCount(locale, scene?.targets.length ?? 0)}
            />
            <Metric
              label={catalog.metrics.bindings}
              value={formatCount(locale, scene?.bindings.length ?? 0)}
            />
            <Metric
              label={catalog.metrics.alarms}
              value={formatCount(locale, activeAlarms.length)}
              tone="danger"
            />
          </div>
        </section>

        <aside className="operations-rail" aria-label={catalog.rails.operations}>
          <section className="detail-section">
            <div className="section-heading">{catalog.selected.heading}</div>
            {selectedEquipment === null ? (
              <p className="empty-copy">{catalog.selected.empty}</p>
            ) : (
              <dl className="target-details">
                <div>
                  <dt>{catalog.selected.target}</dt>
                  <dd>{equipmentLabel(catalog, selectedEquipment.labelKey)}</dd>
                </div>
                <div>
                  <dt>{catalog.selected.businessId}</dt>
                  <dd className="mono">{selectedEquipment.businessId}</dd>
                </div>
                <div>
                  <dt>{catalog.selected.connection}</dt>
                  <dd>{connectionLabel(catalog, sceneConnection)}</dd>
                </div>
              </dl>
            )}
          </section>

          <section className="detail-section alarm-section">
            <div className="section-heading">
              {catalog.alarms.heading}
              <span>{formatCount(locale, activeAlarms.length)}</span>
            </div>
            {activeAlarms.length === 0 ? (
              <div className="alarm-empty">
                <Activity size={16} />
                {catalog.alarms.none}
              </div>
            ) : (
              <div className="alarm-list" data-testid="alarm-list">
                {activeAlarms.map((alarm) => (
                  <button
                    aria-label={catalog.alarms.focusTitle(alarm.targetId)}
                    className={`alarm-row alarm-${alarm.level}`}
                    key={alarm.key}
                    title={catalog.alarms.focusTitle(alarm.targetId)}
                    type="button"
                    onClick={() => focus(alarm.targetId)}
                  >
                    <AlertTriangle size={15} />
                    <span>
                      <strong>{alarmMessage(catalog, alarm)}</strong>
                      <small className="mono">{alarm.targetId}</small>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="detail-section diagnostics-section">
            <div className="section-heading">{catalog.diagnostics.heading}</div>
            <div className="diagnostic-count mono">
              {catalog.diagnostics.recent(formatCount(locale, diagnostics.length))}
            </div>
          </section>
        </aside>
      </main>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "danger" }) {
  return (
    <div className={`metric ${tone === undefined ? "" : `metric-${tone}`}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
