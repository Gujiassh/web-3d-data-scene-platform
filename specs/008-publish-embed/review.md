# Critical Review: Publish And Embed

**Status**: T010-T023 publish package and Studio integration PASS; embed acceptance pending

**Date**: 2026-07-19

## Semantic Oracle

1. No bundle exists unless current document, exact Surface evidence and asset bytes belong to one accepted snapshot.
2. Publish output is deterministic and contains authored document/assets plus declarative host requirements only.
3. Loader validates canonical manifest/scene before returning and AssetResolver revalidates each declared asset.
4. SceneDocument 1.4, archive 1.0, ProjectRecord, autosave, history and existing Runtime/React signatures do not change.

## Findings And Closure

| ID  | Severity | Finding                                                                        | Closure                                                                  |
| --- | -------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| P1  | P1       | A structurally forged ready object could call the bundle builder               | Package-internal WeakMap token stores a private cloned accepted snapshot |
| P2  | P1       | Raw asset resolver errors could expose host URL or credential-bearing detail   | Stable missing-asset blocker omits the external error text               |
| P3  | P2       | Asset reads continued after a Legacy/unresolved hotspot already blocked output | Annotation blockers return before any asset resolution                   |
| P4  | P1       | Duplicate or unknown Surface evidence could be silently ignored                | Both cases have explicit closed blocker codes and direct tests           |
| P5  | P1       | Global authoring shortcuts remained active while the Publish dialog was open   | Publish state now participates in the existing modal shortcut gate       |
| P6  | P1       | Vite preview returned SPA HTML 200 for missing published bundle paths          | Minimal host rejects missing `/published/*` paths with an explicit 404   |

P1-P4 were closed before the publish-package push; P5 before the Studio-slice push; P6 before the
minimal-host-slice push.

## Risk Matrix

| Area                         | Status  | Evidence                                                     |
| ---------------------------- | ------- | ------------------------------------------------------------ |
| Goal and bundle determinism  | pass    | repeated file-map and ZIP byte equality                      |
| Data/save contract           | pass    | no document/archive/project/Studio source changed            |
| Surface identity             | pass    | missing/stale/unresolved/duplicate/unknown evidence rejects  |
| Asset integrity              | pass    | missing/length/hash/undeclared/tampered paths reject         |
| Security/transient exclusion | pass    | forbidden-key scan and credential-bearing base rejection     |
| Loader transaction/cancel    | pass    | canonical scene gate, verified AssetResolver and abort tests |
| Studio integration           | pass    | service/UI tests plus success/block/cancel Chromium evidence |
| Minimal host/build/CSP       | pass    | real GLB, loader round-trip, MIME/404 and no-eval build scan |
| External tutorial timing     | pending | T045                                                         |

## Verification

- publish focused: 3 files / 26 tests passed;
- Studio focused: 5 files / 27 tests passed;
- repository: 116 files / 764 tests passed;
- hotspot Chromium: 24/24 passed, including ready, blocked and in-flight-cancel publish paths;
- M0 Chromium: 1/1 passed at 1440x900 and the 768x1024 narrow-viewport gate;
- minimal host: 2 files / 4 tests, deterministic fixture/build verifier and manual Chromium interaction passed;
- fixture: 3 exploded files, ZIP SHA-256 `f4d7f857b0e2a25affa9836a1f767f389200a6e877847eaf7877c6ce4030a33c`;
- production host: CSP header, JSON/GLB MIME, missing bundle 404, loader round-trip and 2 emitted JS no-eval scan passed;
- publish, Studio, E2E and root typecheck: passed;
- root ESLint, build, i18n, product design, topology, Prettier and diff check: passed;
- production build retains the pre-existing non-blocking Vite chunk-size warning.

Controller judgment: the publish package is acceptable now and points toward the intended Feature 008 architecture.
The Studio and embed implementation slices are acceptable: Publish reads exact current Runtime evidence, the minimal
host consumes the verified public loader/Runtime boundary, and host-only adapter/content values stay outside the bundle.
The feature is not complete until Run/host parity, formal host Chromium evidence, final Critical reverse review and T045
external timing evidence or an explicit Owner Waiver pass.
