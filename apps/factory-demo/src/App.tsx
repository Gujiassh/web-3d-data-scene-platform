import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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

export function App() {
  const viewerRef = useRef<SceneViewerHandle>(null);
  const [scene, setScene] = useState<Awaited<ReturnType<typeof loadM0Scene>> | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
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
      .then(setScene)
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setLoadError(error instanceof Error ? error.message : "Scene loading failed.");
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

  return (
    <div className="factory-app">
      <header className="factory-header">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">
            <Box size={18} strokeWidth={1.8} />
          </div>
          <div>
            <strong>Factory Cell M0</strong>
            <span>Runtime contract demo</span>
          </div>
        </div>
        <div className={`connection-state connection-${connection}`} data-testid="connection-state">
          <span className="status-dot" />
          {connection}
        </div>
        <button
          className="header-command"
          type="button"
          onClick={() => setCycle((value) => value + 1)}
        >
          <RefreshCw size={15} />
          Restart sequence
        </button>
      </header>

      <main className="factory-workspace">
        <aside className="equipment-rail" aria-label="Equipment">
          <div className="rail-heading">
            <span>Equipment</span>
            <b>{equipment.length}</b>
          </div>
          <div className="equipment-list">
            {equipment.map((item) => {
              const alarm = activeAlarms.find((candidate) => candidate.targetId === item.id);
              const state = connection === "offline" ? "offline" : (alarm?.level ?? "running");
              return (
                <button
                  className={`equipment-row ${selectedTargetId === item.id ? "is-selected" : ""}`}
                  data-testid={`equipment-${item.id}`}
                  key={item.id}
                  type="button"
                  onClick={() => focus(item.id)}
                >
                  <span className={`equipment-icon state-${state}`}>
                    {alarm === undefined ? <Activity size={16} /> : <AlertTriangle size={16} />}
                  </span>
                  <span>
                    <strong>{item.label}</strong>
                    <small>{item.area}</small>
                  </span>
                  <span className={`state-label state-${state}`}>{state}</span>
                </button>
              );
            })}
          </div>
          <div className="rail-footer mono">
            <Radio size={14} />
            /machines/*/status
          </div>
        </aside>

        <section className="viewer-stage" aria-label="Factory 3D view">
          {scene === null ? (
            <div className="stage-message" role="status">
              {loadError ?? "Loading validated scene..."}
            </div>
          ) : (
            <SceneViewer
              ref={viewerRef}
              adapters={adapters}
              className="factory-viewer"
              source={scene}
              onEvent={handleEvent}
            />
          )}
          <div className="viewport-badge mono">
            <Crosshair size={13} />
            {selectedEquipment?.businessId ?? "NO SELECTION"}
          </div>
          <div className="viewport-metrics">
            <Metric label="Targets" value={String(scene?.targets.length ?? 0)} />
            <Metric label="Bindings" value={String(scene?.bindings.length ?? 0)} />
            <Metric label="Alarms" value={String(activeAlarms.length)} tone="danger" />
          </div>
        </section>

        <aside className="operations-rail" aria-label="Runtime operations">
          <section className="detail-section">
            <div className="section-heading">Selected target</div>
            {selectedEquipment === null ? (
              <p className="empty-copy">Select a machine in the view or equipment list.</p>
            ) : (
              <dl className="target-details">
                <div>
                  <dt>Target</dt>
                  <dd>{selectedEquipment.label}</dd>
                </div>
                <div>
                  <dt>Business ID</dt>
                  <dd className="mono">{selectedEquipment.businessId}</dd>
                </div>
                <div>
                  <dt>Connection</dt>
                  <dd>{snapshot?.connections["factory-telemetry"] ?? connection}</dd>
                </div>
              </dl>
            )}
          </section>

          <section className="detail-section alarm-section">
            <div className="section-heading">
              Active alarms
              <span>{activeAlarms.length}</span>
            </div>
            {activeAlarms.length === 0 ? (
              <div className="alarm-empty">
                <Activity size={16} />
                No active alarms
              </div>
            ) : (
              <div className="alarm-list" data-testid="alarm-list">
                {activeAlarms.map((alarm) => (
                  <button
                    className={`alarm-row alarm-${alarm.level}`}
                    key={alarm.key}
                    type="button"
                    onClick={() => focus(alarm.targetId)}
                  >
                    <AlertTriangle size={15} />
                    <span>
                      <strong>{alarm.message}</strong>
                      <small className="mono">{alarm.targetId}</small>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="detail-section diagnostics-section">
            <div className="section-heading">Diagnostics</div>
            <div className="diagnostic-count mono">{diagnostics.length} recent</div>
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
