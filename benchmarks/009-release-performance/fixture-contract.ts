import type { JsonValue } from "../../packages/runtime/src/index";

export const FIXTURE_ENTITY_COUNT = 300;
export const FIXTURE_TARGET_COUNT = 150;
export const FIXTURE_BINDING_COUNT = 100;
export const FIXTURE_RENDERABLE_NODE_COUNT = 100;
export const FIXTURE_UNIQUE_TRIANGLES = 190_000;
export const FIXTURE_PATCH_RATE_HZ = 200;
export const FIXTURE_ACTIVE_ALARMS = 10;
export const FIXTURE_MIN_ASSET_BYTES = 12_000_000;
export const FIXTURE_MAX_ASSET_BYTES = 15_000_000;
export const FIXTURE_MAX_DRAW_CALLS = 120;
export const FIXTURE_SOURCE_ID = "benchmark-source";
export const FIXTURE_ASSET_ID = "benchmark-asset";
export const FIXTURE_ASSET_ENTITY_ID = "benchmark-surface";

export function fixturePointer(index: number): string {
  return `/channels/channel-${String(index).padStart(3, "0")}/status`;
}

export function fixtureTargetId(index: number): string {
  return `benchmark-target-${String(index).padStart(3, "0")}`;
}

export function fixtureBindingId(index: number): string {
  return `benchmark-binding-${String(index).padStart(3, "0")}`;
}

export function fixtureViewId(index: number): string {
  return `benchmark-view-${String(index).padStart(3, "0")}`;
}

export function initialStatus(index: number): "alarm" | "ready" {
  return index < FIXTURE_ACTIVE_ALARMS ? "alarm" : "ready";
}

export function createInitialValue(): JsonValue {
  return {
    channels: Object.fromEntries(
      Array.from({ length: FIXTURE_BINDING_COUNT }, (_, index) => [
        `channel-${String(index).padStart(3, "0")}`,
        { status: initialStatus(index) },
      ]),
    ),
  };
}
