import { useId, useState } from "react";
import { Link2 } from "lucide-react";

import type { SceneTarget, SetTargetBusinessIdCommand } from "@web3d/document";

import { useStudioI18n } from "../i18n/I18nProvider";
import type { StudioCommandOutcome } from "../workspace/command-outcome";
import { buildTargetBusinessIdCommand } from "./command-builders";
import { targetMappingEditorKey } from "./editor-keys";

interface TargetMappingSectionProps {
  readonly target: SceneTarget;
  readonly execute: (command: SetTargetBusinessIdCommand) => StudioCommandOutcome;
}

export function TargetMappingSection(props: TargetMappingSectionProps) {
  return <TargetMappingEditor {...props} key={targetMappingEditorKey(props.target)} />;
}

function TargetMappingEditor({ target, execute }: TargetMappingSectionProps) {
  const { t } = useStudioI18n();
  const [businessId, setBusinessId] = useState(target.businessId ?? "");
  const [error, setError] = useState<string | null>(null);
  const errorId = useId();

  return (
    <section className="data-section" aria-labelledby="target-mapping-heading">
      <h2 id="target-mapping-heading">
        <Link2 size={13} /> {t.dataBinding.target.heading}
      </h2>
      <dl className="data-properties">
        <div>
          <dt>{t.dataBinding.target.targetId}</dt>
          <dd className="mono" title={target.id}>
            {target.id}
          </dd>
        </div>
        <div>
          <dt>{t.dataBinding.target.scope}</dt>
          <dd>{t.dataBinding.target.assetRoot}</dd>
        </div>
      </dl>
      <label className="data-field">
        <span>{t.dataBinding.target.businessId}</span>
        <input
          aria-describedby={error === null ? undefined : errorId}
          aria-invalid={error !== null}
          maxLength={160}
          value={businessId}
          onChange={(event) => setBusinessId(event.target.value)}
        />
      </label>
      {error !== null && (
        <div className="data-form-error" id={errorId} role="alert">
          {error}
        </div>
      )}
      <div className="data-actions">
        <button
          className="primary-command"
          type="button"
          onClick={() => {
            const built = buildTargetBusinessIdCommand(target.id, { businessId });
            if (!built.ok) {
              setError(t.dataBinding.validation(built.issues[0]?.code ?? "business-id-required"));
              return;
            }
            const outcome = execute(built.value);
            setError(
              outcome.status === "rejected" || outcome.status === "unavailable"
                ? t.dataBinding.commandRejected
                : null,
            );
          }}
        >
          {t.dataBinding.actions.saveMapping}
        </button>
      </div>
    </section>
  );
}
