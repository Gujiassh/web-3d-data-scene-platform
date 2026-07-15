import { useState } from "react";

import type { DocumentCommand, SceneDocument } from "@web3d/document";

import type { StudioCommandOutcome } from "../workspace/command-outcome";
import { useStudioI18n } from "../i18n/I18nProvider";
import { BindingRuleEditor } from "./BindingRuleEditor";
import { createDataBindingIdFactory } from "./command-builders";
import { DataSourceEditor } from "./DataSourceEditor";
import { effectiveMockSourceId } from "./source-selection";
import { TargetMappingSection } from "./TargetMappingSection";
import type { TargetResolution } from "./types";

interface DataBindingPanelProps {
  readonly document: SceneDocument;
  readonly targetResolution: TargetResolution;
  readonly execute: (command: DocumentCommand) => StudioCommandOutcome;
}

export function DataBindingPanel(props: DataBindingPanelProps) {
  const [ids] = useState(createDataBindingIdFactory);
  const [requestedSourceId, setRequestedSourceId] = useState("");
  const selectedSourceId = effectiveMockSourceId(props.document.dataSources, requestedSourceId);

  return (
    <div className="data-binding-panel">
      {props.targetResolution.status === "supported" ? (
        <TargetMappingSection execute={props.execute} target={props.targetResolution.target} />
      ) : (
        <TargetResolutionMessage resolution={props.targetResolution} />
      )}
      <DataSourceEditor
        document={props.document}
        execute={props.execute}
        ids={ids}
        selectedSourceId={requestedSourceId}
        onSelect={setRequestedSourceId}
      />
      {props.targetResolution.status === "supported" && (
        <BindingRuleEditor
          document={props.document}
          execute={props.execute}
          ids={ids}
          selectedSourceId={selectedSourceId}
          target={props.targetResolution.target}
        />
      )}
    </div>
  );
}

function TargetResolutionMessage({ resolution }: { readonly resolution: TargetResolution }) {
  const { t } = useStudioI18n();
  const message =
    resolution.status === "no-selection"
      ? t.dataBinding.target.noSelection
      : resolution.status === "unsupported-entity"
        ? t.dataBinding.target.unsupportedEntity
        : resolution.status === "no-root-target"
          ? t.dataBinding.target.noRootTarget
          : t.dataBinding.target.ambiguousRootTarget;
  const count = "targets" in resolution ? resolution.targets.length : 0;
  return (
    <section className="data-section data-target-state">
      <p>{message}</p>
      {count > 0 && <small className="mono">{t.dataBinding.target.relatedTargets(count)}</small>}
    </section>
  );
}
