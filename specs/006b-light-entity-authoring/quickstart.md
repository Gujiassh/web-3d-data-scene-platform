# Quickstart: Verify Light Entity Authoring

**Status**: Implemented and accepted through T034/CHK038

## Review Order

1. Read [spec.md](spec.md) for behavior and semantic oracles.
2. Read [data-model.md](data-model.md) and [contracts/scene-document-1.3.md](contracts/scene-document-1.3.md).
3. Read [plan.md](plan.md) and [tasks.md](tasks.md) for gates, ownership and concrete path audits.
4. Use [checklists/requirements.md](checklists/requirements.md) for approval readiness.

## Pre-Approval Contract Review

Review the complete calibrated contract:

- `type: "light"` plus nested point/spot kind, root-only/no-child hierarchy and max eight;
- unitless authored brightness `[0,1000]`, Point default `25`, Spot default `10`, with no physical-unit claim;
- `Brightness` slider `[0,100]` and exact numeric input through `1000`, without explanatory copy;
- range/angle/penumbra/transform semantics, fixed decay 2 and shadows false;
- exactly three light commands, generic-route rejection and unlocked Duplicate result;
- every-intermediate frozen migration validation and schemaVersion-only 1.2 migration;
- JSON/ZIP/IndexedDB strategy with required null export revision on rewritten legacy records and byte-identical current records;
- scale-relative creation frame, Duplicate `[1,0,0]`, and the separate production performance protocol.

## Completed Design Evidence

1. The 006 GLB is `MeshBasicMaterial` and visually unaffected by lights; retain it for final production performance.
2. A temporary PBR fixture matched 006 camera/scale/fill-key under real Chromium/Three r185 without production edits.
3. Point 25 measured 22.0% changed pixels, mean RGB delta 9.11, 0.256% saturation and zero clipping.
4. Spot 10 measured 1.40% changed pixels, mean delta 14.80 and zero saturation/clipping.
5. Eight Point 25 clipped 5.28% of changed-region pixels; eight Spot 10 clipped zero.
6. Raw 10,000 values clipped about 98.8% Point and 91.9% Spot, rejecting that cap; final range is `[0,1000]`.
7. The browser used SwiftShader, so these timing samples are not final production performance acceptance.
8. Evidence lives at `/home/cc/tmp/web3d-light-calibration*.json/png`.

Independent final review passed, and complete user approval was recorded on 2026-07-17.

## Completed Production Evidence

- Hardware acceptance used Windows system Chrome 150 on RTX 3090/D3D11 at 1440x900 DPR1.
- Both fixtures recorded each shader transition separately, then 30 observed warm-ups and 300 serial measured events
  for zero, Point 25, Spot 10 and the mixed 4+4 state.
- Mixed-eight warmed p95 was `0.20ms` for 006 overhead and `0.30ms` for the deterministic PBR fixture, below `33.3ms`.
- The runner rejects software rendering, wrong browser profile/sample shape, blank Canvas evidence and threshold failure.
- Full verification passed: 90 files / 533 unit tests, standalone validator smoke, TypeScript, lint, build, i18n,
  design, topology, format/diff and 22/22 Chromium/WebGL E2E.
- Durable evidence: `artifacts/performance/006b-light-performance.json` and
  `artifacts/performance/006b-light-performance-canvas.png`.

## Post-Implementation Verification Walkthrough

1. Prove 1.0 validates -> 1.1 validates -> 1.2 validates -> 1.3 validates; inject invalid 1.1/1.2 intermediates.
2. Compare 1.2 and 1.3 payload/pixels; only `schemaVersion` may differ and zero lights exist.
3. Submit an invalid current source; prove validation rejects before classification/mutation and old Runtime remains.
4. Submit same-document lower revision, equal identical, equal conflicting and greater revision sources. Prove
   reject/no-op/reject/proceed respectively, no ready for the first three, and a lower-revision different-document
   project switch remains valid.
5. Exercise same-document light-only add/update/remove/Undo/Redo; prove atomic matching ready and stable
   Canvas/generation/assets/adapters/camera/controls/fill-key. Prove a non-light diff uses full load.
6. Open the Lighting menu and verify exact labels: `Add point`/`添加点光源`, `Add spot`/`添加聚光灯`,
   `Scene lighting settings`/`场景灯光设置`, and `n/8`.
7. Verify roles, Arrow/Home/End, Escape/outside close, focus transfer/restoration and localized disabled reasons for
   Run, 8/8 and unavailable creation frame.
8. Prove Add has no fallback. Verify position is target plus world `+Y` by
   `clamp(camera-target distance * 0.2, 0.5, 5)`, then prove menu close/selection and Spot aiming.
9. Verify Point Translate only, Spot Translate/Rotate only and Scale never at Studio and Runtime boundaries.
10. Enter Run during drag; prove synchronous revert, no preview/commit, controls/helpers/proxies/overlay/picks absent.
    Return to Edit and prove one valid selection/helper set without duplicates.
11. Exercise locked visibility/unlock, rejected locked edits/remove, locked-source Duplicate -> unlocked copy and every
    generic command rejection without redo clearing.
12. Prove light tree visibility/lock/delete route through update/remove; Inspector focuses first invalid field.
13. Prove no light enters Group/Reparent/layout or data-binding target paths; complete the 16-file branch audit.
14. Neutralize imported glTF lights and prove child/association/target preservation plus post-replacement
    `nodesByIndex` resolution.
15. Import legacy JSON/ZIP/IndexedDB; prove rewritten legacy export revisions are null, already-current records are
    byte-identical, export is current 1.3 and archive container remains 1.0.0.
16. Use deterministic `tests/fixtures/006b-light-performance-pbr/**`. On both 006 overhead and
    lit PBR shader-cost fixtures in production path/system Chromium at 1440x900 DPR1, test zero, one Point 25, one Spot
    10 and eight-light 4+4 mix. Record compile separately; serially observe 30 warm-ups and 300 samples per state;
    require each eight-light p95 `<= 33.3 ms`. Make no visual business-meaning claim.

Run the default system Chromium executable:

```bash
pnpm bench:light-006b
```

If the hardware-backed acceptance browser is already running with a remote debugging endpoint, connect to it:

```bash
SYSTEM_CHROMIUM_CDP_URL=http://127.0.0.1:9333 pnpm bench:light-006b
```

The command rejects SwiftShader/llvmpipe, a missing renderer, wrong sample counts, nonblank-Canvas failure, a viewport
other than 1440x900 DPR1, or either mixed-eight p95 above 33.3ms.

## Required Evidence

- raw migration payloads and invalid-intermediate diagnostics
- current-source validation-before-classification traces
- same-document lower/equal-identical/equal-conflict/greater and cross-document revision traces with ready counts
- light-only/full-load/stale/superseded identity and ready traces
- command document/revision/history/redo snapshots
- Edit/Run drag, selection, helper, overlay and pick evidence
- bilingual menu DOM/focus/disabled-reason evidence
- design calibration JSON/PNG evidence and separate dual-fixture serial observed-event production performance data
- imported child tree/associations/targets/`nodesByIndex`
- all-record IndexedDB before/after/rollback snapshots

## Stop Conditions

Stop if work would claim a physical intensity unit, bypass the approved contract, skip an intermediate validator,
classify before complete current validation, use a creation fallback, couple Run to data runtime, allow generic light
mutation/grouping, partially publish a fast-path load, lose imported node mapping or change archive container 1.0.0.
