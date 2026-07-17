import { useCallback, useRef, useState } from "react";
import { Lightbulb, Lock, Zap } from "lucide-react";

import type { DocumentCommand, LightEntity, Transform, Vec3 } from "@web3d/document";

import { useStudioI18n } from "../i18n/I18nProvider";
import { eulerXyzDegreesToQuaternion, quaternionToEulerXyzDegrees } from "../transform/euler-xyz";
import type { StudioCommandOutcome } from "../workspace/command-outcome";
import {
  buildUpdateLightCommand,
  LIGHT_INTENSITY_MAX,
  LIGHT_INTENSITY_SLIDER_MAX,
  sameLightEntity,
} from "./model";
import "./light-authoring.css";

interface LightInspectorProps {
  readonly entity: LightEntity;
  readonly editable: boolean;
  readonly execute: (command: DocumentCommand) => StudioCommandOutcome;
}

type VectorDraft = readonly [string, string, string];
type FieldId =
  | "name"
  | "position-0"
  | "position-1"
  | "position-2"
  | "rotation-0"
  | "rotation-1"
  | "rotation-2"
  | "brightness"
  | "range"
  | "angle"
  | "penumbra";

interface LightDraft {
  readonly name: string;
  readonly color: string;
  readonly brightness: string;
  readonly range: string;
  readonly angleDegrees: string;
  readonly penumbra: string;
  readonly position: VectorDraft;
  readonly rotation: VectorDraft;
  readonly positionDirty: boolean;
  readonly rotationDirty: boolean;
}

export function LightInspector(props: LightInspectorProps) {
  const { t } = useStudioI18n();
  const [draft, setDraft] = useState(() => draftFromEntity(props.entity));
  const [submitted, setSubmitted] = useState(false);
  const [applyFailed, setApplyFailed] = useState(false);
  const fields = useRef(new Map<FieldId, HTMLInputElement>());
  const registerInput = useCallback((field: FieldId, input: HTMLInputElement | null): void => {
    registerField(fields.current, field, input);
  }, []);
  const validation = validateDraft(draft, props.entity.light.kind, t.lights.inspector.validation);
  const sliderValue = clamp(numberOrZero(draft.brightness), 0, LIGHT_INTENSITY_SLIDER_MAX);

  const submit = (): void => {
    setSubmitted(true);
    setApplyFailed(false);
    const firstInvalid = orderedFieldIds(props.entity.light.kind).find(
      (field) => validation[field] !== null,
    );
    if (firstInvalid !== undefined) {
      requestAnimationFrame(() => fields.current.get(firstInvalid)?.focus());
      return;
    }
    const after = entityFromDraft(props.entity, draft);
    if (sameLightEntity(props.entity, after)) return;
    const outcome = props.execute(buildUpdateLightCommand(props.entity, after));
    if (outcome.status === "rejected" || outcome.status === "unavailable") setApplyFailed(true);
  };

  return (
    <form
      className="light-inspector"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <section className="inspector-section">
        <h2 tabIndex={-1}>
          {props.entity.light.kind === "point" ? <Lightbulb size={13} /> : <Zap size={13} />}
          {t.lights.inspector.heading}
        </h2>
        <label className="inspector-field">
          <span>{t.inspector.name}</span>
          <input
            ref={(input) => registerInput("name", input)}
            aria-invalid={validation.name !== null}
            data-light-inspector-primary={props.entity.id}
            disabled={!props.editable}
            value={draft.name}
            onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
          />
        </label>
        <InspectorValue
          label={t.inspector.type}
          value={t.lights.inspector.kinds[props.entity.light.kind]}
        />
        <InspectorValue label={t.inspector.id} value={props.entity.id} mono />
        <InspectorValue label={t.inspector.parent} value={t.inspector.sceneRoot} mono />
      </section>

      <section className="inspector-section light-property-section">
        <h2>{t.lights.inspector.properties}</h2>
        <label className="inspector-field light-color-field">
          <span>{t.lights.inspector.color}</span>
          <span className="light-color-control">
            <input
              aria-label={t.lights.inspector.color}
              disabled={!props.editable}
              type="color"
              value={draft.color}
              onChange={(event) =>
                setDraft((current) => ({ ...current, color: event.target.value.toUpperCase() }))
              }
            />
            <span className="mono">{draft.color}</span>
          </span>
        </label>
        <div className="inspector-field light-brightness-field">
          <label htmlFor={`light-brightness-${props.entity.id}`}>
            {t.lights.inspector.brightness}
          </label>
          <span className="light-brightness-control">
            <input
              aria-label={t.lights.inspector.brightnessSlider}
              disabled={!props.editable}
              max={LIGHT_INTENSITY_SLIDER_MAX}
              min="0"
              step="1"
              type="range"
              value={sliderValue}
              onChange={(event) =>
                setDraft((current) => ({ ...current, brightness: event.target.value }))
              }
            />
            <input
              ref={(input) => registerInput("brightness", input)}
              aria-invalid={validation.brightness !== null}
              aria-label={t.lights.inspector.brightness}
              disabled={!props.editable}
              id={`light-brightness-${props.entity.id}`}
              inputMode="decimal"
              max={LIGHT_INTENSITY_MAX}
              min="0"
              step="0.1"
              type="number"
              value={draft.brightness}
              onChange={(event) =>
                setDraft((current) => ({ ...current, brightness: event.target.value }))
              }
            />
          </span>
        </div>
        <label className="inspector-field">
          <span>{t.lights.inspector.range}</span>
          <input
            ref={(input) => registerInput("range", input)}
            aria-invalid={validation.range !== null}
            aria-label={t.lights.inspector.range}
            disabled={!props.editable}
            inputMode="decimal"
            min="0"
            placeholder={t.lights.inspector.unlimited}
            step="0.1"
            type="number"
            value={draft.range}
            onChange={(event) => setDraft((current) => ({ ...current, range: event.target.value }))}
          />
        </label>
        {props.entity.light.kind === "spot" && (
          <>
            <label className="inspector-field">
              <span>{t.lights.inspector.angleDegrees}</span>
              <input
                ref={(input) => registerInput("angle", input)}
                aria-invalid={validation.angle !== null}
                aria-label={t.lights.inspector.angleDegrees}
                disabled={!props.editable}
                inputMode="decimal"
                max="90"
                min="0"
                step="0.1"
                type="number"
                value={draft.angleDegrees}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, angleDegrees: event.target.value }))
                }
              />
            </label>
            <label className="inspector-field">
              <span>{t.lights.inspector.penumbra}</span>
              <input
                ref={(input) => registerInput("penumbra", input)}
                aria-invalid={validation.penumbra !== null}
                aria-label={t.lights.inspector.penumbra}
                disabled={!props.editable}
                inputMode="decimal"
                max="1"
                min="0"
                step="0.01"
                type="number"
                value={draft.penumbra}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, penumbra: event.target.value }))
                }
              />
            </label>
          </>
        )}
      </section>

      <section className="inspector-section light-transform-section">
        <h2>{t.inspector.transform}</h2>
        <LightVectorField
          disabled={!props.editable}
          fieldPrefix="position"
          invalid={validation}
          label={t.inspector.position}
          values={draft.position}
          onRegister={registerInput}
          onChange={(position) =>
            setDraft((current) => ({ ...current, position, positionDirty: true }))
          }
        />
        {props.entity.light.kind === "spot" && (
          <LightVectorField
            disabled={!props.editable}
            fieldPrefix="rotation"
            invalid={validation}
            label={t.inspector.rotationDegrees}
            values={draft.rotation}
            onRegister={registerInput}
            onChange={(rotation) =>
              setDraft((current) => ({ ...current, rotation, rotationDirty: true }))
            }
          />
        )}
      </section>

      {(submitted && Object.values(validation).some((message) => message !== null)) ||
      applyFailed ? (
        <div className="light-inspector-error" role="alert">
          {applyFailed ? t.lights.inspector.applyFailed : t.lights.inspector.invalid}
        </div>
      ) : null}
      {props.entity.locked && (
        <div className="inspector-notice">
          <Lock size={13} /> {t.inspector.locked}
        </div>
      )}
      <div className="light-inspector-actions">
        <button className="primary-command" disabled={!props.editable} type="submit">
          {t.lights.inspector.apply}
        </button>
      </div>
    </form>
  );
}

function LightVectorField({
  disabled,
  fieldPrefix,
  invalid,
  label,
  values,
  onRegister,
  onChange,
}: {
  readonly disabled: boolean;
  readonly fieldPrefix: "position" | "rotation";
  readonly invalid: Readonly<Record<FieldId, string | null>>;
  readonly label: string;
  readonly values: VectorDraft;
  readonly onRegister: (field: FieldId, input: HTMLInputElement | null) => void;
  readonly onChange: (values: VectorDraft) => void;
}) {
  const { t } = useStudioI18n();
  const axes = [t.inspector.axis.x, t.inspector.axis.y, t.inspector.axis.z] as const;
  return (
    <fieldset className="light-vector-field" disabled={disabled}>
      <legend>{label}</legend>
      <div>
        {values.map((value, index) => {
          const field = `${fieldPrefix}-${index}` as FieldId;
          return (
            <label key={field}>
              <span>{axes[index]}</span>
              <input
                ref={(input) => onRegister(field, input)}
                aria-invalid={invalid[field] !== null}
                aria-label={t.inspector.vectorAxis(label, axes[index]!)}
                inputMode="decimal"
                step="0.1"
                type="number"
                value={value}
                onChange={(event) => {
                  const next = [...values] as [string, string, string];
                  next[index] = event.target.value;
                  onChange(next);
                }}
              />
            </label>
          );
        })}
      </div>
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

function draftFromEntity(entity: LightEntity): LightDraft {
  return {
    name: entity.name,
    color: entity.light.color,
    brightness: String(entity.light.intensity),
    range: entity.light.range === null ? "" : String(entity.light.range),
    angleDegrees:
      entity.light.kind === "spot" ? String((entity.light.angleRadians * 180) / Math.PI) : "",
    penumbra: entity.light.kind === "spot" ? String(entity.light.penumbra) : "",
    position: entity.transform.position.map(String) as [string, string, string],
    rotation: quaternionToEulerXyzDegrees(entity.transform.rotation).map(String) as [
      string,
      string,
      string,
    ],
    positionDirty: false,
    rotationDirty: false,
  };
}

function entityFromDraft(entity: LightEntity, draft: LightDraft): LightEntity {
  const position = draft.positionDirty
    ? vectorFromDraft(draft.position)
    : entity.transform.position;
  const rotation =
    entity.light.kind === "spot" && draft.rotationDirty
      ? eulerXyzDegreesToQuaternion(vectorFromDraft(draft.rotation))
      : entity.transform.rotation;
  const common = {
    ...entity,
    name: draft.name.trim(),
    transform: { position, rotation, scale: entity.transform.scale } satisfies Transform,
  };
  const shared = {
    color: draft.color,
    intensity: Number(draft.brightness),
    range: draft.range.trim() === "" ? null : Number(draft.range),
  };
  return entity.light.kind === "point"
    ? { ...common, light: { kind: "point", ...shared } }
    : {
        ...common,
        light: {
          kind: "spot",
          ...shared,
          angleRadians: (Number(draft.angleDegrees) * Math.PI) / 180,
          penumbra: Number(draft.penumbra),
        },
      };
}

function validateDraft(
  draft: LightDraft,
  kind: LightEntity["light"]["kind"],
  messages: {
    readonly name: string;
    readonly finite: string;
    readonly brightness: string;
    readonly range: string;
    readonly angle: string;
    readonly penumbra: string;
  },
): Record<FieldId, string | null> {
  const validation = Object.fromEntries(
    orderedFieldIds(kind).map((field) => [field, null]),
  ) as Record<FieldId, string | null>;
  if (draft.name.trim() === "" || draft.name.trim().length > 160) validation.name = messages.name;
  draft.position.forEach((value, index) => {
    if (!isFiniteInput(value)) validation[`position-${index}` as FieldId] = messages.finite;
  });
  if (kind === "spot") {
    draft.rotation.forEach((value, index) => {
      if (!isFiniteInput(value)) validation[`rotation-${index}` as FieldId] = messages.finite;
    });
  }
  if (!inRange(draft.brightness, 0, LIGHT_INTENSITY_MAX, true)) {
    validation.brightness = messages.brightness;
  }
  if (draft.range.trim() !== "" && !inRange(draft.range, 0, Number.POSITIVE_INFINITY, false)) {
    validation.range = messages.range;
  }
  if (kind === "spot") {
    if (!inRange(draft.angleDegrees, 0, 90, false)) validation.angle = messages.angle;
    if (!inRange(draft.penumbra, 0, 1, true)) validation.penumbra = messages.penumbra;
  }
  return validation;
}

function orderedFieldIds(kind: LightEntity["light"]["kind"]): FieldId[] {
  return [
    "name",
    "brightness",
    "range",
    ...(kind === "spot" ? (["angle", "penumbra"] as const) : []),
    "position-0",
    "position-1",
    "position-2",
    ...(kind === "spot" ? (["rotation-0", "rotation-1", "rotation-2"] as const) : []),
  ];
}

function registerField(
  refs: Map<FieldId, HTMLInputElement>,
  field: FieldId,
  input: HTMLInputElement | null,
): void {
  if (input === null) refs.delete(field);
  else refs.set(field, input);
}

function vectorFromDraft(draft: VectorDraft): Vec3 {
  return draft.map(Number) as [number, number, number];
}

function isFiniteInput(value: string): boolean {
  return value.trim() !== "" && Number.isFinite(Number(value));
}

function inRange(
  value: string,
  minimum: number,
  maximum: number,
  inclusiveMinimum: boolean,
): boolean {
  if (!isFiniteInput(value)) return false;
  const number = Number(value);
  return (inclusiveMinimum ? number >= minimum : number > minimum) && number <= maximum;
}

function numberOrZero(value: string): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
