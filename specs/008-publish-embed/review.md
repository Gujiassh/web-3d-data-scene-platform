# Critical Review: Publish And Embed

**Status**: T010-T015 publish package PASS; Studio/embed acceptance pending

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

All four findings are closed before the first implementation push.

## Risk Matrix

| Area                         | Status  | Evidence                                                     |
| ---------------------------- | ------- | ------------------------------------------------------------ |
| Goal and bundle determinism  | pass    | repeated file-map and ZIP byte equality                      |
| Data/save contract           | pass    | no document/archive/project/Studio source changed            |
| Surface identity             | pass    | missing/stale/unresolved/duplicate/unknown evidence rejects  |
| Asset integrity              | pass    | missing/length/hash/undeclared/tampered paths reject         |
| Security/transient exclusion | pass    | forbidden-key scan and credential-bearing base rejection     |
| Loader transaction/cancel    | pass    | canonical scene gate, verified AssetResolver and abort tests |
| Studio integration           | pending | T020-T023                                                    |
| Minimal host/CSP/tutorial    | pending | T031-T045                                                    |

## Verification

- publish focused: 3 files / 26 tests passed;
- repository: 112 files / 754 tests passed;
- publish and root typecheck: passed;
- root ESLint, build, product design, topology, Prettier and diff check: passed;
- production build retains the pre-existing non-blocking Vite chunk-size warning.

Controller judgment: the publish package is acceptable now and points toward the intended Feature 008 architecture.
The feature is not complete until Studio, minimal host, CSP/tutorial, browser evidence and final Critical reverse review
pass.
