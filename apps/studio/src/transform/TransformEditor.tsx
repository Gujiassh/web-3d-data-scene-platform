import { useState } from "react";
import { LocateFixed, RotateCcw, Scaling } from "lucide-react";

import type { Transform, Vec3 } from "@web3d/document";

import { useStudioI18n } from "../i18n/I18nProvider";
import type { StudioCommandOutcome } from "../workspace/command-outcome";
import { eulerXyzDegreesToQuaternion, quaternionToEulerXyzDegrees } from "./euler-xyz";
import type { TransformResetComponent } from "./transform-reset";

interface TransformEditorProps {
  readonly transform: Transform;
  readonly editable: boolean;
  readonly canReset: boolean;
  readonly onCommit: (after: Transform) => StudioCommandOutcome;
  readonly onReset: (component: TransformResetComponent) => StudioCommandOutcome;
}

interface TransformDraft {
  readonly position: readonly [string, string, string];
  readonly rotation: readonly [string, string, string];
  readonly scale: readonly [string, string, string];
}

export function TransformEditor(props: TransformEditorProps) {
  const { t } = useStudioI18n();
  const authoritativeDraft = draftFromTransform(props.transform);
  const [draft, setDraft] = useState(authoritativeDraft);

  const commit = (component: Exclude<TransformResetComponent, "all">): void => {
    if (draftValuesEqual(draft[component], authoritativeDraft[component])) return;
    const values = parseDraft(draft[component]);
    if (values === null || (component === "scale" && values.some((value) => value <= 0))) {
      return;
    }
    const after: Transform = {
      position: component === "position" ? values : props.transform.position,
      rotation:
        component === "rotation" ? eulerXyzDegreesToQuaternion(values) : props.transform.rotation,
      scale: component === "scale" ? values : props.transform.scale,
    };
    const outcome = props.onCommit(after);
    setDraft(outcome.status === "changed" ? draftFromTransform(after) : authoritativeDraft);
  };
  const reset = (component: TransformResetComponent): void => {
    props.onReset(component);
    setDraft(authoritativeDraft);
  };

  return (
    <div className="transform-editor">
      <TransformRow
        disabled={!props.editable}
        icon={<LocateFixed size={13} />}
        label={t.inspector.position}
        resetLabel={t.inspector.resetPosition}
        resetDisabled={!props.canReset}
        values={draft.position}
        invalid={(value) => !isFiniteDraft(value)}
        onBlur={() => commit("position")}
        onChange={(values) => setDraft((current) => ({ ...current, position: values }))}
        onReset={() => reset("position")}
      />
      <TransformRow
        disabled={!props.editable}
        icon={<RotateCcw size={13} />}
        label={t.inspector.rotationDegrees}
        resetLabel={t.inspector.resetRotation}
        resetDisabled={!props.canReset}
        values={draft.rotation}
        invalid={(value) => !isFiniteDraft(value)}
        onBlur={() => commit("rotation")}
        onChange={(values) => setDraft((current) => ({ ...current, rotation: values }))}
        onReset={() => reset("rotation")}
      />
      <TransformRow
        disabled={!props.editable}
        icon={<Scaling size={13} />}
        label={t.inspector.scale}
        resetLabel={t.inspector.resetScale}
        resetDisabled={!props.canReset}
        values={draft.scale}
        invalid={(value) => !isFiniteDraft(value) || Number(value) <= 0}
        onBlur={() => commit("scale")}
        onChange={(values) => setDraft((current) => ({ ...current, scale: values }))}
        onReset={() => reset("scale")}
      />
      <button
        className="transform-reset-all"
        disabled={!props.canReset}
        type="button"
        onClick={() => reset("all")}
      >
        <RotateCcw size={13} />
        {t.inspector.resetAll}
      </button>
    </div>
  );
}

function TransformRow({
  disabled,
  icon,
  invalid,
  label,
  resetDisabled,
  resetLabel,
  values,
  onBlur,
  onChange,
  onReset,
}: {
  readonly disabled: boolean;
  readonly icon: React.ReactNode;
  readonly invalid: (value: string) => boolean;
  readonly label: string;
  readonly resetDisabled: boolean;
  readonly resetLabel: string;
  readonly values: readonly [string, string, string];
  readonly onBlur: () => void;
  readonly onChange: (values: readonly [string, string, string]) => void;
  readonly onReset: () => void;
}) {
  const { t } = useStudioI18n();
  const axes = [t.inspector.axis.x, t.inspector.axis.y, t.inspector.axis.z] as const;
  return (
    <fieldset className="transform-row" disabled={disabled}>
      <legend>
        {icon}
        <span>{label}</span>
        <button
          aria-label={resetLabel}
          className="transform-row-reset"
          disabled={resetDisabled}
          title={resetLabel}
          type="button"
          onClick={onReset}
        >
          <RotateCcw size={12} />
        </button>
      </legend>
      <div>
        {values.map((value, index) => {
          const axis = axes[index]!;
          return (
            <label key={axis}>
              <span>{axis}</span>
              <input
                aria-invalid={invalid(value)}
                aria-label={t.inspector.vectorAxis(label, axis)}
                inputMode="decimal"
                step="0.1"
                type="number"
                value={value}
                onBlur={(event) => {
                  if (
                    !event.currentTarget.parentElement?.parentElement?.contains(event.relatedTarget)
                  ) {
                    onBlur();
                  }
                }}
                onChange={(event) => {
                  const next = [...values] as [string, string, string];
                  next[index] = event.currentTarget.value;
                  onChange(next);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                }}
              />
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function draftFromTransform(transform: Transform): TransformDraft {
  return {
    position: transform.position.map(formatNumber) as [string, string, string],
    rotation: quaternionToEulerXyzDegrees(transform.rotation).map(formatNumber) as [
      string,
      string,
      string,
    ],
    scale: transform.scale.map(formatNumber) as [string, string, string],
  };
}

function parseDraft(values: readonly [string, string, string]): Vec3 | null {
  if (values.some((value) => !isFiniteDraft(value))) return null;
  return values.map(Number) as [number, number, number];
}

function draftValuesEqual(
  left: readonly [string, string, string],
  right: readonly [string, string, string],
): boolean {
  return left.every((value, index) => value === right[index]);
}

function isFiniteDraft(value: string): boolean {
  return value.trim() !== "" && Number.isFinite(Number(value));
}

function formatNumber(value: number): string {
  return String(Math.abs(value) <= 1e-12 ? 0 : Number(value.toFixed(6)));
}
