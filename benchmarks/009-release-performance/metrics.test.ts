import { describe, expect, it } from "vitest";

import { memoryFinalLimit, nearestRank, summarizeFrames, theilSenSlope } from "./metrics";

describe("release performance formulas", () => {
  it("uses exact median and nearest-rank p99 FPS formulas", () => {
    const summary = summarizeFrames([10, 20, 30, 40, 50]);
    expect(summary.median).toBe(30);
    expect(summary.p99).toBe(50);
    expect(summary.medianFps).toBe(1000 / 30);
    expect(summary.onePercentLowFps).toBe(20);
    expect(nearestRank([1, 2, 3, 4, 5], 0.95)).toBe(5);
  });

  it("computes Theil-Sen from all pairwise slopes", () => {
    expect(
      theilSenSlope([
        { elapsedMs: 0, value: 9 },
        { elapsedMs: 1, value: 7 },
        { elapsedMs: 2, value: 5 },
        { elapsedMs: 3, value: 3 },
      ]),
    ).toBe(-2);
    expect(theilSenSlope([{ elapsedMs: 0, value: 1 }])).toBeNull();
  });

  it("uses the larger of 8 MiB and five percent for heap final delta", () => {
    expect(memoryFinalLimit(10 * 1024 * 1024)).toBe(18 * 1024 * 1024);
    expect(memoryFinalLimit(400 * 1024 * 1024)).toBe(420 * 1024 * 1024);
  });
});
