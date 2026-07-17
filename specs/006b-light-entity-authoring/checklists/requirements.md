# Specification Quality Checklist: Light Entity Authoring

**Purpose**: Critical contract, implementation and final-evidence tracking
**Created**: 2026-07-17
**Feature**: [spec.md](../spec.md)
**Depth**: Critical

## Independent Review Closure

- [x] CHK001 Is intensity explicitly unitless with physical-unit claims/selectors/conversion/candela/lumens/lux/IES excluded?
- [x] CHK002 Is every frozen migration intermediate validated structurally and semantically?
- [x] CHK003 Is complete current validation explicitly before exact light-only classification?
- [x] CHK004 Are Runtime authority, atomic publish, matching ready, full-load fallback and stale protection explicit?
- [x] CHK005 Is Edit/Run additive authoring state independent from `dataRuntimeEnabled` with synchronous drag revert?
- [x] CHK006 Is every generic mutation route listed with atomic rejection/no-redo-clear semantics?
- [x] CHK007 Are entity-parent-to-light diagnostics, unlocked Duplicate result and finite creation-frame behavior fixed?
- [x] CHK008 Are menu accessibility/focus/i18n and serial observed-event performance evidence actionable?

## Document And Migration

- [x] CHK009 Is top-level `type: "light"` distinct from nested point/spot kind?
- [x] CHK010 Are root/no-child/max-eight/range/angle/penumbra/exact-transform rules complete?
- [x] CHK011 Is a real frozen 1.2 schema/generated validator/generator/structure/validate/smoke chain required?
- [x] CHK012 Do tests inject invalid 1.1 and 1.2 intermediate outputs and stop persistence?
- [x] CHK013 Does 1.2 -> 1.3 change only schemaVersion and create zero lights?
- [x] CHK014 Are archive raw-version matching/current-only export/container 1.0.0 rules aligned?
- [x] CHK015 Is the recommended required behavior explicit: rewritten legacy export revision null, current 1.3 record byte-identical?

## Commands, Hierarchy And Branches

- [x] CHK016 Are exactly add/update/remove complete snapshots defined without changing generic guarantees?
- [x] CHK017 Are locked visibility/unlock exceptions and rejected rename/property/transform/remove exact?
- [x] CHK018 Is locked-source Duplicate allowed while the new copy is always unlocked and the source unchanged?
- [x] CHK019 Are all ten generic routes listed and required to preserve document/history/redo on rejection?
- [x] CHK020 Are light child/parent/group/reparent/layout/target exclusions explicit?
- [x] CHK021 Does the plan enumerate all 16 direct SceneEntity branch files and indirect data-binding/picker/overlay tests?

## Runtime And React

- [x] CHK022 Does invalid source reject before classification or either mutation path and retain old Runtime?
- [x] CHK023 Does light-only add/update/remove/Undo/Redo retain Canvas/generation/assets/adapters/camera/controls/fill-key?
- [x] CHK024 Are classification false, failure, stale and superseded behaviors testable?
- [x] CHK024a Is the exact same-document revision matrix defined before both fast/full paths, including no-ready behavior?
- [x] CHK024b Is a different-document lower numeric revision explicitly preserved as a valid independent project switch?
- [x] CHK025 Are Point/Spot tool gates enforced independently in Studio and Runtime before preview?
- [x] CHK026 Are Run pick/helper/proxy/overlay suppression and Edit selection restoration defined?
- [x] CHK027 Is the narrow immutable ready/finite creation-frame API transient, scale-relative and fallback-free?
- [x] CHK028 Does imported neutral replacement require post-replacement `nodesByIndex` resolution?

## UX And Evidence

- [x] CHK029 Are menu roles, Arrow/Home/End, Escape/outside close and focus transfers/restoration specified?
- [x] CHK030 Are localized disabled reasons required for Run, 8/8 and missing creation frame?
- [x] CHK031 Does Inspector own light properties and first-invalid focus outside environment draft?
- [x] CHK031a Is `Brightness` implemented as slider `[0,100]` plus exact numeric input through `1000`, without explanatory copy?
- [x] CHK031b Is creation position exactly target plus world +Y by `clamp(camera-target distance * 0.2, 0.5, 5)`?
- [x] CHK032 Is performance fixed to system Chromium, 1440x900 DPR1, acceptance profile and p95 <=33.3ms on both fixtures?
- [x] CHK033 Are first-add/shader spike, 30 observed warm-ups and 300 serially observed measured events explicit?

## Approval Readiness

- [x] CHK034 Has independent Critical review run and have its current findings been incorporated? [T001-T002]
- [x] CHK035 Has design-time calibration completed without production/schema edits, with the MeshBasic limitation recorded?
- [x] CHK036 Is Duplicate offset exactly `[1,0,0]` and copied lock state exactly false?
- [x] CHK037 Are unitless range `[0,1000]` and Point 25/Spot 10 defaults written into all seven artifacts?
- [x] CHK039 Have received final-review findings been closed and has the reviewer issued final PASS?
- [x] CHK040 Has the user explicitly approved the complete model/defaults/limits/migration/persistence/Runtime/UI plan?

## Final Production Evidence

- [x] CHK038 Do both 006 overhead and deterministic lit PBR shader-cost fixtures meet eight-light 4+4 mix warmed p95
      33.3ms with honest serial observed-event counting? This is post-approval acceptance, not visual business evidence.

## Notes

- T001-T005, CHK001-CHK008, CHK034-CHK037 are closed by this calibrated seven-file rework.
- CHK039 and CHK040 are complete; complete implementation approval was received on 2026-07-17.
- Production tasks T007-T034 and CHK038 are complete. Hardware evidence used system Chrome 150 on RTX 3090/D3D11 at
  1440x900 DPR1; mixed-eight warmed p95 was 0.20ms for 006 and 0.30ms for PBR.
