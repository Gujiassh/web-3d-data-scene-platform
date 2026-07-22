# Critical Review: Performance, Usability And Open-Source Release

## Verdict

No open implementation P0-P2 finding remains at `a0222c8c9a05b2495303e7e37ea68624dcf39320`. The current structure points
toward the intended domain-neutral release architecture. The release itself remains blocked by external evidence,
license and publication gates; those blockers are not implementation findings and are not waived into passes.

## Semantic Oracles

1. Existing project bytes and save contracts do not change because a starter exists.
2. Smart-home content exercises domain-neutral assets/Targets/Bindings; it does not add smart-home schema meaning.
3. Evidence classes never upgrade through automation or waiver.
4. Unsupported renderers, engines, hardware, assets or package states fail closed.
5. Release status reflects the weakest required unresolved gate.

## Review Areas

| Area                    | Judgment                    | Evidence                                                                                                                                                 |
| ----------------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Goal alignment          | pass                        | Clean-profile local smart home, fixed benchmark, browser matrix, packages and governance match Feature 009; public claims stay blocked.                  |
| User-visible flow       | pass                        | Existing projects bypass starter loading; clean profile is atomic; explicit New Scene stays empty; Retry clears stale failure diagnostics.               |
| Architecture boundaries | pass                        | `starter-bootstrap` owns fetch/hash/archive; `initializeRepository` owns empty-repository authority/persist; smart-home semantics remain generator-only. |
| Data/save contracts     | pass                        | No SceneDocument, ProjectRecord, archive or save-payload shape changed; full migration/round-trip tests pass.                                            |
| Runtime lifecycle       | pass                        | Benchmark resource ownership is explicit; 22 disposal probes reach zero; capture arrays are cleared before the memory stage.                             |
| Browser behavior        | pass with external blockers | E1 matrix and Canvas/state evidence pass where supported; WebKit Blob storage, stable Firefox E2 and Safari E2 remain exact blockers.                    |
| Asset/provenance        | pass with release blocker   | Tracked assets pass; 38 owner assets remain local; smart toilet/downlight fail closed; public license is absent.                                         |
| Tests and evolution     | pass                        | 787 unit tests, deterministic one-worker E2E, package consumers, docs/assets and generator gates pass.                                                   |

## Findings Closed

| ID  | Severity | Finding                                                                              | Resolution                                                                                                                       |
| --- | -------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| S1  | P0       | Smart-home default expanded release-only scope                                       | Owner explicitly approved the default reference scene; persisted/domain contracts remain unchanged.                              |
| S2  | P1       | One source cannot represent per-binding connection outages                           | Generic independent status values model application-level offline while the source stays online.                                 |
| S3  | P1       | Existing-project byte identity ignored open metadata                                 | Document/assets stay byte-identical while normal last-opened/recent metadata continues updating.                                 |
| S4  | P1       | Browser plan omitted Studio critical flows                                           | Shared Studio plus published-host flows cover three viewports and preserve engine identity.                                      |
| S5  | P1       | Positive memory growth had been allowed                                              | Non-positive named-series gates and bounded heap final delta are enforced; current positive heap slope remains blocked.          |
| S6  | P1       | FPS/paint/size oracles were underspecified                                           | One clock, Canvas-visible proof, exact loaded hashes/bytes and renderer stats are recorded.                                      |
| S7  | P1       | Controller rehearsal risked masquerading as E3                                       | It is labeled E1; external participants are Owner-Waived with no usability claim.                                                |
| S8  | P1       | Mutable asset facts became stale                                                     | Registry/status/floorplan hashes and exact manifest set fail closed; new `NO-SHIP` downlight is hash-bound and excluded.         |
| S9  | P2       | Package version/dependency/license gates were incomplete                             | One RC version, dependency rewrite, deterministic tarballs, notices and clean consumers pass.                                    |
| S10 | P2       | Acceptance artifact was missing                                                      | `acceptance.md` now covers every FR/NFR/SC and release gate.                                                                     |
| S11 | P1       | Node-name lookup made authored names semantic IDs                                    | Fixed `assetHash + semanticTargetId -> nodeIndex`; names only assert the mapped node.                                            |
| S12 | P1       | Stable Firefox E2 was absent                                                         | Stable Firefox and real Safari are separate explicit E2 blockers.                                                                |
| S13 | P1       | Workspace hook owned bootstrap domain mechanics                                      | Dedicated bootstrap and repository-initialization modules now own the operation.                                                 |
| I1  | P1       | Benchmark retained unbounded performance events into memory sampling                 | Capture is stopped and arrays are cleared; 100,000 post-stop records stay at zero.                                               |
| I2  | P1       | E2E schema assertions still expected 1.3 and Canvas corner averages sampled overlays | Current assertions use 1.4; a repeated border-color oracle rejects overlay/status contamination without weakening RGB tolerance. |
| I3  | P1       | Default 10-worker E2E entry reproduced revision timing failures                      | Standard `pnpm test:e2e` now fixes `--workers=1`; 65-test deterministic run passes.                                              |
| I4  | P1       | Newly materialized recessed-downlight manifest invalidated the frozen source set     | Asset remains excluded at exact hash while `IN_PROGRESS`, `NO-SHIP`, validator-error and Three.js-fail states persist.           |

## Reverse Review

Assume a production claim was made incorrectly:

- The gate matrix would catch missing E2/E3 because evidence classes are explicit and final status follows the weakest gate.
- Public generation would catch missing redistribution authorization before writing under the repository.
- The benchmark would catch SwiftShader, fixture drift, incomplete loaded hashes, positive memory slope or nonzero disposal.
- Browser identity and the IndexedDB Blob probe would catch WebKit/Safari relabeling or unsupported Studio persistence.
- Package and asset audits would catch workspace-only exports, missing notices, unknown tracked bytes or validator drift.

## Delivery Ledger

- Source: `main@670f8e25d980f9efd3c064b2e66a51ee9a7cdd63` after Feature 008 closure.
- Specification baseline: `c83cc9384a765354e7982ec9c4b901cf6928027a`.
- Implementation: `main@a0222c8c9a05b2495303e7e37ea68624dcf39320`.
- Worktree: `/home/cc/code1/web-3d-data-scene-platform`; no extra worktree.
- Push state: source push explicitly authorized and completed to `origin/main` through `9839fe7`; public deployment,
  GitHub Release, npm and Pages remain unauthorized and blocked by T010/T045.
- CI follow-up: push run `29887006267` passed install, format, lint, typecheck, unit, build, docs, i18n, assets and
  topology, then exposed that `ubuntu-latest` did not provide the verifier's required `rg` command. The workflow now
  installs `ripgrep` explicitly. Follow-up run `29887169507` passed the design gate and exposed that a fresh pnpm cache
  lacks registry metadata for a separately generated consumer project. The consumer install now prefers cached packages
  but may fetch missing metadata, and its local tarball overrides use pnpm 10's supported root `pnpm-workspace.yaml`
  configuration. Exact dependency pins and deterministic pack checks are unchanged. Run `29887898340` then passed the
  package gate and exposed one test-only `/home/cc/tmp` `mkdtemp` call; license-record fixtures now use the platform
  temporary directory while the production local-output policy remains fixed and unchanged.
- A concurrent local owner-source rerun found `recessed_downlight` had advanced from frozen hash `2b538d...` to
  `01723e...` while still `IN_PROGRESS` and `NO-SHIP`. The seven repository-only smart-home tests pass and both mutable
  source integrations fail closed; the frozen exclusion and public starter remain unchanged until a new acceptance slice.
- Final CI run `29888155657` passes every repository gate on `9839fe7`; the remaining blockers are external release gates,
  not implementation or CI failures.
- Downstream: public Pages/Release/npm work is blocked by T010/T045 and must start from an explicitly authorized later commit.
