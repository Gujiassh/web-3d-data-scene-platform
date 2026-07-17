import {
  AlignCenterHorizontal,
  Boxes,
  CopyPlus,
  Crosshair,
  GitBranch,
  Grid3X3,
  Magnet,
  Rows3,
} from "lucide-react";

import { useStudioI18n } from "../i18n/I18nProvider";
import { BOUNDS_ANCHOR_KINDS, type LayoutActionState } from "./types";
import { LAYOUT_ANCHORS, LAYOUT_AXES } from "./layout-selection";
import type { StudioSceneLayout } from "./useStudioSceneLayout";

interface SceneLayoutPanelProps {
  readonly layout: StudioSceneLayout;
  readonly compact?: boolean;
}

export function SceneLayoutPanel({ layout, compact = false }: SceneLayoutPanelProps) {
  const { t } = useStudioI18n();
  const rootTargetValue = "__scene_root__";
  const reparentReasonId = "layout-reparent-reason";
  const groupReasonId = "layout-group-reason";
  const alignReasonId = "layout-align-reason";
  const distributeReasonId = "layout-distribute-reason";
  const duplicateReasonId = "layout-duplicate-reason";
  const duplicateOffsetErrorId = "layout-offset-error";
  const anchorReasonId = "layout-anchor-reason";
  const snapErrorId = "layout-snap-error";

  return (
    <div className={`scene-layout-panel ${compact ? "is-compact" : ""}`}>
      <section className="layout-section" aria-labelledby="layout-hierarchy-title">
        <h2 id="layout-hierarchy-title">
          <Boxes size={13} /> {t.layout.hierarchy}
          <span className="layout-count">
            {t.layout.selectionCount(layout.selectedEntityIds.length)}
          </span>
        </h2>
        <div className="layout-command-row">
          <ActionButton
            action={layout.capabilities.group}
            describedBy={groupReasonId}
            icon={<Boxes size={13} />}
            label={t.layout.groupSelection}
            onClick={layout.groupSelection}
          />
          <ActionReason action={layout.capabilities.group} id={groupReasonId} />
        </div>
        <div className="layout-inline-command">
          <label>
            <span>{t.layout.parentTarget}</span>
            <select
              aria-label={t.layout.parentTarget}
              data-layout-control="true"
              disabled={!layout.editable}
              value={layout.reparentTargetId ?? rootTargetValue}
              onChange={(event) =>
                layout.setReparentTargetId(
                  event.target.value === rootTargetValue ? null : event.target.value,
                )
              }
            >
              <option value={rootTargetValue}>{t.layout.sceneRoot}</option>
              {layout.documentEntities
                .filter((entity) => entity.type === "group")
                .map((entity) => (
                  <option key={entity.id} value={entity.id}>
                    {entity.name} [{entity.id}]
                  </option>
                ))}
            </select>
          </label>
          <ActionButton
            action={layout.capabilities.reparent}
            describedBy={reparentReasonId}
            icon={<GitBranch size={13} />}
            label={t.layout.reparent}
            onClick={layout.reparentSelection}
          />
        </div>
        <ActionReason action={layout.capabilities.reparent} id={reparentReasonId} />
      </section>

      {!compact && (
        <>
          <section className="layout-section" aria-labelledby="layout-arrange-title">
            <h2 id="layout-arrange-title">
              <AlignCenterHorizontal size={13} /> {t.layout.arrange}
            </h2>
            <div className="layout-setting-row">
              <span>{t.layout.axis}</span>
              <div className="layout-segments" role="group" aria-label={t.layout.axis}>
                {LAYOUT_AXES.map((axis) => (
                  <button
                    aria-pressed={layout.axis === axis}
                    className={layout.axis === axis ? "is-active" : ""}
                    data-layout-control="true"
                    disabled={!layout.editable}
                    key={axis}
                    type="button"
                    onClick={() => layout.setAxis(axis)}
                  >
                    {t.layout.axes[axis]}
                  </button>
                ))}
              </div>
            </div>
            <div className="layout-setting-row">
              <span>{t.layout.anchor}</span>
              <div className="layout-segments" role="group" aria-label={t.layout.anchor}>
                {LAYOUT_ANCHORS.map((anchor) => (
                  <button
                    aria-pressed={layout.alignAnchor === anchor}
                    className={layout.alignAnchor === anchor ? "is-active" : ""}
                    data-layout-control="true"
                    disabled={!layout.editable}
                    key={anchor}
                    type="button"
                    onClick={() => layout.setAlignAnchor(anchor)}
                  >
                    {t.layout.alignAnchors[anchor]}
                  </button>
                ))}
              </div>
            </div>
            <div className="layout-action-grid">
              <ActionButton
                action={layout.capabilities.align}
                describedBy={alignReasonId}
                icon={<AlignCenterHorizontal size={13} />}
                label={t.layout.align}
                onClick={layout.alignSelection}
              />
              <ActionButton
                action={layout.capabilities.distribute}
                describedBy={distributeReasonId}
                icon={<Rows3 size={13} />}
                label={t.layout.distribute}
                onClick={layout.distributeSelection}
              />
            </div>
            <ActionReason action={layout.capabilities.align} id={alignReasonId} />
            <ActionReason action={layout.capabilities.distribute} id={distributeReasonId} />

            <fieldset className="layout-vector-field">
              <legend>{t.layout.duplicateOffset}</legend>
              {layout.duplicateOffsetDraft.map((value, index) => {
                const axis = LAYOUT_AXES[index]!;
                const invalid = layout.invalidDuplicateOffsetFields.includes(index as 0 | 1 | 2);
                return (
                  <label key={axis}>
                    <span>{t.layout.axes[axis]}</span>
                    <input
                      aria-describedby={invalid ? duplicateOffsetErrorId : undefined}
                      aria-invalid={invalid}
                      aria-label={t.layout.offsetAxis(t.layout.axes[axis])}
                      data-layout-control="true"
                      disabled={!layout.editable}
                      inputMode="decimal"
                      value={value}
                      onChange={(event) =>
                        layout.setDuplicateOffsetDraft(index as 0 | 1 | 2, event.target.value)
                      }
                    />
                  </label>
                );
              })}
            </fieldset>
            {layout.invalidDuplicateOffsetFields.length > 0 && (
              <p className="layout-reason is-error" id={duplicateOffsetErrorId}>
                {t.layout.reasons["invalid-offset"]}
              </p>
            )}
            <ActionButton
              action={layout.capabilities.duplicate}
              describedBy={duplicateReasonId}
              icon={<CopyPlus size={13} />}
              label={t.layout.duplicate}
              onClick={layout.duplicateSelection}
            />
            <ActionReason action={layout.capabilities.duplicate} id={duplicateReasonId} />
          </section>

          <section className="layout-section" aria-labelledby="layout-snap-title">
            <h2 id="layout-snap-title">
              <Grid3X3 size={13} /> {t.layout.transformSnap}
            </h2>
            <div className="layout-snap-fields">
              <SnapInput
                describedBy={snapErrorId}
                disabled={!layout.editable}
                invalid={layout.invalidTransformFields.includes("translationSnap")}
                label={t.layout.translationStep}
                value={layout.transformSettingsDraft.translationSnap}
                onChange={(value) => layout.setTransformSettingsDraft("translationSnap", value)}
              />
              <SnapInput
                describedBy={snapErrorId}
                disabled={!layout.editable}
                invalid={layout.invalidTransformFields.includes("rotationSnapDegrees")}
                label={t.layout.angleStep}
                value={layout.transformSettingsDraft.rotationSnapDegrees}
                onChange={(value) => layout.setTransformSettingsDraft("rotationSnapDegrees", value)}
              />
              <SnapInput
                describedBy={snapErrorId}
                disabled={!layout.editable}
                invalid={layout.invalidTransformFields.includes("scaleSnap")}
                label={t.layout.scaleStep}
                value={layout.transformSettingsDraft.scaleSnap}
                onChange={(value) => layout.setTransformSettingsDraft("scaleSnap", value)}
              />
            </div>
            {layout.invalidTransformFields.length > 0 && (
              <p className="layout-reason is-error" id={snapErrorId}>
                {t.layout.invalidSnapStep}
              </p>
            )}

            <div className="layout-anchor-grid">
              <label>
                <span>{t.layout.sourceAnchor}</span>
                <select
                  data-layout-control="true"
                  disabled={!layout.editable}
                  value={layout.sourceAnchor}
                  onChange={(event) =>
                    layout.setSourceAnchor(event.target.value as typeof layout.sourceAnchor)
                  }
                >
                  {BOUNDS_ANCHOR_KINDS.map((anchor) => (
                    <option key={anchor} value={anchor}>
                      {t.layout.boundsAnchors[anchor]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>{t.layout.targetEntity}</span>
                <select
                  data-layout-control="true"
                  disabled={!layout.editable}
                  value={layout.targetEntityId ?? ""}
                  onChange={(event) => layout.setTargetEntityId(event.target.value || null)}
                >
                  <option value="">{t.layout.chooseTarget}</option>
                  {layout.documentEntities
                    .filter((entity) => entity.type !== "light")
                    .map((entity) => (
                      <option key={entity.id} value={entity.id}>
                        {entity.name} [{entity.id}]
                      </option>
                    ))}
                </select>
              </label>
              <label>
                <span>{t.layout.targetAnchor}</span>
                <select
                  data-layout-control="true"
                  disabled={!layout.editable}
                  value={layout.targetAnchor}
                  onChange={(event) =>
                    layout.setTargetAnchor(event.target.value as typeof layout.targetAnchor)
                  }
                >
                  {BOUNDS_ANCHOR_KINDS.map((anchor) => (
                    <option key={anchor} value={anchor}>
                      {t.layout.boundsAnchors[anchor]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <ActionButton
              action={layout.capabilities.anchorSnap}
              describedBy={anchorReasonId}
              icon={<Magnet size={13} />}
              label={t.layout.snapToAnchor}
              onClick={layout.snapToAnchor}
            />
            <ActionReason action={layout.capabilities.anchorSnap} id={anchorReasonId} />
          </section>

          <section
            className="layout-section layout-feedback"
            aria-labelledby="layout-feedback-title"
          >
            <h2 id="layout-feedback-title">
              <Crosshair size={13} /> {t.layout.spatialStatus}
            </h2>
            <div aria-atomic="true" aria-live="polite" role="status">
              <FeedbackRow
                label={t.layout.pivot}
                value={`${t.layout.pivotKinds[layout.feedback.pivotKind]} ${formatVector(layout.feedback.pivotWorld, t.layout.unavailable)}`}
              />
              <FeedbackRow
                label={t.layout.activeTool}
                value={t.app.viewport.toolStatus[layout.activeTool]}
              />
              <FeedbackRow
                label={t.layout.activeAxis}
                value={
                  layout.feedback.activity === "idle"
                    ? t.layout.unavailable
                    : layout.feedback.activeAxis === "free"
                      ? t.layout.freeAxis
                      : t.layout.axes[layout.feedback.activeAxis]
                }
              />
              <FeedbackRow
                label={feedbackDeltaLabel(layout, t)}
                value={feedbackDelta(layout, t.layout.radians, t.layout.unavailable)}
              />
              <FeedbackRow
                label={t.layout.settings}
                value={t.layout.settingsValue(
                  layout.feedback.settings.translationSnap,
                  layout.feedback.settings.rotationSnapRadians,
                  layout.feedback.settings.scaleSnap,
                )}
              />
              {layout.feedback.sourceAnchor !== null && (
                <FeedbackRow
                  label={t.layout.sourceAnchor}
                  value={formatAnchorReference(
                    layout,
                    layout.feedback.sourceAnchor,
                    t.layout.boundsAnchors[layout.feedback.sourceAnchor.anchorKind],
                  )}
                />
              )}
              {layout.feedback.targetAnchor !== null && (
                <FeedbackRow
                  label={t.layout.targetAnchor}
                  value={formatAnchorReference(
                    layout,
                    layout.feedback.targetAnchor,
                    t.layout.boundsAnchors[layout.feedback.targetAnchor.anchorKind],
                  )}
                />
              )}
              {layout.error !== null && (
                <p className="layout-reason is-error">{t.layout.reasons[layout.error]}</p>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function ActionButton({
  action,
  describedBy,
  icon,
  label,
  onClick,
}: {
  readonly action: LayoutActionState;
  readonly describedBy: string;
  readonly icon: React.ReactNode;
  readonly label: string;
  readonly onClick: () => void;
}) {
  return (
    <button
      aria-describedby={action.reason === null ? undefined : describedBy}
      className="layout-command"
      disabled={!action.enabled}
      title={label}
      type="button"
      onClick={onClick}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function ActionReason({ action, id }: { readonly action: LayoutActionState; readonly id: string }) {
  const { t } = useStudioI18n();
  return action.reason === null ? null : (
    <p className="layout-reason" id={id}>
      {t.layout.reasons[action.reason]}
    </p>
  );
}

function SnapInput({
  describedBy,
  disabled,
  invalid,
  label,
  value,
  onChange,
}: {
  readonly describedBy: string;
  readonly disabled: boolean;
  readonly invalid: boolean;
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
}) {
  return (
    <label>
      <span>{label}</span>
      <input
        aria-describedby={invalid ? describedBy : undefined}
        aria-invalid={invalid}
        data-layout-control="true"
        disabled={disabled}
        inputMode="decimal"
        placeholder="-"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function FeedbackRow({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="layout-feedback-row">
      <span>{label}</span>
      <strong className="mono">{value}</strong>
    </div>
  );
}

function formatVector(value: readonly number[] | null, unavailable = "-"): string {
  return value === null ? unavailable : value.map((number) => number.toFixed(3)).join(" / ");
}

function feedbackDelta(layout: StudioSceneLayout, radians: string, unavailable: string): string {
  if (layout.feedback.activity === "idle") return unavailable;
  if (layout.activeTool === "rotate") {
    return `${layout.feedback.deltaRotationRadians!.toFixed(3)} ${radians}`;
  }
  if (layout.activeTool === "scale") return formatVector(layout.feedback.deltaScale);
  return formatVector(layout.feedback.deltaPosition);
}

function feedbackDeltaLabel(
  layout: StudioSceneLayout,
  t: ReturnType<typeof useStudioI18n>["t"],
): string {
  if (layout.activeTool === "rotate") return t.layout.worldRotationDelta;
  if (layout.activeTool === "scale") return t.layout.localScaleDelta;
  return t.layout.worldPositionDelta;
}

function formatAnchorReference(
  layout: StudioSceneLayout,
  reference: NonNullable<StudioSceneLayout["feedback"]["sourceAnchor"]>,
  anchorLabel: string,
): string {
  const entity = layout.documentEntities.find((candidate) => candidate.id === reference.entityId);
  return `${entity?.name ?? reference.entityId} [${reference.entityId}] / ${anchorLabel}`;
}
