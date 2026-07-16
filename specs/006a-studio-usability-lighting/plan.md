# Implementation Plan: Studio Usability And Scene Lighting

**Branch**: `main` | **Date**: 2026-07-16 | **Spec**: [spec.md](./spec.md)

## Summary

Deliver Feature 006A as three ordered slices on the accepted Feature 006 foundation. 006A.1 fixes the
transform command boundary and makes existing commands discoverable through one shortcut registry, Help,
degree input and atomic reset. 006A.2 adds deterministic primary-entity Smart Align with transient guides
and a local preference. 006A.3 upgrades SceneDocument to 1.2.0, performs real transactional migration and
adds a scene-wide fill/key rig reconciled in place in Edit, Run and Viewer.

## Technical Context

**Language/Version**: TypeScript 6.0, React 19

**Primary Dependencies**: Three.js 0.185, `@web3d/document`, `@web3d/runtime`, `@web3d/react`, Vite 8,
lucide-react

**Storage**: Existing IndexedDB DB version/store topology and archive container; current SceneDocument
changes from 1.1.0 to 1.2.0 through an approved real record rewrite

**Testing**: Vitest 4, fake-indexeddb, Playwright 1.61 with real WebGL, pixel evidence and machine-parsed
JSON/ZIP/IndexedDB payloads

**Target Platform**: Node.js 22.12+ tooling and modern desktop Chromium; keyboard labels adapt to macOS
versus Windows/Linux conventions

**Performance Goal**: Smart-align preview and guides update in the same requested visual frame; the fixed
500-bounded-entity planner benchmark p95 remains below 4 ms over 200 warmed runs on the acceptance runner

**Constraints**: one Studio; no modeling, arbitrary lights, shadows, HDRI, shortcut rebinding, equal-gap
live guides or semantic connector inference; every authored action is atomic and undoable; transient
shortcut/snap/guide/preview state never enters project payloads

**Scale/Scope**: 500 loaded bounded entities for planner evidence; one primary interactive transform; one
scene-wide hemisphere fill and directional key light

## Governance Check

The repository has no `.specify/memory/constitution.md`. Active governance comes from the product SSoT,
the approved spec, workspace contract-change approval and risk-based review protocol.

| Gate                    | Pre-design | Post-design response                                                                                                       |
| ----------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------- |
| Goal alignment          | PASS       | Improves the single Studio authoring workflow without becoming a DCC or game engine.                                       |
| User-visible sequence   | PASS       | Discover commands, reset precisely, align visually, then author appearance in one settings surface.                        |
| Architecture boundaries | PASS       | Document owns mutations/migration; Runtime owns live geometry/lights; React bridges; Studio owns presentation/preferences. |
| Data/save contracts     | PASS       | User approved required 1.2 lighting; migration and unchanged ProjectRecord/archive boundaries are explicit.                |
| Determinism             | PASS       | Exact shortcut chords, reset snapshots, snap tuple and concrete light values are machine-testable.                         |
| Runtime isolation       | PASS       | Tool/help/smart-align/guide/preview state is transient and payload-scanned.                                                |
| Accessibility/i18n      | PASS       | Canonical commands drive bilingual Help, tooltips and accessible labels.                                                   |
| Evolution               | PASS       | Three ordered slices and extracted controllers avoid further growth of Viewer/workspace/Inspector responsibilities.        |
| Verification            | PASS       | Unit, integration, P0 migration, real-WebGL, pixels, responsive and lifecycle evidence are required.                       |

## Approved Contract Oracle

- Freeze 1.0 and 1.1 schemas, generated validators and semantic validation entry points for migration.
- Current `SceneDocument` and validator accept only 1.2.0 with required `environment.lighting`.
- Parse validates the declared legacy version before migrating and validates current 1.2 after migrating.
- IndexedDB initialization rewrites every changed record in one readwrite transaction; any invalid record
  aborts all writes. DB version, stores, ProjectRecord eight-key shape, timestamps and revisions do not
  otherwise change.
- Archive container remains 1.0.0. Manifest truthfully accepts 1.0/1.1/1.2 scene schema versions at import;
  export emits 1.2 only.
- Editor preference storage may contain only presentation preferences such as Smart Align enabled. It is
  not imported, exported, autosaved or surfaced in public Runtime contracts.

## Architecture

### 006A.1 Command And Discoverability

`packages/document` strengthens shared transform validation before any new UI is exposed. Single and
batch transform commands validate finite position/quaternion/scale, normalized non-zero quaternion and
positive scale, compare complete before snapshots, and return the original document on exact no-op.

Studio introduces a canonical command registry separate from keyboard event resolution. Each command owns
stable ID, category, mutation gate, exact platform chord descriptors and localized label key. Tooltips and
the Help dialog read this registry, preventing copy drift. `App` retains orchestration but delegates modal
priority, active-drag gates and shortcut resolution to focused session modules.

Transform form math lives outside `EntityInspector`: intrinsic local XYZ degrees convert to/from normalized
quaternion at the UI boundary. One transform editor component owns authoritative drafts and reset icons.
Reset planners create one existing single/batch transform command, preserve untouched TRS byte-exactly and
reject stale, hidden, locked or mixed-invalid selections atomically.

### 006A.2 Smart Alignment

Studio/runtime share pure candidate types and oracle math without putting business decisions in React.
Runtime owns camera projection, live loaded bounds, active TransformControls axis/modifier state, preview
application and guide rendering. A dedicated smart-align planner indexes eligible revision-bound bounds
and chooses at most one candidate per active axis using the approved tuple.

TransformControls requires a narrow additive integration seam: begin/preview/end events expose the active
axis set and bypass modifier; Runtime applies the snap delta before emitting the existing transform preview
and final commit. Smart Align does not add a second document command. A dedicated disposable guide overlay
owns line/marker geometry and clears on every accepted lifecycle path.

React forwards additive authoring settings without recreating Viewer. Studio owns a small local preference
adapter keyed by one versioned preference key; invalid preference data is rejected rather than migrated
through compatibility chains.

### 006A.3 Scene Appearance

`packages/document` adds frozen 1.1 artifacts, the 1.2 schema/type/semantic validator, chained migration and
one `set-scene-environment` command covering background, grid and concrete lighting values. Light presets
remain Studio constants, never document enums.

Runtime extracts a `SceneLightingController` from `ThreeSceneViewport`. It creates exactly one hemisphere
fill and one directional key, normalizes `directionToLight`, targets scene origin and updates colors,
intensities and direction in place. Preview has explicit precedence over authored lighting and releases
using the same revision-aware rules as background preview. Loading a source reconciles authored lighting;
settings changes never trigger a generation rebuild or camera reset.

Asset inspection reports glTF `KHR_lights_punctual` presence. The asset loader excludes imported punctual
lights from the runtime generation so they cannot silently double-light the scene; diagnostics use asset
identity, never guessed node names.

Studio evolves Scene settings into flat Appearance and Lighting tabs. The dialog owns a local draft and
live preview; Apply emits one environment command and Cancel clears preview. Run is read-only. Presets,
direction choices and color/intensity controls are bilingual and keyboard accessible.

## Module Boundaries

| Layer                        | Owns                                                                    | Does not own                       |
| ---------------------------- | ----------------------------------------------------------------------- | ---------------------------------- |
| `packages/document`          | TRS/environment validation, commands, schema, migration                 | DOM, camera, Object3D, preferences |
| `packages/runtime`           | loaded bounds, camera threshold, transform preview, guide/light objects | localized copy, IndexedDB projects |
| `packages/react`             | stable controlled props/imperative forwarding                           | candidate policy, persistence      |
| `apps/studio/session`        | command registry, exact chord resolution, modal/drag gates              | Three.js objects                   |
| `apps/studio/transform`      | Euler projection, drafts, reset planners/UI                             | document validation bypasses       |
| `apps/studio/smart-align`    | preference and Studio orchestration                                     | guide geometry lifecycle           |
| `apps/studio/scene-settings` | draft/preset/UI/apply orchestration                                     | Runtime source rebuilding          |
| `apps/studio/project`        | transactional project migration invocation                              | scene semantic defaults            |

`ThreeSceneViewport` and `useStudioWorkspace` already exceed comfortable single-responsibility size. 006A
must extract lighting, smart-align and shortcut/transform logic rather than adding concrete feature rules to
those files. `EntityInspector` remains a composition surface.

## Verification Strategy

### 006A.1

- Document unit tests cover invalid finite/scale/quaternion input, stale before, exact no-op, atomic batch,
  history/redo preservation and revision counts.
- Studio unit tests cover all exact chords, modal/text/drag/Run gates, platform labels, registry/help parity,
  intrinsic XYZ round trip and single/multi reset preservation.
- E2E covers tooltip discovery, Help search/focus, keyboard tool selection, Euler edit, all reset commands,
  invalid draft recovery, Undo/Redo and zero payload leakage.

### 006A.2

- Pure oracle tests cover threshold conversion, reference exclusions, every relation rank, hierarchy/ID
  ties, axis/plane/free handles, origin precedence and invalid camera depth.
- Runtime tests cover one preview/commit, Alt bypass, fixed-step fallback, guide disposal and Viewer identity.
- Benchmark uses 500 fixed entities, 200 warmed planner runs and records median/p95/max; p95 gate is 4 ms.
- Real-WebGL E2E checks X/Y/Z and plane drags, visible guide pixels, preference reload and lifecycle cleanup.

### 006A.3

- Contract tests compare frozen 1.0, frozen 1.1 and current 1.2 schemas/validators and all parse paths.
- fake-indexeddb tests prove all-valid rewrite and mixed-invalid full rollback with exact record snapshots.
- Runtime tests prove migrated first-frame parity, in-place preview/apply/cancel/undo and one fill/key pair.
- Archive/JSON/E2E payload tests prove current-only output, field preservation and no transient leakage.
- Real-WebGL screenshot/pixel checks cover all presets, directions, themes, Edit/Run and Viewer identity.

## Delivery And Review

Each slice follows implementation -> focused verification -> independent review -> original-worker rework
-> full gates -> checkpoint. 006A.2 does not start until 006A.1 is accepted; 006A.3 does not start until
006A.2 is accepted. One coherent Chinese commit may close each accepted slice; push follows the user's
existing project preference after the complete approved feature or an explicitly requested checkpoint.
