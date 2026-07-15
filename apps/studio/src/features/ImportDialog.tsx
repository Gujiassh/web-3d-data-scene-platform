import { AlertTriangle, Box, FileBox, LoaderCircle, X } from "lucide-react";

import { useStudioI18n } from "../i18n/I18nProvider";

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
  const { formatters, t } = useStudioI18n();
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
            <h2 id="import-dialog-title">{t.importDialog.title}</h2>
            <span className="mono">{importFileName(state)}</span>
          </div>
          <button
            aria-label={t.importDialog.close}
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
            <span>{t.importDialog.inspecting}</span>
          </div>
        )}

        {state.status === "failed" && (
          <div className="import-failure" role="alert">
            <AlertTriangle size={17} />
            <strong>{t.importDialog.failed}</strong>
            <span>{state.message}</span>
          </div>
        )}

        {summary !== null && (
          <>
            <div className="import-summary-grid" data-testid="import-summary">
              <SummaryMetric label={t.importDialog.metrics.nodes} value={summary.nodeCount} />
              <SummaryMetric label={t.importDialog.metrics.meshes} value={summary.meshCount} />
              <SummaryMetric
                label={t.importDialog.metrics.materials}
                value={summary.materialCount}
              />
              <SummaryMetric
                label={t.importDialog.metrics.triangles}
                value={summary.triangleCount}
              />
            </div>
            <dl className="import-file-details">
              <div>
                <dt>{t.importDialog.details.format}</dt>
                <dd>{summary.mediaType === "model/gltf-binary" ? "GLB" : "glTF"}</dd>
              </div>
              <div>
                <dt>{t.importDialog.details.size}</dt>
                <dd>{formatters.formatBytes(summary.byteLength)}</dd>
              </div>
              <div>
                <dt>{t.importDialog.details.sha256}</dt>
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
            {t.importDialog.cancel}
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
            {t.importDialog.confirm}
          </button>
        </footer>
      </section>
    </div>
  );
}

function SummaryMetric({ label, value }: { readonly label: string; readonly value: number }) {
  const { formatters } = useStudioI18n();

  return (
    <div>
      <span>{label}</span>
      <strong>{formatters.formatCount(value)}</strong>
    </div>
  );
}

function importFileName(state: ImportDialogProps["state"]): string {
  return state.status === "ready" || state.status === "committing"
    ? state.summary.fileName
    : state.fileName;
}
