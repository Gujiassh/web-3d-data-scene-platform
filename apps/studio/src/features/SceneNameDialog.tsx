import { useEffect, useId, useRef, useState } from "react";
import { FilePlus2, LoaderCircle, Pencil, X } from "lucide-react";

import { useStudioI18n } from "../i18n/I18nProvider";

export type SceneNameDialogMode = "create" | "rename";

interface SceneNameDialogProps {
  readonly mode: SceneNameDialogMode;
  readonly initialName: string;
  readonly onCancel: () => void;
  readonly onConfirm: (name: string) => boolean | Promise<boolean>;
}

export function SceneNameDialog({ mode, initialName, onCancel, onConfirm }: SceneNameDialogProps) {
  const { t } = useStudioI18n();
  const backdropRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const errorId = useId();
  const [draft, setDraft] = useState(initialName);
  const [attempted, setAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submissionFailed, setSubmissionFailed] = useState(false);
  const name = draft.trim();
  const invalid = attempted && name === "";
  const errorMessage = invalid
    ? t.sceneNameDialog.required
    : submissionFailed
      ? mode === "create"
        ? t.sceneNameDialog.createFailed
        : t.sceneNameDialog.renameFailed
      : "";

  useEffect(() => {
    const backdrop = backdropRef.current;
    const siblings = backdrop?.parentElement
      ? [...backdrop.parentElement.children].filter(
          (element): element is HTMLElement =>
            element instanceof HTMLElement && element !== backdrop,
        )
      : [];
    const previousInert = siblings.map((element) => ({ element, inert: element.inert }));
    for (const sibling of siblings) sibling.inert = true;
    inputRef.current?.focus();
    inputRef.current?.select();
    return () => {
      for (const entry of previousInert) entry.element.inert = entry.inert;
    };
  }, []);

  const submit = async (): Promise<void> => {
    setAttempted(true);
    if (name === "" || submitting) return;
    setSubmissionFailed(false);
    setSubmitting(true);
    try {
      const accepted = await onConfirm(name);
      if (!accepted) {
        setSubmissionFailed(true);
        setSubmitting(false);
      }
    } catch {
      setSubmissionFailed(true);
      setSubmitting(false);
    }
  };

  return (
    <div
      ref={backdropRef}
      className="dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target && !submitting) onCancel();
      }}
    >
      <section
        ref={dialogRef}
        aria-labelledby={`${inputId}-title`}
        aria-modal="true"
        aria-busy={submitting}
        className="scene-name-dialog"
        role="dialog"
        onKeyDown={(event) => {
          if (event.key === "Escape" && !submitting) {
            event.preventDefault();
            event.stopPropagation();
            onCancel();
          }
          if (event.key === "Tab") trapFocus(event, dialogRef.current);
        }}
      >
        <header>
          <span className="dialog-symbol">
            {mode === "create" ? <FilePlus2 size={18} /> : <Pencil size={18} />}
          </span>
          <h2 id={`${inputId}-title`}>
            {mode === "create" ? t.sceneNameDialog.createTitle : t.sceneNameDialog.renameTitle}
          </h2>
          <button
            aria-label={t.sceneNameDialog.close}
            className="icon-button"
            disabled={submitting}
            title={t.sceneNameDialog.close}
            type="button"
            onClick={onCancel}
          >
            <X size={15} />
          </button>
        </header>

        <form
          aria-busy={submitting}
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <label htmlFor={inputId}>{t.sceneNameDialog.nameLabel}</label>
          <input
            ref={inputRef}
            aria-describedby={errorMessage === "" ? undefined : errorId}
            aria-invalid={invalid || submissionFailed}
            autoComplete="off"
            id={inputId}
            maxLength={160}
            placeholder={t.sceneNameDialog.placeholder}
            value={draft}
            onChange={(event) => {
              setDraft(event.currentTarget.value);
              if (attempted) setAttempted(false);
              if (submissionFailed) setSubmissionFailed(false);
            }}
          />
          <span
            aria-live="polite"
            className="field-error"
            id={errorId}
            role={errorMessage === "" ? undefined : "alert"}
          >
            {errorMessage}
          </span>
          <footer>
            <button
              className="secondary-command"
              disabled={submitting}
              type="button"
              onClick={onCancel}
            >
              {t.sceneNameDialog.cancel}
            </button>
            <button className="primary-command" disabled={submitting} type="submit">
              {submitting && <LoaderCircle className="spin" size={14} />}
              {submitting
                ? mode === "create"
                  ? t.sceneNameDialog.creating
                  : t.sceneNameDialog.renaming
                : mode === "create"
                  ? t.sceneNameDialog.create
                  : t.sceneNameDialog.rename}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}

function trapFocus(event: React.KeyboardEvent, container: HTMLElement | null): void {
  if (container === null) return;
  const focusable = [...container.querySelectorAll<HTMLElement>(focusableSelector)].filter(
    (element) => !element.inert && !element.hasAttribute("disabled"),
  );
  const first = focusable[0];
  const last = focusable.at(-1);
  if (first === undefined || last === undefined) return;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

const focusableSelector =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
