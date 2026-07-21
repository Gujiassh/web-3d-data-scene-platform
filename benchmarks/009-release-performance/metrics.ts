export interface TimedValue {
  readonly elapsedMs: number;
  readonly value: number;
}

export interface DistributionSummary {
  readonly count: number;
  readonly median: number;
  readonly p95: number;
  readonly p99: number;
  readonly max: number;
}

export function summarizeDistribution(values: readonly number[]): DistributionSummary {
  if (values.length === 0) throw new Error("Distribution requires at least one value.");
  const sorted = [...values].sort((left, right) => left - right);
  return {
    count: sorted.length,
    median: median(sorted),
    p95: nearestRank(sorted, 0.95),
    p99: nearestRank(sorted, 0.99),
    max: sorted.at(-1)!,
  };
}

export function summarizeFrames(frameDeltaMs: readonly number[]) {
  const distribution = summarizeDistribution(frameDeltaMs);
  return {
    ...distribution,
    medianFps: 1000 / distribution.median,
    onePercentLowFps: 1000 / distribution.p99,
  };
}

export function nearestRank(sortedValues: readonly number[], percentile: number): number {
  if (sortedValues.length === 0) throw new Error("Percentile requires at least one value.");
  if (!(percentile > 0 && percentile <= 1)) throw new RangeError("Percentile must be in (0, 1].");
  const index = Math.min(sortedValues.length - 1, Math.ceil(sortedValues.length * percentile) - 1);
  return sortedValues[index]!;
}

export function median(sortedValues: readonly number[]): number {
  if (sortedValues.length === 0) throw new Error("Median requires at least one value.");
  const middle = Math.floor(sortedValues.length / 2);
  return sortedValues.length % 2 === 0
    ? (sortedValues[middle - 1]! + sortedValues[middle]!) / 2
    : sortedValues[middle]!;
}

export function theilSenSlope(samples: readonly TimedValue[]): number | null {
  if (samples.length < 2) return null;
  const slopes: number[] = [];
  for (let left = 0; left < samples.length - 1; left += 1) {
    for (let right = left + 1; right < samples.length; right += 1) {
      const elapsed = samples[right]!.elapsedMs - samples[left]!.elapsedMs;
      if (elapsed > 0) {
        slopes.push((samples[right]!.value - samples[left]!.value) / elapsed);
      }
    }
  }
  return slopes.length === 0 ? null : median(slopes.sort((left, right) => left - right));
}

export function memoryFinalLimit(baselineBytes: number): number {
  return baselineBytes + Math.max(8 * 1024 * 1024, baselineBytes * 0.05);
}
