import type { PerformanceSample } from "../../packages/runtime/src/index";

export interface PerformanceEventCapture {
  enabled: boolean;
  readonly times: number[];
  readonly samples: PerformanceSample[];
}

export function createPerformanceEventCapture(): PerformanceEventCapture {
  return { enabled: true, times: [], samples: [] };
}

export function recordPerformanceEvent(
  capture: PerformanceEventCapture,
  at: number,
  sample: PerformanceSample,
): void {
  if (!capture.enabled) return;
  capture.times.push(at);
  capture.samples.push(sample);
}

export function stopPerformanceEventCapture(capture: PerformanceEventCapture): void {
  capture.enabled = false;
  capture.times.length = 0;
  capture.samples.length = 0;
}
