import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { SceneViewer, type SceneViewerHandle } from "@web3d/react";
import type { ConnectionStatus, Diagnostic, ViewerEvent } from "@web3d/runtime";
import {
  Activity,
  Box,
  Braces,
  Crosshair,
  Database,
  Download,
  FolderTree,
  Pause,
  Play,
  Radio,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";

import { createM0Adapter, equipment, loadM0Scene } from "@web3d/demo-support";

type StudioMode = "inspect" | "run";

export function App() {
  const desktopViewport = useDesktopViewport();
  const viewerRef = useRef<SceneViewerHandle>(null);
  const [scene, setScene] = useState<Awaited<ReturnType<typeof loadM0Scene>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<StudioMode>("run");
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [connection, setConnection] = useState<ConnectionStatus>("connecting");
  const [diagnostics, setDiagnostics] = useState<readonly Diagnostic[]>([]);
  const [cycle, setCycle] = useState(0);
  const adapter = useMemo(() => createM0Adapter(cycle), [cycle]);
  const adapters = useMemo(
    () => (mode === "run" ? { "factory-telemetry": adapter } : {}),
    [adapter, mode],
  );

  useEffect(() => {
    if (!desktopViewport) return;
    const controller = new AbortController();
    loadM0Scene(controller.signal)
      .then(setScene)
      .catch((value: unknown) => {
        if (!controller.signal.aborted) {
          setError(value instanceof Error ? value.message : "Scene loading failed.");
        }
      });
    return () => controller.abort();
  }, [desktopViewport]);

  const handleEvent = useCallback((event: ViewerEvent) => {
    if (event.type === "selection-change") setSelectedTargetId(event.targetId);
    if (event.type === "connection-change") setConnection(event.status);
    if (event.type === "diagnostic") {
      setDiagnostics((current) => [...current.slice(-7), event.diagnostic]);
    }
  }, []);

  const focus = useCallback((targetId: string) => {
    setSelectedTargetId(targetId);
    void viewerRef.current?.focusTarget(targetId);
  }, []);

  const downloadScene = useCallback(() => {
    if (scene === null) return;
    const url = URL.createObjectURL(
      new Blob([`${JSON.stringify(scene, null, 2)}\n`], { type: "application/json" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "m0-factory-cell.scene.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }, [scene]);

  const selected = equipment.find((item) => item.id === selectedTargetId) ?? null;
  const selectedBinding = scene?.bindings.find((binding) => binding.targetId === selectedTargetId);
  const selectedRuleSet = scene?.ruleSets.find(
    (ruleSet) => ruleSet.id === selectedBinding?.ruleSetId,
  );

  if (!desktopViewport) {
    return (
      <div className="studio-app">
        <div className="studio-size-gate">
          <Box size={22} />
          <strong>Studio requires a 1280px desktop viewport.</strong>
        </div>
      </div>
    );
  }

  return (
    <div className="studio-app">
      <header className="studio-toolbar">
        <div className="studio-project">
          <span className="project-symbol">
            <Box size={16} />
          </span>
          <div>
            <strong>M0 Factory Cell</strong>
            <span>Saved locally</span>
          </div>
        </div>

        <div className="mode-control" aria-label="Studio mode">
          <button
            className={mode === "inspect" ? "is-active" : ""}
            type="button"
            onClick={() => setMode("inspect")}
          >
            <Pause size={14} />
            Inspect
          </button>
          <button
            className={mode === "run" ? "is-active" : ""}
            type="button"
            onClick={() => {
              if (mode !== "run") setCycle((value) => value + 1);
              setMode("run");
            }}
          >
            <Play size={14} />
            Run
          </button>
        </div>

        <div className="toolbar-spacer" />
        <div className={`studio-connection connection-${connection}`}>
          <span className="status-dot" />
          {mode === "inspect" ? "adapter paused" : connection}
        </div>
        <button
          aria-label="Restart data sequence"
          className="icon-button"
          title="Restart data sequence"
          type="button"
          onClick={() => setCycle((value) => value + 1)}
        >
          <RefreshCw size={16} />
        </button>
        <button className="export-command" type="button" onClick={downloadScene}>
          <Download size={15} />
          Export JSON
        </button>
      </header>

      <main className="studio-workspace">
        <aside className="studio-left" aria-label="Scene navigation">
          <div className="panel-tabs">
            <button className="is-active" type="button">
              <FolderTree size={14} />
              Scene
            </button>
            <button type="button">
              <Box size={14} />
              Assets
            </button>
          </div>
          <div className="scene-tree">
            <div className="tree-root">
              <span className="tree-caret">⌄</span>
              <Box size={14} />
              <span>Factory Cell</span>
            </div>
            {equipment.map((item) => (
              <button
                className={`tree-row ${selectedTargetId === item.id ? "is-selected" : ""}`}
                data-testid={`tree-${item.id}`}
                key={item.id}
                type="button"
                onClick={() => focus(item.id)}
              >
                <span className="tree-line" />
                <Activity size={14} />
                <span>{item.label}</span>
              </button>
            ))}
          </div>
          <div className="source-summary">
            <Radio size={14} />
            <span>
              <strong>factory-telemetry</strong>
              <small>{mode === "inspect" ? "paused" : connection}</small>
            </span>
          </div>
        </aside>

        <section className="studio-viewport" aria-label="Studio 3D viewport">
          {scene === null ? (
            <div className="viewport-loading">{error ?? "Validating scene contract..."}</div>
          ) : (
            <SceneViewer
              ref={viewerRef}
              adapters={adapters}
              className="studio-viewer"
              source={scene}
              onEvent={handleEvent}
            />
          )}
          <div className="viewport-mode mono">
            <Crosshair size={13} />
            {mode.toUpperCase()} / {selected?.businessId ?? "NO TARGET"}
          </div>
        </section>

        <aside className="studio-inspector" aria-label="Inspector">
          <div className="inspector-header">
            <span>Inspector</span>
            <span className="mono">{selected?.businessId ?? "none"}</span>
          </div>
          <section className="inspector-section">
            <h2>Target</h2>
            <InspectorRow label="Name" value={selected?.label ?? "No selection"} />
            <InspectorRow label="Target ID" value={selected?.id ?? "—"} mono />
            <InspectorRow label="Node index" value={selected?.id === "press-01" ? "0" : "1"} mono />
          </section>
          <section className="inspector-section">
            <h2>
              <Database size={13} />
              Data binding
            </h2>
            <InspectorRow label="Source" value={selectedBinding?.sourceId ?? "—"} mono />
            <InspectorRow label="Pointer" value={selectedBinding?.pointer ?? "—"} mono wrap />
          </section>
          <section className="inspector-section">
            <h2>
              <Braces size={13} />
              Rules
            </h2>
            <div className="rule-list">
              {selectedRuleSet?.rules.map((rule) => (
                <div className="rule-row" key={rule.id}>
                  <span>{String(rule.when.expected ?? rule.when.operator)}</span>
                  <small className="mono">P{rule.priority}</small>
                </div>
              )) ?? <span className="muted">No rule set</span>}
            </div>
          </section>
        </aside>

        <section className="studio-diagnostics" aria-label="Diagnostics">
          <div className="diagnostics-title">
            <TriangleAlert size={14} />
            Diagnostics
            <span>{diagnostics.length}</span>
          </div>
          <div className="diagnostics-stream mono">
            {diagnostics.length === 0
              ? "contract=valid asset_hash=verified targets=2"
              : diagnostics.map((item) => `${item.code} ${item.message}`).join(" · ")}
          </div>
        </section>
      </main>
    </div>
  );
}

function useDesktopViewport(): boolean {
  const query = "(min-width: 1280px)";
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const media = window.matchMedia(query);
    const update = (): void => setMatches(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return matches;
}

function InspectorRow({
  label,
  value,
  mono,
  wrap,
}: {
  label: string;
  value: string;
  mono?: boolean;
  wrap?: boolean;
}) {
  return (
    <div className="inspector-row">
      <span>{label}</span>
      <strong className={`${mono === true ? "mono" : ""} ${wrap === true ? "wrap" : ""}`}>
        {value}
      </strong>
    </div>
  );
}
