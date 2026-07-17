import { useState } from "react";
import { Box, Lock } from "lucide-react";

import type { DocumentCommand, SceneEntity } from "@web3d/document";

import { useStudioI18n } from "../i18n/I18nProvider";
import { LightInspector } from "../lights/LightInspector";
import type { StudioCommandOutcome } from "../workspace/command-outcome";

interface EntityInspectorProps {
  readonly entity: SceneEntity | null;
  readonly authoritativeRevision: number;
  readonly editable: boolean;
  readonly execute: (command: DocumentCommand) => StudioCommandOutcome;
  readonly onRename: (entityId: string, name: string) => void;
}

export function EntityInspector(props: EntityInspectorProps) {
  const { t } = useStudioI18n();

  if (props.entity === null) {
    return (
      <div className="inspector-empty">
        <span>{t.inspector.empty}</span>
      </div>
    );
  }

  if (props.entity.type === "light") {
    return (
      <LightInspector
        editable={props.editable && !props.entity.locked}
        entity={props.entity}
        execute={props.execute}
        key={entityEditorKey(props.entity, props.authoritativeRevision)}
      />
    );
  }

  return (
    <EntityInspectorForm
      {...props}
      entity={props.entity}
      key={entityEditorKey(props.entity, props.authoritativeRevision)}
    />
  );
}

function EntityInspectorForm(
  props: Omit<EntityInspectorProps, "entity"> & {
    readonly entity: Exclude<SceneEntity, { type: "light" }>;
  },
) {
  const { t } = useStudioI18n();
  const [name, setName] = useState(props.entity.name);

  const commitName = (): void => {
    const next = name.trim();
    if (next !== "" && next !== props.entity.name) props.onRename(props.entity.id, next);
    else setName(props.entity.name);
  };
  return (
    <div className="entity-inspector-content">
      <section className="inspector-section">
        <h2>
          <Box size={13} /> {t.inspector.entity}
        </h2>
        <label className="inspector-field">
          <span>{t.inspector.name}</span>
          <input
            disabled={!props.editable}
            value={name}
            onBlur={commitName}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
              if (event.key === "Escape") {
                setName(props.entity.name);
                event.currentTarget.blur();
              }
            }}
          />
        </label>
        <InspectorValue label={t.inspector.type} value={props.entity.type} />
        <InspectorValue label={t.inspector.id} value={props.entity.id} mono />
        <InspectorValue
          label={t.inspector.parent}
          value={props.entity.parentId ?? t.inspector.sceneRoot}
          mono
        />
      </section>
      {props.entity.locked && (
        <div className="inspector-notice">
          <Lock size={13} /> {t.inspector.locked}
        </div>
      )}
    </div>
  );
}

function InspectorValue({
  label,
  value,
  mono = false,
}: {
  readonly label: string;
  readonly value: string;
  readonly mono?: boolean;
}) {
  return (
    <div className="inspector-row">
      <span>{label}</span>
      <strong className={mono ? "mono" : ""}>{value}</strong>
    </div>
  );
}

function entityEditorKey(entity: SceneEntity, authoritativeRevision: number): string {
  return [authoritativeRevision, entity.id, entity.name].join(":");
}
