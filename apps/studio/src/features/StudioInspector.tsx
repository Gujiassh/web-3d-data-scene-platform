import { useState } from "react";
import { Activity, Box, Database } from "lucide-react";

import type { DocumentCommand, SceneDocument, SceneEntity, Transform } from "@web3d/document";

import { DataBindingPanel } from "../data-binding/DataBindingPanel";
import { RunPreviewPanel } from "../data-binding/RunPreviewPanel";
import type { StudioPreviewState, TargetResolution } from "../data-binding/types";
import { useStudioI18n } from "../i18n/I18nProvider";
import type { StudioCommandOutcome } from "../workspace/command-outcome";
import { EntityInspector } from "./EntityInspector";
import { inspectorAuthoringStateKey } from "./inspector-authoring-state";
import { inspectorTabForKey, type InspectorTab } from "./inspector-tabs";

interface StudioInspectorProps {
  readonly document: SceneDocument;
  readonly projectId: string;
  readonly editable: boolean;
  readonly entity: SceneEntity | null;
  readonly mode: "edit" | "run";
  readonly preview: StudioPreviewState;
  readonly selectedEntityId: string | null;
  readonly targetResolution: TargetResolution;
  readonly execute: (command: DocumentCommand) => StudioCommandOutcome;
  readonly onFocusTarget: (targetId: string) => void;
  readonly onRename: (entityId: string, name: string) => void;
  readonly onTransformChange: (entityId: string, transform: Transform) => void;
}

export function StudioInspector(props: StudioInspectorProps) {
  return (
    <StudioInspectorForProject
      {...props}
      key={inspectorAuthoringStateKey(props.projectId, props.document.id)}
    />
  );
}

function StudioInspectorForProject(props: StudioInspectorProps) {
  const { t } = useStudioI18n();
  const [tab, setTab] = useState<InspectorTab>("object");

  return (
    <aside aria-label={t.inspector.ariaLabel} className="studio-inspector">
      {props.mode === "run" ? (
        <>
          <div className="inspector-mode-heading">
            <Activity size={13} />
            {t.dataBinding.tabs.run}
          </div>
          <RunPreviewPanel
            document={props.document}
            onFocusTarget={props.onFocusTarget}
            preview={props.preview}
            selectedEntityId={props.selectedEntityId}
          />
        </>
      ) : (
        <>
          <div aria-label={t.inspector.ariaLabel} className="inspector-tabs" role="tablist">
            <InspectorTabButton
              active={tab === "object"}
              controls="object-inspector-panel"
              icon={<Box size={13} />}
              label={t.dataBinding.tabs.object}
              tab="object"
              onSelect={setTab}
            />
            <InspectorTabButton
              active={tab === "data"}
              controls="data-inspector-panel"
              icon={<Database size={13} />}
              label={t.dataBinding.tabs.data}
              tab="data"
              onSelect={setTab}
            />
          </div>
          <div
            aria-labelledby="object-inspector-tab"
            hidden={tab !== "object"}
            id="object-inspector-panel"
            role="tabpanel"
          >
            <EntityInspector
              editable={props.editable}
              entity={props.entity}
              onRename={props.onRename}
              onTransformChange={props.onTransformChange}
            />
          </div>
          <div
            aria-labelledby="data-inspector-tab"
            hidden={tab !== "data"}
            id="data-inspector-panel"
            role="tabpanel"
          >
            <DataBindingPanel
              document={props.document}
              execute={props.execute}
              targetResolution={props.targetResolution}
            />
          </div>
        </>
      )}
    </aside>
  );
}

function InspectorTabButton({
  active,
  controls,
  icon,
  label,
  tab,
  onSelect,
}: {
  readonly active: boolean;
  readonly controls: string;
  readonly icon: React.ReactNode;
  readonly label: string;
  readonly tab: InspectorTab;
  readonly onSelect: (tab: InspectorTab) => void;
}) {
  const id = `${tab}-inspector-tab`;
  return (
    <button
      aria-controls={controls}
      aria-selected={active}
      id={id}
      role="tab"
      tabIndex={active ? 0 : -1}
      type="button"
      onClick={() => onSelect(tab)}
      onKeyDown={(event) => {
        const destination = inspectorTabForKey(tab, event.key);
        if (destination === null) return;
        event.preventDefault();
        onSelect(destination);
        document.getElementById(`${destination}-inspector-tab`)?.focus();
      }}
    >
      {icon}
      {label}
    </button>
  );
}
