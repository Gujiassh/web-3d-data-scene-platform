import { describe, expect, it } from "vitest";

import type { PerformanceSample } from "../../packages/runtime/src/index";
import {
  createPerformanceEventCapture,
  recordPerformanceEvent,
  stopPerformanceEventCapture,
} from "./event-capture";

const sample: PerformanceSample = {
  renderDurationMs: 16,
  drawCalls: 100,
  triangles: 190_000,
};

describe("release performance event capture", () => {
  it("releases collected events and stays bounded after capture stops", () => {
    const capture = createPerformanceEventCapture();
    recordPerformanceEvent(capture, 1, sample);
    recordPerformanceEvent(capture, 2, sample);
    expect(capture.times).toEqual([1, 2]);
    expect(capture.samples).toHaveLength(2);

    stopPerformanceEventCapture(capture);
    for (let index = 0; index < 100_000; index += 1) {
      recordPerformanceEvent(capture, index + 3, sample);
    }

    expect(capture.enabled).toBe(false);
    expect(capture.times).toEqual([]);
    expect(capture.samples).toEqual([]);
  });
});
