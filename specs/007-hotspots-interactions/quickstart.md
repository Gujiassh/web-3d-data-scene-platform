# Quickstart: Review And Verify Hotspots

**Status**: Calibrated design approved for implementation on 2026-07-18

## Review Order

1. Read [spec.md](spec.md) and [interaction-design.md](interaction-design.md) for the product flow.
2. Read [data-model.md](data-model.md) and
   [contracts/scene-document-1.4.md](contracts/scene-document-1.4.md) for proposed persisted meaning.
3. Read [technical-design.md](technical-design.md), [plan.md](plan.md) and [tasks.md](tasks.md).
4. Read [review.md](review.md) and [checklists/requirements.md](checklists/requirements.md) for gate status.

## Final Approval Scope

One approval authorizes the complete package only:

- upgrade Annotation in place to SceneDocument 1.4;
- exact rigid entity/hash/node-local Surface anchors and opaque Legacy anchors;
- visible/locked/content plus one of four closed actions;
- complete-snapshot commands, locked exceptions and delete cascades;
- deterministic migration, one-transaction IndexedDB rewrite and current-only export;
- dynamic no-cap marker rendering, DOM proxies and opaque depth-writing occlusion policy;
- implementation plan and calibrated performance gates.

The user explicitly approved this complete scope on 2026-07-18. SceneDocument 1.3 remains production authority until
the approved migration is implemented and accepted.

## Run Calibration

The default command rejects software rendering:

```bash
pnpm bench:hotspot-007
```

Use an already-running hardware Chrome CDP endpoint when available:

```bash
SYSTEM_CHROMIUM_CDP_URL=http://127.0.0.1:9333 pnpm bench:hotspot-007
```

Use software only for non-acceptance harness diagnostics:

```bash
HOTSPOT_CALIBRATION_ALLOW_SOFTWARE=1 \
SYSTEM_CHROMIUM=/usr/bin/chromium-browser \
pnpm bench:hotspot-007
```

The accepted 2026-07-18 run used Windows Chrome 150 and RTX 3090/D3D11 at 1440x900 DPR1. Fixture SHA-256 is
`3958d1fb5060a36a9e0db7374a6361abdc61770f74114c296418fab047485e4a`.

## Evidence

- Summary: `artifacts/performance/007-hotspot-calibration.json`
- Fixture: `artifacts/performance/007-hotspot-calibration-fixture.json`
- Raw samples: `artifacts/performance/007-hotspot-calibration-samples.jsonl`
- Trace summary: `artifacts/performance/007-hotspot-calibration-trace.json`
- Raw trace events: `artifacts/performance/007-hotspot-calibration-trace-events.jsonl`
- Zero screenshot: `artifacts/performance/007-hotspot-calibration-zero.png`
- 200-marker screenshot: `artifacts/performance/007-hotspot-calibration-canvas.png`

The summary records SHA-256 values for the fixture and raw sidecars. The runner rejects software acceptance, wrong
viewport/profile, malformed sample counts, missing markers/proxies/pixels, performance overflow, incorrect occlusion or
picking, pointer-to-Paint latency, idle raycasts, cleanup leaks, long tasks and unbounded style/layout trace counts. It
also records SHA-256 values for every harness source file so retained hardware evidence cannot be applied to later code.

## Current Verification

```bash
pnpm exec prettier --check package.json \
  benchmarks/007-hotspot-calibration \
  artifacts/performance/007-hotspot-calibration.json \
  artifacts/performance/007-hotspot-calibration-fixture.json \
  artifacts/performance/007-hotspot-calibration-trace.json
pnpm exec vitest run --config benchmarks/007-hotspot-calibration/vitest.config.ts
pnpm exec eslint benchmarks/007-hotspot-calibration
pnpm typecheck
git diff --check
```

## Stop Conditions

CHK032 closed on 2026-07-18. Stop and return for a new decision if work would introduce a hotspot count cap, fixed 200
production capacity, Runtime legacy adapter, coordinate guess, automatic Target, script action, host route, unapproved
database/archive shape change or policy inside the oversized viewport.
