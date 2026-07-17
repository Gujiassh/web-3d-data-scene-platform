import type { DocumentCommand, Vec3 } from "@web3d/document";
import type { AuthoringTransformSettings } from "@web3d/runtime";

import type { LayoutAxis } from "./layout-selection";

export const BOUNDS_ANCHOR_KINDS = [
  "center",
  "minX",
  "maxX",
  "minY",
  "maxY",
  "minZ",
  "maxZ",
] as const;

export type BoundsAnchorKind = (typeof BOUNDS_ANCHOR_KINDS)[number];

export type LayoutFailureCode =
  | "run-disabled"
  | "selection-required"
  | "group-selection-minimum"
  | "align-selection-minimum"
  | "distribute-selection-minimum"
  | "mixed-parents"
  | "selection-missing"
  | "selection-locked"
  | "selection-hidden"
  | "selection-unsupported"
  | "bounds-unavailable"
  | "snapshot-unavailable"
  | "snapshot-stale"
  | "target-required"
  | "target-invalid"
  | "target-locked"
  | "target-hidden"
  | "target-current-parent"
  | "target-cycle"
  | "source-target-same"
  | "invalid-offset"
  | "invalid-transform"
  | "non-representable-transform"
  | "command-rejected"
  | "command-unavailable"
  | "unchanged";

export class LayoutPlanningError extends Error {
  override readonly name = "LayoutPlanningError";

  constructor(readonly code: LayoutFailureCode) {
    super(code);
  }
}

export interface LayoutSelectionReplacement {
  readonly entityIds: readonly string[];
  readonly primaryEntityId: string;
}

export interface SpatialFeedback {
  readonly activity: "idle" | "active";
  readonly pivotKind: "entity-origin" | "selection-bounds-center";
  readonly pivotWorld: Vec3 | null;
  readonly activeAxis: LayoutAxis | "free";
  readonly deltaPosition: Vec3 | null;
  readonly deltaRotationRadians: number | null;
  readonly deltaScale: Vec3 | null;
  readonly settings: AuthoringTransformSettings;
  readonly sourceAnchor: BoundsAnchorReference | null;
  readonly targetAnchor: BoundsAnchorReference | null;
}

export interface BoundsAnchorReference {
  readonly entityId: string;
  readonly anchorKind: BoundsAnchorKind;
}

export interface PlannedLayoutCommand {
  readonly command: DocumentCommand;
  readonly nextSelection?: LayoutSelectionReplacement;
  readonly feedback: SpatialFeedback;
}

export interface LayoutActionState {
  readonly enabled: boolean;
  readonly reason: LayoutFailureCode | null;
}

export const DISABLED_TRANSFORM_SETTINGS: AuthoringTransformSettings = {
  translationSnap: null,
  rotationSnapRadians: null,
  scaleSnap: null,
};
