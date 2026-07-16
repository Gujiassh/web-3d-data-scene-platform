import type { Vec3 } from "@web3d/document";

import type { EntitySpatialSnapshot, EntityWorldBounds } from "../../types";

export type SmartAlignAxis = "x" | "y" | "z";
export type SmartAlignAnchor = "min" | "center" | "max";

export interface SmartAlignCandidate {
  readonly axis: SmartAlignAxis;
  readonly movingAnchor: SmartAlignAnchor;
  readonly referenceAnchor: SmartAlignAnchor;
  readonly referenceEntityId: string | null;
  readonly referenceCoordinate: number;
  readonly delta: number;
  readonly relationRank: number;
  readonly guideStart: Vec3;
  readonly guideEnd: Vec3;
}

export interface SmartAlignReferenceIndex {
  readonly x: readonly SmartAlignReferenceAnchor[];
  readonly y: readonly SmartAlignReferenceAnchor[];
  readonly z: readonly SmartAlignReferenceAnchor[];
}

interface SmartAlignReferenceAnchor {
  readonly anchor: SmartAlignAnchor;
  readonly coordinate: number;
  readonly entityId: string;
  readonly hierarchyDepth: number;
  readonly referencePoint: Vec3;
}

interface CandidateRank extends SmartAlignCandidate {
  readonly absoluteDelta: number;
  readonly hierarchyDepth: number;
  readonly origin: boolean;
}

const AXES = ["x", "y", "z"] as const;
const ANCHORS = ["min", "center", "max"] as const;
const RELATIONS = [
  "center-center",
  "min-min",
  "max-max",
  "center-min",
  "center-max",
  "min-center",
  "max-center",
  "min-max",
  "max-min",
] as const;
const RELATION_RANK = new Map(RELATIONS.map((relation, index) => [relation, index]));

export function buildSmartAlignReferenceIndex(
  snapshots: readonly EntitySpatialSnapshot[],
  movingEntityId: string,
  selectedEntityIds: readonly string[],
): SmartAlignReferenceIndex {
  const byId = new Map(snapshots.map((snapshot) => [snapshot.entityId, snapshot]));
  const excluded = excludedReferenceIds(byId, movingEntityId, selectedEntityIds);
  const index: Record<SmartAlignAxis, SmartAlignReferenceAnchor[]> = { x: [], y: [], z: [] };

  for (const snapshot of snapshots) {
    if (excluded.has(snapshot.entityId) || !snapshot.visible || snapshot.worldBounds === null)
      continue;
    const hierarchyDepth = entityDepth(snapshot, byId);
    for (const axis of AXES) {
      for (const anchor of ANCHORS) {
        index[axis].push({
          anchor,
          coordinate: anchorCoordinate(snapshot.worldBounds, axis, anchor),
          entityId: snapshot.entityId,
          hierarchyDepth,
          referencePoint: anchorPoint(snapshot.worldBounds, axis, anchor),
        });
      }
    }
  }

  for (const axis of AXES) index[axis].sort(compareReferenceAnchors);
  return Object.freeze({
    x: Object.freeze(index.x),
    y: Object.freeze(index.y),
    z: Object.freeze(index.z),
  });
}

export function findSmartAlignCandidate(
  index: SmartAlignReferenceIndex,
  movingBounds: EntityWorldBounds,
  axis: SmartAlignAxis,
  threshold: number,
): SmartAlignCandidate | null {
  if (!Number.isFinite(threshold) || threshold < 0) return null;
  const candidates: CandidateRank[] = [];

  for (const movingAnchor of ANCHORS) {
    const movingCoordinate = anchorCoordinate(movingBounds, axis, movingAnchor);
    for (const reference of referencesWithin(index[axis], movingCoordinate, threshold)) {
      const rank = relationRank(movingAnchor, reference.anchor);
      candidates.push({
        axis,
        movingAnchor,
        referenceAnchor: reference.anchor,
        referenceEntityId: reference.entityId,
        referenceCoordinate: reference.coordinate,
        delta: reference.coordinate - movingCoordinate,
        relationRank: rank,
        guideStart: snappedAnchorPoint(movingBounds, axis, movingAnchor, reference.coordinate),
        guideEnd: reference.referencePoint,
        absoluteDelta: Math.abs(reference.coordinate - movingCoordinate),
        hierarchyDepth: reference.hierarchyDepth,
        origin: false,
      });
    }

    const originDelta = -movingCoordinate;
    if (Math.abs(originDelta) <= threshold) {
      candidates.push({
        axis,
        movingAnchor,
        referenceAnchor: "center",
        referenceEntityId: null,
        referenceCoordinate: 0,
        delta: originDelta,
        relationRank: relationRank(movingAnchor, "center"),
        absoluteDelta: Math.abs(originDelta),
        hierarchyDepth: -1,
        origin: true,
        guideStart: snappedAnchorPoint(movingBounds, axis, movingAnchor, 0),
        guideEnd: [0, 0, 0],
      });
    }
  }

  const best = candidates.sort(compareCandidates)[0];
  if (best === undefined) return null;
  return Object.freeze({
    axis: best.axis,
    movingAnchor: best.movingAnchor,
    referenceAnchor: best.referenceAnchor,
    referenceEntityId: best.referenceEntityId,
    referenceCoordinate: best.referenceCoordinate,
    delta: best.delta,
    relationRank: best.relationRank,
    guideStart: Object.freeze([...best.guideStart]) as Vec3,
    guideEnd: Object.freeze([...best.guideEnd]) as Vec3,
  });
}

export function smartAlignThreshold(
  positiveCameraDepth: number,
  verticalFovDegrees: number,
  viewportCssHeight: number,
  pixelThreshold = 8,
): number | null {
  if (
    !Number.isFinite(positiveCameraDepth) ||
    positiveCameraDepth <= 0 ||
    !Number.isFinite(verticalFovDegrees) ||
    verticalFovDegrees <= 0 ||
    verticalFovDegrees >= 180 ||
    !Number.isFinite(viewportCssHeight) ||
    viewportCssHeight <= 0 ||
    !Number.isFinite(pixelThreshold) ||
    pixelThreshold < 0
  ) {
    return null;
  }
  const radians = (verticalFovDegrees * Math.PI) / 180;
  return pixelThreshold * ((2 * positiveCameraDepth * Math.tan(radians / 2)) / viewportCssHeight);
}

export function activeSmartAlignAxes(
  controlAxis: string | null | undefined,
): readonly SmartAlignAxis[] {
  if (controlAxis === null || controlAxis === undefined) return [];
  return AXES.filter((axis) => controlAxis.includes(axis.toUpperCase()));
}

export function snapWorldPositionToStep(
  worldPosition: Vec3,
  axes: readonly SmartAlignAxis[],
  step: number | null,
): Vec3 {
  if (step === null) return [...worldPosition];
  if (!Number.isFinite(step) || step <= 0) {
    throw new TypeError("Translation snap step must be null or a finite number greater than zero.");
  }
  const enabled = new Set(axes);
  return [
    enabled.has("x") ? Math.round(worldPosition[0] / step) * step : worldPosition[0],
    enabled.has("y") ? Math.round(worldPosition[1] / step) * step : worldPosition[1],
    enabled.has("z") ? Math.round(worldPosition[2] / step) * step : worldPosition[2],
  ];
}

export function boundsCenter(bounds: EntityWorldBounds): Vec3 {
  return [
    (bounds.min[0] + bounds.max[0]) / 2,
    (bounds.min[1] + bounds.max[1]) / 2,
    (bounds.min[2] + bounds.max[2]) / 2,
  ];
}

function excludedReferenceIds(
  byId: ReadonlyMap<string, EntitySpatialSnapshot>,
  movingEntityId: string,
  selectedEntityIds: readonly string[],
): ReadonlySet<string> {
  const excluded = new Set<string>([movingEntityId]);
  let ancestor = byId.get(movingEntityId);
  const visited = new Set<string>();
  while (ancestor?.parentId !== null && ancestor?.parentId !== undefined) {
    if (visited.has(ancestor.parentId)) break;
    visited.add(ancestor.parentId);
    excluded.add(ancestor.parentId);
    ancestor = byId.get(ancestor.parentId);
  }

  const roots = new Set([movingEntityId, ...selectedEntityIds]);
  for (const snapshot of byId.values()) {
    let current: EntitySpatialSnapshot | undefined = snapshot;
    const lineage = new Set<string>();
    while (current !== undefined) {
      if (roots.has(current.entityId)) {
        excluded.add(snapshot.entityId);
        break;
      }
      if (current.parentId === null || lineage.has(current.entityId)) break;
      lineage.add(current.entityId);
      current = byId.get(current.parentId);
    }
  }
  return excluded;
}

function entityDepth(
  snapshot: EntitySpatialSnapshot,
  byId: ReadonlyMap<string, EntitySpatialSnapshot>,
): number {
  let depth = 0;
  let current: EntitySpatialSnapshot | undefined = snapshot;
  const visited = new Set<string>();
  while (current?.parentId !== null && current?.parentId !== undefined) {
    if (visited.has(current.entityId)) break;
    visited.add(current.entityId);
    current = byId.get(current.parentId);
    if (current !== undefined) depth += 1;
  }
  return depth;
}

function referencesWithin(
  references: readonly SmartAlignReferenceAnchor[],
  coordinate: number,
  threshold: number,
): readonly SmartAlignReferenceAnchor[] {
  const minimum = coordinate - threshold;
  const maximum = coordinate + threshold;
  let low = 0;
  let high = references.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if ((references[middle]?.coordinate ?? Number.POSITIVE_INFINITY) < minimum) low = middle + 1;
    else high = middle;
  }
  const matches: SmartAlignReferenceAnchor[] = [];
  for (let index = low; index < references.length; index += 1) {
    const reference = references[index]!;
    if (reference.coordinate > maximum) break;
    matches.push(reference);
  }
  return matches;
}

function anchorCoordinate(
  bounds: EntityWorldBounds,
  axis: SmartAlignAxis,
  anchor: SmartAlignAnchor,
): number {
  const index = AXES.indexOf(axis);
  const minimum = bounds.min[index]!;
  const maximum = bounds.max[index]!;
  if (anchor === "min") return minimum;
  if (anchor === "max") return maximum;
  return (minimum + maximum) / 2;
}

function anchorPoint(
  bounds: EntityWorldBounds,
  axis: SmartAlignAxis,
  anchor: SmartAlignAnchor,
): Vec3 {
  const point = [...boundsCenter(bounds)] as [number, number, number];
  const index = AXES.indexOf(axis);
  point[index] = anchorCoordinate(bounds, axis, anchor);
  return point;
}

function snappedAnchorPoint(
  bounds: EntityWorldBounds,
  axis: SmartAlignAxis,
  anchor: SmartAlignAnchor,
  coordinate: number,
): Vec3 {
  const point = [...anchorPoint(bounds, axis, anchor)] as [number, number, number];
  point[AXES.indexOf(axis)] = coordinate;
  return point;
}

function relationRank(moving: SmartAlignAnchor, reference: SmartAlignAnchor): number {
  const rank = RELATION_RANK.get(`${moving}-${reference}` as (typeof RELATIONS)[number]);
  if (rank === undefined)
    throw new TypeError(`Unsupported smart-align relation ${moving}-${reference}.`);
  return rank;
}

function compareReferenceAnchors(
  left: SmartAlignReferenceAnchor,
  right: SmartAlignReferenceAnchor,
): number {
  return (
    left.coordinate - right.coordinate ||
    compareIds(left.entityId, right.entityId) ||
    relationRank("center", left.anchor) - relationRank("center", right.anchor)
  );
}

function compareCandidates(left: CandidateRank, right: CandidateRank): number {
  return (
    left.absoluteDelta - right.absoluteDelta ||
    Number(left.origin) - Number(right.origin) ||
    left.relationRank - right.relationRank ||
    right.hierarchyDepth - left.hierarchyDepth ||
    compareIds(left.referenceEntityId ?? "", right.referenceEntityId ?? "")
  );
}

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
