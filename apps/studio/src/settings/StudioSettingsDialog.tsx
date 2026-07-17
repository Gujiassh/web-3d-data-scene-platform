import { useEffect, useId, useRef, useState } from "react";
import { Settings2, X } from "lucide-react";

import { useStudioI18n } from "../i18n/I18nProvider";
import type { SceneSettingsDraft } from "../scene-settings/model";
import { SceneAppearancePanel } from "../scene-settings/SceneAppearancePanel";
import { SceneLightingPanel } from "../scene-settings/SceneLightingPanel";
import { detectStudioPlatform } from "../session/shortcut-registry";
import { resolveStudioShortcut } from "../session/shortcuts";
import { ApplicationSettingsPanel } from "./ApplicationSettingsPanel";

type SettingsTab = "application" | "scene" | "lighting";

interface StudioSettingsDialogProps {
  readonly draft: SceneSettingsDraft | null;
  readonly sceneEditable: boolean;
  readonly previewCancellation: number;
  readonly onClose: () => void;
  readonly onCancelScenePreview: () => void;
  readonly onCommitScene: (draft: SceneSettingsDraft) => boolean;
  readonly onPreviewScene: (draft: SceneSettingsDraft) => void;
  readonly onRedo: () => void;
  readonly onUndo: () => void;
}

export function StudioSettingsDialog(props: StudioSettingsDialogProps) {
  const { t } = useStudioI18n();
  const backdropRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const applicationTabRef = useRef<HTMLButtonElement>(null);
  const sceneTabRef = useRef<HTMLButtonElement>(null);
  const lightingTabRef = useRef<HTMLButtonElement>(null);
  const applicationPanelId = useId();
  const scenePanelId = useId();
  const lightingPanelId = useId();
  const runReasonId = useId();
  const errorId = useId();
  const [activeTab, setActiveTab] = useState<SettingsTab>("application");
  const [submissionFailed, setSubmissionFailed] = useState(false);

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
    applicationTabRef.current?.focus();
    return () => {
      for (const entry of previousInert) entry.element.inert = entry.inert;
    };
  }, []);

  const previewScene = (draft: SceneSettingsDraft): void => {
    setSubmissionFailed(false);
    props.onPreviewScene(draft);
  };
  const commitScene = (draft: SceneSettingsDraft): void => {
    setSubmissionFailed(!props.onCommitScene(draft));
  };
  const refs: Readonly<Record<SettingsTab, React.RefObject<HTMLButtonElement | null>>> = {
    application: applicationTabRef,
    scene: sceneTabRef,
    lighting: lightingTabRef,
  };

  return (
    <div
      ref={backdropRef}
      className="dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) props.onClose();
      }}
    >
      <section
        ref={dialogRef}
        aria-label={t.appSettings.title}
        aria-modal="true"
        className="studio-settings-dialog"
        role="dialog"
        onKeyDown={(event) => {
          const historyCommand = resolveDialogHistoryShortcut(event, props.sceneEditable);
          if (historyCommand !== null) {
            event.preventDefault();
            event.stopPropagation();
            setSubmissionFailed(false);
            if (historyCommand === "history.undo") props.onUndo();
            else props.onRedo();
            return;
          }
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            props.onClose();
          }
          if (event.key === "Tab") trapFocus(event, dialogRef.current);
        }}
      >
        <header>
          <span className="dialog-symbol">
            <Settings2 size={18} />
          </span>
          <h2>{t.appSettings.title}</h2>
          <button
            aria-label={t.appSettings.close}
            className="icon-button"
            title={t.appSettings.close}
            type="button"
            onClick={props.onClose}
          >
            <X size={15} />
          </button>
        </header>

        <div aria-label={t.appSettings.tabsLabel} className="studio-settings-tabs" role="tablist">
          <SettingsTabButton
            active={activeTab === "application"}
            controls={applicationPanelId}
            label={t.appSettings.applicationTab}
            tab="application"
            tabRef={applicationTabRef}
            onKeyDown={(event) =>
              handleTabKey(event, "application", props.sceneEditable, setActiveTab, refs)
            }
            onSelect={setActiveTab}
          />
          <SettingsTabButton
            {...(!props.sceneEditable ? { describedBy: runReasonId } : {})}
            active={activeTab === "scene"}
            controls={scenePanelId}
            disabled={!props.sceneEditable}
            label={t.appSettings.sceneTab}
            tab="scene"
            tabRef={sceneTabRef}
            onKeyDown={(event) =>
              handleTabKey(event, "scene", props.sceneEditable, setActiveTab, refs)
            }
            onSelect={setActiveTab}
          />
          <SettingsTabButton
            {...(!props.sceneEditable ? { describedBy: runReasonId } : {})}
            active={activeTab === "lighting"}
            controls={lightingPanelId}
            disabled={!props.sceneEditable}
            label={t.appSettings.lightingTab}
            tab="lighting"
            tabRef={lightingTabRef}
            onKeyDown={(event) =>
              handleTabKey(event, "lighting", props.sceneEditable, setActiveTab, refs)
            }
            onSelect={setActiveTab}
          />
        </div>

        {!props.sceneEditable && (
          <p className="settings-disabled-reason" id={runReasonId} role="status">
            {t.appSettings.sceneUnavailable}
          </p>
        )}

        <div className="studio-settings-content">
          <section
            aria-labelledby={`${applicationPanelId}-tab`}
            hidden={activeTab !== "application"}
            id={applicationPanelId}
            role="tabpanel"
          >
            <ApplicationSettingsPanel />
          </section>
          <section
            aria-labelledby={`${scenePanelId}-tab`}
            hidden={activeTab !== "scene"}
            id={scenePanelId}
            inert={!props.sceneEditable}
            role="tabpanel"
          >
            {props.draft !== null && (
              <SceneAppearancePanel
                draft={props.draft}
                previewCancellation={props.previewCancellation}
                onCommit={commitScene}
                onPreview={previewScene}
              />
            )}
          </section>
          <section
            aria-labelledby={`${lightingPanelId}-tab`}
            hidden={activeTab !== "lighting"}
            id={lightingPanelId}
            inert={!props.sceneEditable}
            role="tabpanel"
          >
            {props.draft !== null && (
              <SceneLightingPanel
                draft={props.draft}
                onCancelPreview={props.onCancelScenePreview}
                previewCancellation={props.previewCancellation}
                onCommit={commitScene}
                onPreview={previewScene}
              />
            )}
          </section>

          <span
            aria-live="polite"
            className="field-error"
            id={errorId}
            role={submissionFailed ? "alert" : undefined}
          >
            {submissionFailed ? t.sceneSettings.commitFailed : ""}
          </span>
        </div>
      </section>
    </div>
  );
}

function SettingsTabButton({
  active,
  controls,
  disabled,
  describedBy,
  label,
  tab,
  tabRef,
  onKeyDown,
  onSelect,
}: {
  readonly active: boolean;
  readonly controls: string;
  readonly disabled?: boolean;
  readonly describedBy?: string;
  readonly label: string;
  readonly tab: SettingsTab;
  readonly tabRef: React.RefObject<HTMLButtonElement | null>;
  readonly onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
  readonly onSelect: (tab: SettingsTab) => void;
}) {
  return (
    <button
      ref={tabRef}
      aria-controls={controls}
      aria-describedby={describedBy}
      aria-selected={active}
      disabled={disabled}
      id={`${controls}-tab`}
      role="tab"
      tabIndex={active ? 0 : -1}
      type="button"
      onClick={() => onSelect(tab)}
      onKeyDown={onKeyDown}
    >
      {label}
    </button>
  );
}

function handleTabKey(
  event: React.KeyboardEvent<HTMLButtonElement>,
  current: SettingsTab,
  sceneEditable: boolean,
  setActive: (tab: SettingsTab) => void,
  refs: Readonly<Record<SettingsTab, React.RefObject<HTMLButtonElement | null>>>,
): void {
  const tabs: readonly SettingsTab[] = sceneEditable
    ? ["application", "scene", "lighting"]
    : ["application"];
  let next: SettingsTab | null = null;
  if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
    const offset = event.key === "ArrowRight" ? 1 : -1;
    next = tabs[(tabs.indexOf(current) + offset + tabs.length) % tabs.length] ?? null;
  }
  if (event.key === "Home") next = tabs[0] ?? null;
  if (event.key === "End") next = tabs.at(-1) ?? null;
  if (next === null) return;
  event.preventDefault();
  setActive(next);
  refs[next].current?.focus();
}

function trapFocus(event: React.KeyboardEvent, container: HTMLElement | null): void {
  if (container === null) return;
  const focusable = [...container.querySelectorAll<HTMLElement>(focusableSelector)].filter(
    (element) =>
      !element.inert &&
      !element.hasAttribute("disabled") &&
      element.closest("[hidden]") === null &&
      (element.tagName === "SUMMARY" || element.closest("details")?.open !== false),
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
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

function resolveDialogHistoryShortcut(
  event: React.KeyboardEvent,
  canEdit: boolean,
): "history.undo" | "history.redo" | null {
  const command = resolveStudioShortcut(
    {
      key: event.key,
      altKey: event.altKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      shiftKey: event.shiftKey,
    },
    {
      platform: detectStudioPlatform(globalThis.navigator),
      canEdit,
      canResetSelection: false,
      hasSelection: false,
      modalOpen: false,
      transformDragging: false,
    },
  );
  return command === "history.undo" || command === "history.redo" ? command : null;
}
