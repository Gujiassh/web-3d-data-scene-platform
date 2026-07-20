# Critical Review: Publish And Embed

**Status**: T010-T044 PASS; external timing/waiver T045 and delivery closure T046 pending

**Date**: 2026-07-20

## Semantic Oracle

1. No bundle exists unless current document, exact Surface evidence and asset bytes belong to one accepted snapshot.
2. Publish output is deterministic and contains authored document/assets plus declarative host requirements only.
3. Loader validates canonical manifest/scene before returning and AssetResolver revalidates each declared asset.
4. SceneDocument 1.4, archive 1.0, ProjectRecord, autosave, history and existing Runtime/React signatures do not change.
5. Studio Run and the minimal host must both reach the same actual ready Runtime state; document-derived constants are
   not a substitute for Runtime evidence.

## Findings And Closure

| ID  | Severity | Finding                                                                                 | Closure                                                                                                                               |
| --- | -------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | P1       | A structurally forged ready object could call the bundle builder                        | Package-internal WeakMap token stores a private cloned accepted snapshot                                                              |
| P2  | P1       | Raw asset resolver errors could expose host URL or credential-bearing detail            | Stable missing-asset blocker omits the external error text                                                                            |
| P3  | P2       | Asset reads continued after a Legacy/unresolved hotspot already blocked output          | Annotation blockers return before any asset resolution                                                                                |
| P4  | P1       | Duplicate or unknown Surface evidence could be silently ignored                         | Both cases have explicit closed blocker codes and direct tests                                                                        |
| P5  | P1       | Global authoring shortcuts remained active while the Publish dialog was open            | Publish state now participates in the existing modal shortcut gate                                                                    |
| P6  | P1       | Vite preview returned SPA HTML 200 for missing published bundle paths                   | Minimal host rejects missing `/published/*` paths with an explicit 404                                                                |
| P7  | P1       | Initial parity test compared document-derived constants while Studio was Connecting/Bad | Test now waits for actual Studio online/ready/zero-error state, compares host Runtime evidence and requires ready-green Canvas pixels |

P1-P4 were closed before the publish-package push; P5 before the Studio-slice push; P6 before the
minimal-host-slice push; P7 during final controller acceptance.

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
| Run/host ready parity        | pass    | canonical bytes, normalized Runtime state and Canvas oracle  |
| Host interactions/layout     | pass    | desktop selection/focus/content plus mobile containment      |
| External tutorial timing     | pending | T045                                                         |

## Verification

- publish focused: 3 files / 26 tests passed;
- Studio focused: 5 files / 27 tests passed;
- final focused publish/Runtime/React/host contracts: 12 files / 88 tests passed;
- repository: 116 files / 765 tests passed;
- hotspot Chromium: 24/24 passed, including ready, blocked and in-flight-cancel publish paths;
- M0 Chromium: 1/1 passed at 1440x900 and the 768x1024 narrow-viewport gate;
- publish-host Chromium: 4/4 passed with zero captured page/console errors;
- minimal host: 2 files / 5 tests plus deterministic fixture/build verifier passed;
- fixture: 3 exploded files, ZIP SHA-256 `a769c6a4b75af84876c8f18fd9167e1eafa3cfd78968695372ecbbbabafe4ded`;
- production host: CSP header, JSON/GLB MIME, missing bundle 404, loader round-trip and 2 emitted JS no-eval scan passed;
- publish, Studio, E2E and root typecheck: passed;
- root ESLint, build, i18n, product design, topology, Prettier and diff check: passed;
- production build retains the pre-existing non-blocking Vite chunk-size warning.

Final screenshot SHA-256:

- Studio Run parity: `d45cf0a6d87f192da21e8381b2ac5789d4d22b785e081836ecca812f659f3429`;
- host parity: `026cebbb369f85e1e27102a66969d0f3c124286f64fdb0ce44b4e0659ed57cf5`;
- host content 1280x720: `a53f9052d7a5a764db15f2daad64f080385a9abace6bed4209a5468937407dfe`;
- host content 1440x900: `9a6c680122760523b10fde708615a9e364d43d7f0a5b5f85a78bcc7f1c2bf390`;
- host content 390x844: `1f8013fe5bafb43198ea2564829986e90c252bafffe0b19ccc32b848be6705dc`.

## T044 Critical Reverse Review

| Area                         | Status | Evidence                                                                                 |
| ---------------------------- | ------ | ---------------------------------------------------------------------------------------- |
| Goal alignment               | pass   | Publish, deploy and host remain the only Feature 008 workflow                            |
| User-visible flow and timing | pass   | Studio waits for real ready state; host focus/content remain immediate                   |
| Architecture boundaries      | pass   | Publish validates/distributes; Runtime owns session; host owns integration values        |
| Data/save contracts          | pass   | No document schema, archive, ProjectRecord, IndexedDB, autosave or save source changed   |
| Public API signatures        | pass   | No Runtime/React/publish signature changed; host only reads public `ViewerSnapshot`      |
| Security/transient exclusion | pass   | Bundle contains requirements/keys but no credentials, payloads or trusted-content values |
| CSP/static paths             | pass   | Exact CSP, JSON/GLB MIME and `/published/*` 404 verified against production preview      |
| Type/import integrity        | pass   | Root and direct E2E/minimal-host typechecks plus ESLint passed                           |
| Test honesty                 | pass   | P7 now fails on Connecting/Bad/orange Studio and proves actual ready state plus pixels   |
| Intended end-state           | pass   | Example remains framework-neutral and does not become a second Studio                    |

Reverse review assumed four regressions: publish mutates persistent state, host-only content enters the bundle, a missing
published path returns SPA HTML, or a document-only assertion hides non-ready Runtime state. Source-boundary diff,
forbidden-value scan, production response checks and the corrected P7 oracle respectively catch those failures.

## Delivery Ledger

- Source branch/ref: `main` at pushed SHA `8dbb7b1`.
- Repair/delivery branch: `main`; no secondary worktree or integration branch.
- Acceptance symptom/root cause: the first parity screenshot showed Studio `Connecting/Bad` and orange fallback effects;
  the test's so-called normalized snapshot was built only from SceneDocument fields and could not observe Runtime state.
- Changed scope: fixture adapter semantics, host Runtime evidence, dedicated publish-host Playwright config/spec, PNG
  decoding dependencies and five checked screenshots. No persistence or public API contract changed.
- Verification: publish-host 4/4, focused 12/88, full Vitest 116/765, all sequential repository gates, screenshot review
  and production loader/ZIP/CSP/MIME/404/no-eval checks passed.
- Commit/push: pending this acceptance slice.
- Downstream target: direct `origin/main`; no merge or cherry-pick remains after push. Feature 009 remains blocked until
  T045 and T046 close.

Controller judgment: the publish package is acceptable now and points toward the intended Feature 008 architecture.
The Studio and embed implementation slices are acceptable: Publish reads exact current Runtime evidence, the minimal
host consumes the verified public loader/Runtime boundary, and host-only adapter/content values stay outside the bundle.
T040-T044 pass. The feature is not complete until T045 records real external timing or a new explicit Owner Waiver and
T046 records the final commit/push and delivery closure.
