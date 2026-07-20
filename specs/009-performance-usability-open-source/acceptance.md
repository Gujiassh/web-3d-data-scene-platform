# Acceptance: Performance, Usability And Open-Source Release

## Evidence Rules

Every gate is `pass`, `blocked` or `waived` and carries E0-E3 evidence. A waiver closes scheduling, not the underlying
claim. Exact commands, artifacts, checksums and residual risk are recorded as tasks land.

## Gate Matrix

| Gate        | Status  | Evidence class | Current evidence or blocker                                                          |
| ----------- | ------- | -------------- | ------------------------------------------------------------------------------------ |
| Product     | pending | E1/E3          | Controller rehearsal pending; five qualifying external participants unavailable      |
| Contract    | pending | E0             | Feature 008 full suite is baseline; final 009 comparison pending                     |
| Runtime     | pending | E0/E1          | Fixed-load and disposal evidence pending                                             |
| UI          | pending | E1/E2          | Chromium baseline exists; Studio/host Firefox/WebKit and real Safari pending         |
| Performance | blocked | E2             | Required Iris Xe reference environment unavailable                                   |
| Assets      | blocked | E0/E1          | Local SHIP assets pass static batches; redistribution license and repo audit pending |
| Open source | pending | E0/E1          | Package build, public site, governance and release candidate pending                 |

## Contract Comparison

Acceptance MUST compare old/new `documentJson`, asset blobs, JSON/ZIP/archive round trips and save/recent/open metadata
semantics. Starter bootstrap is not allowed to reinterpret any persisted field.

## Durable Evidence

For each accepted task record:

- exact command and exit code;
- source and fixture hashes;
- report/screenshot path and checksum;
- browser/hardware identity where relevant;
- evidence class and gate judgment;
- residual risk, waiver text or blocking owner action.

## Final Status

Until every required E2/E3 gate passes:

> Release candidate; external production claims blocked.
