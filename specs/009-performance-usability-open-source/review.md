# Critical Review: Performance, Usability And Open-Source Release

## Semantic Oracles

1. Existing project bytes and save contracts do not change because a starter exists.
2. Smart-home content exercises domain-neutral assets/Targets/Bindings; it does not add smart-home schema meaning.
3. Evidence classes never upgrade through automation or waiver.
4. Unsupported renderers, engines, hardware, assets or package states fail closed.
5. Release status reflects the weakest required unresolved gate.

## Specification Review Findings

| ID  | Severity | Finding                                                      | Resolution                                                                                          |
| --- | -------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| S1  | P0       | Smart-home default expands the original release-only scope   | Closed by the Owner's explicit 2026-07-20 default smart-home requirement and delivery-plan update   |
| S2  | P1       | One source cannot have per-binding connection outages        | Closed with generic independent status values while the source remains online                       |
| S3  | P1       | Existing project byte-identity ignored open metadata         | Closed by limiting byte identity to document/assets and preserving metadata updates                 |
| S4  | P1       | Browser plan omitted Studio critical flows                   | Closed with required Studio plus host flows and viewports                                           |
| S5  | P1       | Positive memory growth was incorrectly allowed               | Closed with named series, non-positive trends and bounded forced-GC final delta                     |
| S6  | P1       | FPS/paint/size oracles were underspecified                   | Closed with one clock, render-state plus pixel proof, exact loaded bytes and renderer stats         |
| S7  | P1       | Controller rehearsal weakened E3 honesty and correction loop | Closed by renaming E1 rehearsal and adding participant/fix/retest evidence                          |
| S8  | P1       | Mutable asset facts were stale                               | Closed with exact counts, conflicting toilet verdict and source digests                             |
| S9  | P2       | Package version/dependency/license gates were incomplete     | Closed with one RC version, dependency rewrite, deterministic tarballs and third-party/font notices |
| S10 | P2       | Acceptance artifact missing                                  | Closed by adding `acceptance.md`                                                                    |
| S11 | P1       | Node-name lookup made authored names semantic identifiers    | Closed with an explicit asset-hash/semantic-target/node-index map; names only validate the mapping  |
| S12 | P1       | Stable Firefox E2 was missing from the real-browser gates    | Closed by separating stable Firefox E2 and real Safari E2 pass-or-blocker tasks                     |
| S13 | P1       | Workspace hooks owned fetch/hash/archive bootstrap mechanics | Closed by assigning the complete atomic operation to a dedicated domain-neutral bootstrap service   |

Implementation review has not started.

## Gate Matrix

| Gate        | Status  | Evidence                                                                                   |
| ----------- | ------- | ------------------------------------------------------------------------------------------ |
| Product     | pending | E1 controller rehearsal permitted; E3 participants remain independently required or waived |
| Contract    | pending | Existing full suite is baseline                                                            |
| Runtime     | pending | Existing full suite is baseline                                                            |
| UI          | pending | Chromium baseline exists; Firefox/WebKit matrix pending                                    |
| Performance | blocked | Reference Iris Xe environment unavailable                                                  |
| Assets      | blocked | Smart-home redistribution license and tracked validator report missing                     |
| Open source | pending | Packages, governance, Pages and release candidate pending                                  |

## Delivery Ledger

- Source: `main@670f8e2` after Feature 008 closure.
- Branch: `main`; no extra worktree.
- Push state: Feature 009 not yet delivered.
