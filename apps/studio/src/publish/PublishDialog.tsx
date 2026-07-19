import { useEffect, useRef } from "react";
import { AlertTriangle, Check, LoaderCircle, PackageCheck, X } from "lucide-react";

import type { PublishBlocker } from "@web3d/publish";

import { useStudioI18n } from "../i18n/I18nProvider";

export type PublishDialogState =
  | { readonly status: "checking" }
  | { readonly status: "blocked"; readonly blockers: readonly PublishBlocker[] }
  | { readonly status: "failed" }
  | { readonly status: "published"; readonly fileName: string };

interface PublishDialogProps {
  readonly state: PublishDialogState;
  readonly onClose: () => void;
}

export function PublishDialog({ state, onClose }: PublishDialogProps) {
  const { t } = useStudioI18n();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const blockerCodes =
    state.status === "blocked" ? [...new Set(state.blockers.map((blocker) => blocker.code))] : [];

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        aria-busy={state.status === "checking"}
        aria-labelledby="publish-dialog-title"
        aria-modal="true"
        className="publish-dialog"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <span className="dialog-symbol">
            <PackageCheck size={17} />
          </span>
          <h2 id="publish-dialog-title">{t.publishDialog.title}</h2>
          <button
            ref={closeRef}
            aria-label={t.publishDialog.close}
            className="icon-button"
            type="button"
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </header>

        {state.status === "checking" && (
          <div className="dialog-progress" data-testid="publish-checking">
            <LoaderCircle className="spin" size={18} />
            <span>{t.publishDialog.checking}</span>
          </div>
        )}

        {state.status === "blocked" && (
          <div className="publish-result is-blocked" role="alert">
            <AlertTriangle size={18} />
            <strong>{t.publishDialog.blocked}</strong>
            <ul>
              {blockerCodes.map((code) => (
                <li key={code}>{t.publishDialog.blockers[code]}</li>
              ))}
            </ul>
          </div>
        )}

        {state.status === "failed" && (
          <div className="publish-result is-blocked" role="alert">
            <AlertTriangle size={18} />
            <strong>{t.publishDialog.failed}</strong>
          </div>
        )}

        {state.status === "published" && (
          <div className="publish-result is-published" role="status">
            <Check size={18} />
            <strong>{t.publishDialog.published}</strong>
            <span className="mono">{state.fileName}</span>
          </div>
        )}

        <footer>
          <button className="primary-command" type="button" onClick={onClose}>
            {state.status === "checking" ? t.publishDialog.cancel : t.publishDialog.done}
          </button>
        </footer>
      </section>
    </div>
  );
}
