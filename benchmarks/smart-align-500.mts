import { performance } from "node:perf_hooks";

import type { EntitySpatialSnapshot, EntityWorldBounds } from "../packages/runtime/src/types.ts";
import {
  buildSmartAlignReferenceIndex,
  findSmartAlignCandidate,
} from "../packages/runtime/src/authoring/smart-align/oracle.ts";

const ENTITY_COUNT = 500;
const WARM_RUNS = 200;
const MEASURED_RUNS = 1_000;
const snapshots = fixtures();
const movingBounds = snapshots[0]!.worldBounds!;

for (let run = 0; run < WARM_RUNS; run += 1) measureOnce();
const durations = Array.from({ length: MEASURED_RUNS }, measureOnce).sort((a, b) => a - b);
const median = percentile(durations, 0.5);
const p95 = percentile(durations, 0.95);
const maximum = durations.at(-1) ?? 0;

console.log(
  `smart-align-benchmark entities=${ENTITY_COUNT} anchors_per_axis=${(ENTITY_COUNT - 1) * 3} warm_runs=${WARM_RUNS} measured_runs=${MEASURED_RUNS} median_ms=${median.toFixed(3)} p95_ms=${p95.toFixed(3)} max_ms=${maximum.toFixed(3)}`,
);
if (p95 > 4) process.exitCode = 1;

function measureOnce(): number {
  const started = performance.now();
  const index = buildSmartAlignReferenceIndex(snapshots, "entity-000", ["entity-000"]);
  findSmartAlignCandidate(index, movingBounds, "x", 0.4);
  findSmartAlignCandidate(index, movingBounds, "y", 0.4);
  findSmartAlignCandidate(index, movingBounds, "z", 0.4);
  return performance.now() - started;
}

function fixtures(): readonly EntitySpatialSnapshot[] {
  return Array.from({ length: ENTITY_COUNT }, (_, index) => {
    const x = ((index * 37) % 101) - 50;
    const y = ((index * 19) % 47) - 10;
    const z = ((index * 29) % 83) - 40;
    const bounds: EntityWorldBounds = {
      min: [x - 0.5, y - 0.5, z - 0.5],
      max: [x + 0.5, y + 0.5, z + 0.5],
    };
    return {
      documentId: "benchmark",
      documentRevision: 1,
      entityId: `entity-${String(index).padStart(3, "0")}`,
      parentId: index > 0 && index % 25 === 0 ? "entity-001" : null,
      localTransform: { position: [x, y, z], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
      worldMatrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1],
      worldBounds: bounds,
      worldPivot: [x, y, z],
      visible: true,
      locked: index % 17 === 0,
    } satisfies EntitySpatialSnapshot;
  });
}

function percentile(values: readonly number[], ratio: number): number {
  return values[Math.min(values.length - 1, Math.floor(values.length * ratio))] ?? 0;
}
