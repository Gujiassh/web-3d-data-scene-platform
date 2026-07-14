import { AlertTriangle, Box, FileBox, LoaderCircle, X } from "lucide-react";

export interface ModelImportSummary {
  readonly fileName: string;
  readonly mediaType: "model/gltf-binary" | "model/gltf+json";
  readonly byteLength: number;
  readonly sha256: string;
  readonly nodeCount: number;
  readonly meshCount: number;
  readonly materialCount: number;
  readonly triangleCount: number;
  readonly warnings: readonly string[];
}

interface ImportDialogProps {
  readonly state:
    | { readonly status: "inspecting"; readonly fileName: string }
    | { readonly status: "ready"; readonly summary: ModelImportSummary }
    | { readonly status: "committing"; readonly summary: ModelImportSummary }
    | { readonly status: "failed"; readonly fileName: string; readonly message: string };
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}

export function ImportDialog({ state, onCancel, onConfirm }: ImportDialogProps) {
  const summary = state.status === "ready" || state.status === "committing" ? state.summary : null;
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onCancel}>
      <section
        aria-labelledby="import-dialog-title"
        aria-modal="true"
        className="import-dialog"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <span className="dialog-symbol">
            <FileBox size={17} />
          </span>
          <div>
            <h2 id="import-dialog-title">Import model</h2>
            <span className="mono">{importFileName(state)}</span>
          </div>
          <button
            aria-label="Close import"
            className="icon-button"
            type="button"
            onClick={onCancel}
          >
            <X size={16} />
          </button>
        </header>

        {state.status === "inspecting" && (
          <div className="dialog-progress">
            <LoaderCircle className="spin" size={18} />
            <span>Inspecting model</span>
          </div>
        )}

        {state.status === "failed" && (
          <div className="import-failure" role="alert">
            <AlertTriangle size={17} />
            <strong>Import failed</strong>
            <span>{state.message}</span>
          </div>
        )}

        {summary !== null && (
          <>
            <div className="import-summary-grid" data-testid="import-summary">
              <SummaryMetric label="Nodes" value={summary.nodeCount} />
              <SummaryMetric label="Meshes" value={summary.meshCount} />
              <SummaryMetric label="Materials" value={summary.materialCount} />
              <SummaryMetric label="Triangles" value={summary.triangleCount} />
            </div>
            <dl className="import-file-details">
              <div>
                <dt>Format</dt>
                <dd>{summary.mediaType === "model/gltf-binary" ? "GLB" : "glTF"}</dd>
              </div>
              <div>
                <dt>Size</dt>
                <dd>{formatBytes(summary.byteLength)}</dd>
              </div>
              <div>
                <dt>SHA-256</dt>
                <dd className="mono">{summary.sha256}</dd>
              </div>
            </dl>
            {summary.warnings.length > 0 && (
              <div className="import-warnings">
                {summary.warnings.map((warning) => (
                  <div key={warning}>
                    <AlertTriangle size={13} />
                    <span>{warning}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        <footer>
          <button className="secondary-command" type="button" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="primary-command"
            disabled={state.status !== "ready"}
            type="button"
            onClick={onConfirm}
          >
            {state.status === "committing" ? (
              <LoaderCircle className="spin" size={15} />
            ) : (
              <Box size={15} />
            )}
            Add to scene
          </button>
        </footer>
      </section>
    </div>
  );
}

function SummaryMetric({ label, value }: { readonly label: string; readonly value: number }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value.toLocaleString("en-US")}</strong>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

function importFileName(state: ImportDialogProps["state"]): string {
  return state.status === "ready" || state.status === "committing"
    ? state.summary.fileName
    : state.fileName;
}
