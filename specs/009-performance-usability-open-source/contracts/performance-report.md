# Feature 009 Performance Report Contract

The report is evidence, not configuration. It binds raw samples to source and fixture identity.

## Required Identity

- source commit and dirty state;
- fixture/document/asset hashes and verified load counts;
- CPU, GPU/renderer, RAM, OS, browser/version, viewport, DPR and power mode;
- controller software, hardware supplemental or exact reference-device evidence class.

## Required Fixture Shape

- 300 entities, 150 Targets, 100 enabled Bindings;
- 180,000-200,000 unique triangles, <=120 draw calls and 12-15 MB compressed assets;
- 200 Patch/s over 100 pointers and 10 active alarms.

The runner exits nonzero before measurement when any count/range is wrong.

## Required Raw Samples

- frame deltas for five-second warm-up plus fixed 60-second camera path;
- selection event-to-render-state-and-Canvas-visible-frame samples on one monotonic clock;
- Patch sequence-to-render-state-and-Canvas-visible-effect samples on the same clock;
- at least 20 warm-cache activation durations;
- minute memory samples for 30 minutes, with raw and forced-GC series where available;
- before/after dispose resource-probe counts.

## Formulas

- `medianFps = 1000 / median(frameDeltaMs)`;
- `onePercentLowFps = 1000 / nearestRankP99(frameDeltaMs)`;
- latency/activation p95 uses nearest-rank percentile;
- forced-GC JS heap slope uses Theil-Sen over post-warm-up minute samples and must be non-positive; final delta must be
  <=max(8 MiB, 5% of baseline);
- DOM nodes, renderer geometries/textures and owned runtime resources each require non-positive slope and final value no
  higher than their post-warm-up baseline;
- dispose passes only when every owned resource count is zero.

No metric is rounded before its gate comparison. Raw samples, formulas and resulting gates are stored together.
