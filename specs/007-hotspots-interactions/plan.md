# Implementation Plan: Hotspots And Declarative Interactions

**Date**: 2026-07-18

**Status**: Calibrated plan approved for implementation on 2026-07-18

**Spec**: [spec.md](spec.md)

**Technical design**: [technical-design.md](technical-design.md)

## Summary

Feature 007 upgrades the existing Annotation concept into Canvas-authored hotspots with exact rigid-surface anchors,
accessible markers, a separate Hotspots list and four safe declarative actions. Existing annotations migrate to opaque
Legacy anchors without coordinate guesses. There is no product count cap, frontend-only compatibility path, script
action or automatic Target creation.

Direction approval, non-production calibration, Critical closure and explicit implementation approval are complete.
SceneDocument 1.3 remains production authority until the approved migration is implemented and accepted.

## Gates

1. Product direction and data/save proposal review: complete 2026-07-17.
2. Non-production marker/input/occlusion calibration: complete 2026-07-18.
3. Same-session Critical calibration re-review: complete 2026-07-18; CHK031 closed.
4. User approval of calibrated contract, technical design, plan and tasks: complete 2026-07-18; CHK032 closed.
5. Production implementation: authorized in the approved delivery order.
6. Production-path reverse Critical review and user-visible acceptance: required before feature completion.

## Delivery Order

### Phase A: Current Contract And Migration

Implement frozen 1.3 validation, proposed 1.4 structure/semantics, exact migration, commands, cascades, archive handling
and all-record IndexedDB rewrite as one contract slice. No UI or Runtime compatibility branch may precede it.

Exit: current-only 1.4 production data, every supported legacy path migrates transactionally, and invalid input/write
leaves all records unchanged.

### Phase B: Runtime Resolution And Overlay

Implement dedicated surface index, dynamic InstancedMesh overlay, DOM proxies, opaque occlusion and marker picking.
Keep viewport changes to lifecycle/forwarding. Do not add hotspot policy to the current oversized viewport.

Exit: exact 1.4 Surface anchors resolve, unresolved/hidden/occluded markers cannot activate, resources dispose, and the
fixed 200-marker production path meets calibrated unit/integration gates.

### Phase C: Transient Authoring And React

Implement placement/reposition session state, pointer/reticle paths, stale evidence rejection, cancellation handshake
and narrow React forwarding.

Exit: active-only surface raycasts, latest valid hit preview, byte-identical cancel/reject, and synchronous Run/source/
project cleanup.

### Phase D: Studio Direct Manipulation

Add the `H` toolbar command, adjacent title editor, direct marker selection, compact popover and synchronized Hotspots
list. Add one progressive Hotspot Inspector for content/action settings. Keep technical IDs/coordinates absent.

Exit: pointer and keyboard flows create/manage hotspots with one command per accepted intent and deterministic focus.

### Phase E: Run Activation

Implement show-content, focus-hotspot, focus-target and HTTPS link interpretation plus Viewer events and read-only list
parity. No Run path may call a mutation command.

Exit: marker, DOM proxy and list activation execute once and emit the same bounded Annotation ID evidence.

### Phase F: Acceptance And Evolution Gate

Run full document/persistence tests, production-path 200-marker calibration, bilingual/reduced-motion E2E, the five-user
usability protocol or an explicit owner risk decision, and independent Critical reverse review. Update SSoT and prepare
Feature 008 handoff.

Exit: every FR/NFR/SC has evidence or an explicit blocked/waived decision; no temporary compatibility or hidden contract
drift remains. The 2026-07-19 Owner Waiver leaves NFR-001/NFR-002 and SC-001/SC-002 unproven for Feature 009 to test.

## Ownership Boundaries

| Layer                      | Owns                                                                | Must not own                          |
| -------------------------- | ------------------------------------------------------------------- | ------------------------------------- |
| Document                   | 1.4 types, validation, migration, commands, history and archive     | Three objects, DOM, selection         |
| Repository                 | transactional ProjectRecord migration and canonical persistence     | render-time legacy adapters           |
| Runtime surface/overlay    | exact geometry resolution, markers, occlusion, DOM proxies, picking | command/history or localized UI       |
| Runtime interaction/action | sessions, preview hits, activation interpretation and events        | Studio editors or host routes         |
| Viewport                   | authority ordering, render scheduling, controller lifecycle         | hotspot domain policy                 |
| React                      | stable controlled forwarding                                        | persisted meaning or defaults         |
| Studio                     | commands, list/editor/popover/Inspector, focus and i18n             | raycast geometry or Runtime resources |

## Risk Controls

- **Persistence corruption**: frozen validator per hop, all-record transaction, payload before/after oracle.
- **Anchor drift**: exact hash/node/local frames, rigid-only placement and no heuristics.
- **Viewport growth**: dedicated controllers and thin forwarding; no mixed hotspot policy in viewport.
- **Canvas-only accessibility**: one DOM proxy per marker plus list parity and roving focus.
- **Render degradation**: dynamic one-batch rendering, active/change-driven raycasts and fixed hardware gate.
- **Action escape**: closed action union, HTTPS revalidation and no scripts/routes/callback persistence.
- **Interaction races**: session ID, synchronous invalidation/acknowledgment and stale callback rejection.

## Verification Sequence

1. Document unit/standalone validator/command/migration tests.
2. Repository IndexedDB transaction and JSON/ZIP round-trip tests.
3. Runtime surface, overlay, session, action and disposal unit/integration tests.
4. React StrictMode lifecycle and controlled authority tests.
5. Studio component/i18n/keyboard tests.
6. Sequential Chromium/WebGL E2E after validator-generating commands finish.
7. RTX 3090 production-path calibration with exact artifact/hash gates.
8. Independent Critical reverse review and SSoT/spec completion audit.

## Stop Conditions

Stop and return for approval if implementation would change ProjectRecord shape, database version/store, archive
container, approved anchor frames, action set, count-cap policy, migration save semantics or transparent-occlusion
policy. Stop if production work would require a Runtime legacy branch, heuristic remap, automatic Target or script path.
