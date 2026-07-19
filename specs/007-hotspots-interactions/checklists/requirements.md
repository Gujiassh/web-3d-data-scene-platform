# Specification Quality Checklist: Hotspots And Declarative Interactions

**Purpose**: Validate product completeness and track Critical approval gates before planning or implementation
**Created**: 2026-07-17
**Feature**: [spec.md](../spec.md)
**Depth**: Critical

## Content Quality

- [x] Product specification focuses on user value and observable behavior.
- [x] Mandatory problem, user scenarios, requirements, entities and success criteria are complete.
- [x] Technical field shapes are isolated in data-model and contract artifacts.
- [x] Scope, assumptions, dependencies and exclusions are explicit.
- [x] No `[NEEDS CLARIFICATION]` marker remains; approval choices are presented as one coherent package.

## Canvas-First Interaction

- [x] CHK001 Add hotspot is a direct single-shot `H` tool, not a form or nested menu.
- [x] CHK002 Surface click creates a transient draft and adjacent one-line title editor.
- [x] CHK003 Enter commits exactly once; Escape and every authority transition cancel without mutation.
- [x] CHK004 Reposition is direct drag or compact command with transient preview and exact restore.
- [x] CHK005 Common actions use a compact popover; advanced content/behavior uses progressive disclosure.
- [x] CHK006 Coordinates, normals, hashes, node/entity/Target IDs, content keys and Action JSON stay hidden.
- [x] CHK007 Canvas/list selection is bidirectional while hotspot/entity selections remain distinct and transient.
- [x] CHK008 Hidden, locked, unresolved, occluded, invalid-hit and command-rejected states are specified.

## Keyboard, Accessibility And Motion

- [x] CHK009 Pointer and keyboard placement, rename, reposition, focus, visibility, lock, delete and activation paths exist.
- [x] CHK010 Roving list focus, focus restoration, live-region feedback and non-color-only states are explicit.
- [x] CHK011 Run removes editing affordances but keeps marker and read-only list activation parity.
- [x] CHK012 Motion timing is purposeful, drag preview is direct and reduced-motion removes decorative movement.
- [x] CHK013 Bilingual Help, tooltip, label, error, live-region and accessible-name parity is required.
- [x] CHK014 Desktop Studio and pointer-compatible Viewer scope are explicit without claiming mobile authoring.

## Data And Save Contract

- [x] CHK015 Annotation is proposed as the persisted hotspot rather than a duplicate collection.
- [x] CHK016 Surface and opaque Legacy anchors have explicit, non-heuristic meanings.
- [x] CHK017 Asset hash, node index, point/normal frames and supported/unsupported geometry are bounded.
- [x] CHK018 No Target is automatically created or guessed from a surface hit.
- [x] CHK019 Content and activation are closed, validated declarations with no scripts or host route leakage.
- [x] CHK020 Legacy Annotation migration preserves every old value and adds deterministic defaults only.
- [x] CHK021 Frozen intermediate validation, all-or-nothing IndexedDB rewrite and current-only export are explicit.
- [x] CHK022 Complete-snapshot commands, lock exceptions, cascades, stale/no-op behavior and Undo/Redo are explicit.
- [x] CHK023 Runtime-only hit, draft, hover, focus, selection, popover and action results never persist.

## Performance And Verification

- [x] CHK024 First-use completion, task time and pointer-to-preview metrics are measurable.
- [x] CHK025 The no-count-cap contract uses 200 simultaneously visible markers as a performance baseline only.
- [x] CHK026 Cancellation, project/source races, pointer capture, RAF/listener/resource cleanup are testable.
- [x] CHK027 Migration, archive, command, Runtime, React, Studio, accessibility and E2E evidence are required.
- [x] CHK028 The oversized Runtime viewport and Studio App are explicitly prevented from absorbing hotspot policy.

## Approval Readiness

- [x] CHK029 Independent Critical UX and data-contract review has completed with every finding reconciled.
- [x] CHK030 The user approved the SceneDocument 1.4 direction and no-count-cap calibration scope on 2026-07-17.
- [x] CHK031 Design calibration validated exact identity, 200 visible markers, browser paint latency, cleanup, picking,
      occlusion and real pointer input on hardware Chrome without production/schema edits; Critical re-review passed on
      2026-07-18 with no remaining findings.
- [x] CHK032 The implementation plan/tasks and calibrated complete contract received independent final review and
      explicit user implementation approval on 2026-07-18 before production/schema edits.
- [x] CHK033 The project owner explicitly approved the T044 Owner Waiver on 2026-07-19; no human evidence is fabricated,
      NFR-001/NFR-002 and SC-001/SC-002 remain unproven, and Feature 009 retains external usability testing.

## Notes

- CHK032 and CHK033 are closed. Feature 007 is complete within the approved contract and explicit waiver boundary.
- SceneDocument 1.4 is the production authority after the accepted migration and implementation.
