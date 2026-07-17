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
import { LightColorControl, LightRangeControl } from "./LightInspectorControls";
import "./light-authoring.css";

interface LightInspectorProps {
  readonly entity: LightEntity;
  readonly editable: boolean;
  readonly previewCancellation: number;
  readonly execute: (command: DocumentCommand) => StudioCommandOutcome;
  readonly onAcceptPreview: (entity: LightEntity, revision: number) => void;
  readonly onCancelPreview: () => void;
  readonly onPreview: (entity: LightEntity) => void;
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
  const draftRef = useRef(draft);
  const [invalidVisible, setInvalidVisible] = useState(false);
  const [commitFailed, setCommitFailed] = useState(false);
  const fields = useRef(new Map<FieldId, HTMLInputElement>());
  const registerInput = useCallback((field: FieldId, input: HTMLInputElement | null): void => {
    registerField(fields.current, field, input);
  }, []);
  const validation = validateDraft(draft, props.entity.light.kind, t.lights.inspector.validation);
  const sliderValue = clamp(numberOrZero(draft.brightness), 0, LIGHT_INTENSITY_SLIDER_MAX);

  const updateDraft = (next: LightDraft): void => {
    draftRef.current = next;
    setDraft(next);
  };
  const previewDraft = (next: LightDraft): void => {
    updateDraft(next);
    const nextValidation = validateDraft(
      next,
      props.entity.light.kind,
      t.lights.inspector.validation,
    );
    if (Object.values(nextValidation).every((message) => message === null)) {
      props.onPreview(entityFromDraft(props.entity, next));
    } else {
      props.onCancelPreview();
    }
  };
  const commitDraft = (next: LightDraft): void => {
    updateDraft(next);
    setCommitFailed(false);
    const nextValidation = validateDraft(
      next,
      props.entity.light.kind,
      t.lights.inspector.validation,
    );
    const firstInvalid = orderedFieldIds(props.entity.light.kind).find(
      (field) => nextValidation[field] !== null,
    );
    if (firstInvalid !== undefined) {
      setInvalidVisible(true);
      props.onCancelPreview();
      requestAnimationFrame(() => fields.current.get(firstInvalid)?.focus());
      return;
    }
    setInvalidVisible(false);
    const after = entityFromDraft(props.entity, next);
    if (sameLightEntity(props.entity, after)) {
      props.onCancelPreview();
      return;
    }
    const outcome = props.execute(buildUpdateLightCommand(props.entity, after));
    if (outcome.status === "rejected" || outcome.status === "unavailable") {
      updateDraft(draftFromEntity(props.entity));
      setCommitFailed(true);
      props.onCancelPreview();
    } else if (outcome.status === "changed") {
      props.onAcceptPreview(after, outcome.revision);
    } else {
      props.onCancelPreview();
    }
  };
  const cancelDraft = (): void => {
    updateDraft(draftFromEntity(props.entity));
    setInvalidVisible(false);
    setCommitFailed(false);
    props.onCancelPreview();
  };

  return (
    <div className="light-inspector">
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
            onBlur={() => commitDraft(draftRef.current)}
            onChange={(event) => updateDraft({ ...draftRef.current, name: event.target.value })}
            onKeyDown={(event) => handleTextCommitKey(event, cancelDraft)}
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
            <LightColorControl
              disabled={!props.editable}
              label={t.lights.inspector.color}
              previewCancellation={props.previewCancellation}
              value={draft.color}
              onCommit={(color) => commitDraft({ ...draftRef.current, color })}
              onPreview={(color) => previewDraft({ ...draftRef.current, color })}
            />
            <span className="mono">{draft.color}</span>
          </span>
        </label>
        <div className="inspector-field light-brightness-field">
          <label htmlFor={`light-brightness-${props.entity.id}`}>
            {t.lights.inspector.brightness}
          </label>
          <span className="light-brightness-control">
            <LightRangeControl
              disabled={!props.editable}
              label={t.lights.inspector.brightnessSlider}
              max={LIGHT_INTENSITY_SLIDER_MAX}
              min={0}
              previewCancellation={props.previewCancellation}
              step={1}
              value={sliderValue}
              onCancel={cancelDraft}
              onCommit={(brightness) =>
                commitDraft({ ...draftRef.current, brightness: String(brightness) })
              }
              onPreview={(brightness) =>
                previewDraft({ ...draftRef.current, brightness: String(brightness) })
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
              onBlur={() => commitDraft(draftRef.current)}
              onChange={(event) =>
                previewDraft({ ...draftRef.current, brightness: event.target.value })
              }
              onKeyDown={(event) => handleTextCommitKey(event, cancelDraft)}
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
            onBlur={() => commitDraft(draftRef.current)}
            onChange={(event) => previewDraft({ ...draftRef.current, range: event.target.value })}
            onKeyDown={(event) => handleTextCommitKey(event, cancelDraft)}
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
                onBlur={() => commitDraft(draftRef.current)}
                onChange={(event) =>
                  previewDraft({ ...draftRef.current, angleDegrees: event.target.value })
                }
                onKeyDown={(event) => handleTextCommitKey(event, cancelDraft)}
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
                onBlur={() => commitDraft(draftRef.current)}
                onChange={(event) =>
                  previewDraft({ ...draftRef.current, penumbra: event.target.value })
                }
                onKeyDown={(event) => handleTextCommitKey(event, cancelDraft)}
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
          onCancel={cancelDraft}
          onChange={(position) =>
            updateDraft({ ...draftRef.current, position, positionDirty: true })
          }
          onCommit={() => commitDraft(draftRef.current)}
        />
        {props.entity.light.kind === "spot" && (
          <LightVectorField
            disabled={!props.editable}
            fieldPrefix="rotation"
            invalid={validation}
            label={t.inspector.rotationDegrees}
            values={draft.rotation}
            onRegister={registerInput}
            onCancel={cancelDraft}
            onChange={(rotation) =>
              updateDraft({ ...draftRef.current, rotation, rotationDirty: true })
            }
            onCommit={() => commitDraft(draftRef.current)}
          />
        )}
      </section>

      {(invalidVisible && Object.values(validation).some((message) => message !== null)) ||
      commitFailed ? (
        <div className="light-inspector-error" role="alert">
          {commitFailed ? t.lights.inspector.applyFailed : t.lights.inspector.invalid}
        </div>
      ) : null}
      {props.entity.locked && (
        <div className="inspector-notice">
          <Lock size={13} /> {t.inspector.locked}
        </div>
      )}
    </div>
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
  onCancel,
  onCommit,
}: {
  readonly disabled: boolean;
  readonly fieldPrefix: "position" | "rotation";
  readonly invalid: Readonly<Record<FieldId, string | null>>;
  readonly label: string;
  readonly values: VectorDraft;
  readonly onRegister: (field: FieldId, input: HTMLInputElement | null) => void;
  readonly onChange: (values: VectorDraft) => void;
  readonly onCancel: () => void;
  readonly onCommit: () => void;
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
                onBlur={onCommit}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                  if (event.key === "Escape") {
                    event.preventDefault();
                    onCancel();
                    event.currentTarget.blur();
                  }
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

function handleTextCommitKey(
  event: React.KeyboardEvent<HTMLInputElement>,
  cancel: () => void,
): void {
  if (event.key === "Enter") event.currentTarget.blur();
  if (event.key === "Escape") {
    event.preventDefault();
    cancel();
  }
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
