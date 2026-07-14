import { useState } from "react";
import { Box, Lock, Move3d } from "lucide-react";

import type { SceneEntity, Transform, Vec3 } from "@web3d/document";

interface EntityInspectorProps {
  readonly entity: SceneEntity | null;
  readonly editable: boolean;
  readonly onRename: (entityId: string, name: string) => void;
  readonly onTransformChange: (entityId: string, transform: Transform) => void;
}

export function EntityInspector(props: EntityInspectorProps) {
  if (props.entity === null) {
    return (
      <aside aria-label="Inspector" className="studio-inspector inspector-empty">
        <div className="inspector-header">Inspector</div>
        <span>No selection</span>
      </aside>
    );
  }

  return (
    <EntityInspectorForm {...props} entity={props.entity} key={entityEditorKey(props.entity)} />
  );
}

function EntityInspectorForm(
  props: Omit<EntityInspectorProps, "entity"> & { readonly entity: SceneEntity },
) {
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
    <aside aria-label="Inspector" className="studio-inspector">
      <div className="inspector-header">
        <span>Inspector</span>
        <span className="mono">{props.entity.id}</span>
      </div>
      <section className="inspector-section">
        <h2>
          <Box size={13} /> Entity
        </h2>
        <label className="inspector-field">
          <span>Name</span>
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
        <InspectorValue label="Type" value={props.entity.type} />
        <InspectorValue label="Parent" value={props.entity.parentId ?? "scene root"} mono />
      </section>
      <section className="inspector-section">
        <h2>
          <Move3d size={13} /> Transform
        </h2>
        <VectorInput
          disabled={!props.editable || props.entity.locked}
          label="Position"
          value={transform.position}
          onBlur={commitTransform}
          onChange={(value) => setTransform({ ...transform, position: value })}
        />
        <VectorInput
          disabled={!props.editable || props.entity.locked}
          label="Scale"
          value={transform.scale}
          onBlur={commitTransform}
          onChange={(value) => setTransform({ ...transform, scale: value })}
        />
        <InspectorValue label="Rotation" value={formatQuaternion(transform.rotation)} mono />
      </section>
      {props.entity.locked && (
        <div className="inspector-notice">
          <Lock size={13} /> Locked
        </div>
      )}
    </aside>
  );
}

function VectorInput({
  disabled,
  label,
  value,
  onBlur,
  onChange,
}: {
  readonly disabled: boolean;
  readonly label: string;
  readonly value: Vec3;
  readonly onBlur: () => void;
  readonly onChange: (value: Vec3) => void;
}) {
  return (
    <fieldset className="vector-field" disabled={disabled}>
      <legend>{label}</legend>
      {value.map((number, index) => (
        <label key={index}>
          <span>{["X", "Y", "Z"][index]}</span>
          <input
            aria-label={`${label} ${["X", "Y", "Z"][index]}`}
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
      ))}
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
