import { useState } from "react";
import { Box, Lock, Move3d } from "lucide-react";

import type { SceneEntity, Transform, Vec3 } from "@web3d/document";

import { useStudioI18n } from "../i18n/I18nProvider";

interface EntityInspectorProps {
  readonly entity: SceneEntity | null;
  readonly editable: boolean;
  readonly onRename: (entityId: string, name: string) => void;
  readonly onTransformChange: (entityId: string, transform: Transform) => void;
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
    <EntityInspectorForm {...props} entity={props.entity} key={entityEditorKey(props.entity)} />
  );
}

function EntityInspectorForm(
  props: Omit<EntityInspectorProps, "entity"> & { readonly entity: SceneEntity },
) {
  const { t } = useStudioI18n();
  const [name, setName] = useState(props.entity.name);
  const [transform, setTransform] = useState(props.entity.transform);

  const commitName = (): void => {
    const next = name.trim();
    if (next !== "" && next !== props.entity.name) props.onRename(props.entity.id, next);
    else setName(props.entity.name);
  };
  const commitTransform = (): void => {
    if (!sameTransform(transform, props.entity.transform)) {
      props.onTransformChange(props.entity.id, transform);
    }
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
        <VectorInput
          disabled={!props.editable || props.entity.locked}
          invalid={(value) => !Number.isFinite(value)}
          label={t.inspector.position}
          value={transform.position}
          onBlur={commitTransform}
          onChange={(value) => setTransform({ ...transform, position: value })}
        />
        <VectorInput
          disabled={!props.editable || props.entity.locked}
          invalid={(value) => !Number.isFinite(value) || value <= 0}
          label={t.inspector.scale}
          value={transform.scale}
          onBlur={commitTransform}
          onChange={(value) => setTransform({ ...transform, scale: value })}
        />
        <InspectorValue
          label={t.inspector.rotation}
          value={formatQuaternion(transform.rotation)}
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

function VectorInput({
  disabled,
  invalid,
  label,
  value,
  onBlur,
  onChange,
}: {
  readonly disabled: boolean;
  readonly invalid?: (value: number, axisIndex: number) => boolean;
  readonly label: string;
  readonly value: Vec3;
  readonly onBlur: () => void;
  readonly onChange: (value: Vec3) => void;
}) {
  const { t } = useStudioI18n();
  const axisLabels = [t.inspector.axis.x, t.inspector.axis.y, t.inspector.axis.z] as const;

  return (
    <fieldset className="vector-field" disabled={disabled}>
      <legend>{label}</legend>
      {value.map((number, index) => {
        const axis = axisLabels[index] ?? t.inspector.axis.x;
        const isInvalid = invalid?.(number, index) ?? false;
        return (
          <label key={index}>
            <span>{axis}</span>
            <input
              aria-invalid={isInvalid}
              aria-label={t.inspector.vectorAxis(label, axis)}
              inputMode="decimal"
              step="0.1"
              type="number"
              value={number}
              onBlur={onBlur}
              onChange={(event) => {
                const next = [...value] as [number, number, number];
                next[index] = Number(event.target.value);
                onChange(next);
              }}
            />
          </label>
        );
      })}
    </fieldset>
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

function formatQuaternion(value: readonly number[]): string {
  return value.map((number) => number.toFixed(3)).join("  ");
}

function sameTransform(left: Transform, right: Transform): boolean {
  return (
    left.position.every((value, index) => value === right.position[index]) &&
    left.rotation.every((value, index) => value === right.rotation[index]) &&
    left.scale.every((value, index) => value === right.scale[index])
  );
}

function entityEditorKey(entity: SceneEntity): string {
  return [
    entity.id,
    entity.name,
    ...entity.transform.position,
    ...entity.transform.rotation,
    ...entity.transform.scale,
  ].join(":");
}
