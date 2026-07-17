import { useState } from "react";
import { Activity, Box, Database } from "lucide-react";

import type { DocumentCommand, SceneDocument, SceneEntity } from "@web3d/document";

import { DataBindingPanel } from "../data-binding/DataBindingPanel";
import { RunPreviewPanel } from "../data-binding/RunPreviewPanel";
import type { StudioPreviewState, TargetResolution } from "../data-binding/types";
import { useStudioI18n } from "../i18n/I18nProvider";
import { SceneLayoutPanel } from "../layout/SceneLayoutPanel";
import type { StudioSceneLayout } from "../layout/useStudioSceneLayout";
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
  readonly lightPreviewCancellation: number;
  readonly layout: StudioSceneLayout;
  readonly onFocusTarget: (targetId: string) => void;
  readonly onCancelLightPreview: () => void;
  readonly onAcceptLightPreview: (
    entity: Extract<SceneEntity, { type: "light" }>,
    revision: number,
  ) => void;
  readonly onPreviewLight: (entity: Extract<SceneEntity, { type: "light" }>) => void;
  readonly onRename: (entityId: string, name: string) => void;
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
          <div className="run-inspector-content">
            <RunPreviewPanel
              document={props.document}
              onFocusTarget={props.onFocusTarget}
              preview={props.preview}
              selectedEntityId={props.selectedEntityId}
            />
          </div>
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
              authoritativeRevision={props.document.revision}
              editable={props.editable && props.entity !== null && !props.entity.locked}
              entity={props.entity}
              execute={props.execute}
              lightPreviewCancellation={props.lightPreviewCancellation}
              onCancelLightPreview={props.onCancelLightPreview}
              onAcceptLightPreview={props.onAcceptLightPreview}
              onPreviewLight={props.onPreviewLight}
              onRename={props.onRename}
            />
            <SceneLayoutPanel compact layout={props.layout} />
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
