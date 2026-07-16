import { useState } from "react";
import { Box, Lock, Move3d } from "lucide-react";

import type { SceneEntity, Transform } from "@web3d/document";

import { useStudioI18n } from "../i18n/I18nProvider";
import { TransformEditor } from "../transform/TransformEditor";
import type { TransformResetComponent } from "../transform/transform-reset";
import type { StudioCommandOutcome } from "../workspace/command-outcome";

interface EntityInspectorProps {
  readonly entity: SceneEntity | null;
  readonly authoritativeRevision: number;
  readonly editable: boolean;
  readonly canReset: boolean;
  readonly onRename: (entityId: string, name: string) => void;
  readonly onReset: (component: TransformResetComponent) => StudioCommandOutcome;
  readonly onTransformChange: (entityId: string, transform: Transform) => StudioCommandOutcome;
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

  return (
    <EntityInspectorForm
      {...props}
      entity={props.entity}
      key={entityEditorKey(props.entity, props.authoritativeRevision)}
    />
  );
}

function EntityInspectorForm(
  props: Omit<EntityInspectorProps, "entity"> & { readonly entity: SceneEntity },
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
      <section className="inspector-section">
        <h2>
          <Move3d size={13} /> {t.inspector.transform}
        </h2>
        <TransformEditor
          canReset={props.canReset}
          editable={props.editable && !props.entity.locked && props.entity.visible}
          transform={props.entity.transform}
          onCommit={(after) => props.onTransformChange(props.entity.id, after)}
          onReset={props.onReset}
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
  return [
    authoritativeRevision,
    entity.id,
    entity.name,
    ...entity.transform.position,
    ...entity.transform.rotation,
    ...entity.transform.scale,
  ].join(":");
}
