export interface TransformSettingsDraft {
  readonly translationSnap: string;
  readonly rotationSnapDegrees: string;
  readonly scaleSnap: string;
}

export interface ParsedTransformSettings {
  readonly translationSnap: number | null;
  readonly rotationSnapRadians: number | null;
  readonly scaleSnap: number | null;
}

export type TransformSettingsDraftField = keyof TransformSettingsDraft;

export type TransformSettingsDraftValidation =
  | { readonly valid: true; readonly settings: ParsedTransformSettings }
  | { readonly valid: false; readonly invalidFields: readonly TransformSettingsDraftField[] };

export function validateTransformSettingsDraft(
  draft: TransformSettingsDraft,
): TransformSettingsDraftValidation {
  const translationSnap = parsePositiveStep(draft.translationSnap);
  const rotationSnapDegrees = parsePositiveStep(draft.rotationSnapDegrees, 360);
  const scaleSnap = parsePositiveStep(draft.scaleSnap);
  const invalidFields: TransformSettingsDraftField[] = [];

  if (translationSnap === undefined) invalidFields.push("translationSnap");
  if (rotationSnapDegrees === undefined) invalidFields.push("rotationSnapDegrees");
  if (scaleSnap === undefined) invalidFields.push("scaleSnap");

  if (
    translationSnap === undefined ||
    rotationSnapDegrees === undefined ||
    scaleSnap === undefined
  ) {
    return { valid: false, invalidFields };
  }
  return {
    valid: true,
    settings: {
      translationSnap,
      rotationSnapRadians:
        rotationSnapDegrees === null ? null : (rotationSnapDegrees * Math.PI) / 180,
      scaleSnap,
    },
  };
}

function parsePositiveStep(
  draft: string,
  maximum = Number.POSITIVE_INFINITY,
): number | null | undefined {
  const normalized = draft.trim();
  if (normalized === "") return null;
  const value = Number(normalized);
  if (!Number.isFinite(value) || value <= 0 || value > maximum) return undefined;
  return value;
}
