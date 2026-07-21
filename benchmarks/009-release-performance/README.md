# Feature 009 Release Performance Benchmark

This benchmark runs the production React `SceneViewer` against one deterministic generated fixture and writes raw JSONL,
a summary report, and Canvas evidence. It does not add benchmark APIs to Runtime or React.

## Fixture

`generate-fixture.mts` creates a CC0 GLB and SceneDocument with hard-checked shape:

- 300 entities, 150 non-overlapping Targets, and 100 enabled Bindings;
- 100 rendered mesh nodes plus 50 semantic-only target nodes;
- 190,000 unique triangles and 12-15 MB of referenced GLB geometry/texture bytes;
- one custom 200 Patch/s adapter over 100 pointers with 10 initial active alarms.

Generated files live under ignored `generated/`; the runner regenerates them before starting Vite.

## Controller Smoke

```bash
RELEASE_PERF_SMOKE=1 \
RELEASE_PERF_ALLOW_SOFTWARE=1 \
node --experimental-strip-types benchmarks/009-release-performance/run.mts
```

Smoke durations are intentionally shortened and the report is always marked `shortened-non-gating`. Software rendering
is accepted only with the explicit environment variable and is labeled `E1-controller-software`; it cannot satisfy E2.

## Canonical Run

```bash
POWER_MODE=balanced \
RELEASE_PERF_REFERENCE_DEVICE=1 \
node --experimental-strip-types benchmarks/009-release-performance/run.mts
```

The canonical profile uses a 5-second warm-up, fixed 60-second view path, 20 selection/Patch samples, 20 warm-cache
activations, and a 30-minute memory series sampled once per minute. An E2 claim additionally requires a hardware renderer
reported as Intel Iris Xe and an explicit power mode. SwiftShader, llvmpipe, unavailable renderer identity, changed
durations, or missing forced-GC evidence fail closed as non-E2 evidence.

Individual durations may be set with `RELEASE_PERF_WARMUP_MS`, `RELEASE_PERF_MEASUREMENT_MS`,
`RELEASE_PERF_ACTIVATION_COUNT`, `RELEASE_PERF_LATENCY_SAMPLE_COUNT`, `RELEASE_PERF_MEMORY_DURATION_MS`, and
`RELEASE_PERF_MEMORY_INTERVAL_MS`. Any deviation from the canonical profile is marked non-gating.

Artifacts default to `/home/cc/tmp/web3d-release-performance` and may be redirected with
`RELEASE_PERF_OUTPUT_DIR`. The report records source/dirty state, fixture hashes, CPU/RAM/OS/browser/GPU/viewport/DPR,
evidence class, exact formulas, gate results, and artifact hashes.

## Instrumentation

Benchmark-local instrumentation records production renderer draw calls/triangles and `renderer.info.memory`, RAF,
ResizeObserver, Canvas listener, interval, adapter connection, renderer, DOM, raw heap, and forced-GC heap series. It
restores patched globals/prototypes after the run. Selection and Patch samples require both the public Viewer snapshot and
a changed Canvas pixel frame on the same `performance.now()` clock. Every activation and final unmount must return all
owned resource probes to zero.

## Tests

```bash
pnpm exec vitest run --config benchmarks/009-release-performance/vitest.config.ts
```
