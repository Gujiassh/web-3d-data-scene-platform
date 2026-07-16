# Feature Specification: Theme-Aware Scene Background

**Feature ID**: `004a-theme-aware-scene-background`

**Created**: 2026-07-16

**Status**: Accepted

**Input**: The main scene background follows the Studio theme by default, can be changed in scene
settings, and persists. The user explicitly approved a SceneDocument contract upgrade and required
real stored-data migration rather than an in-memory frontend compatibility layer.

This feature supersedes only the Feature 004 rule that theme changes never affect the effective 3D
background. The `light | dark` application preference remains presentation-only and must not enter the
scene document.

## User Stories

### US1 - Follow The Studio Theme

A newly created scene uses a light background in the light theme and a dark background in the dark
theme. Switching theme updates the existing Canvas immediately without changing the document,
revision, history, selection, runtime adapter lifecycle or save state.

### US2 - Author A Custom Background

An author opens Scene settings, switches from Follow theme to Custom, previews a valid `#RRGGBB`
color, and applies the change as one undoable document command. Cancel and Escape restore the effective
background without a document mutation.

### US3 - Preserve And Exchange The Setting

Theme/custom mode and the dormant custom color survive autosave, reload, JSON export/import and ZIP
export/import. A theme-mode scene resolves against the receiving host theme; a custom scene remains the
same color in every theme.

### US4 - Migrate Existing Data

Every stored or imported `1.0.0` scene is converted to `1.1.0` with `backgroundMode: "custom"`, preserving
its original background and revision. Studio rewrites all existing IndexedDB project `documentJson`
records transactionally before normal repository use. This is a data migration, not a render-time shim.

## Requirements

- **FR-001**: The current SceneDocument schema MUST be `1.1.0` and `SceneEnvironment` MUST contain required
  `backgroundMode: "theme" | "custom"` plus the existing `background` color.
- **FR-002**: In theme mode, `background` MUST remain the last custom color and deterministic fallback;
  the resolved host theme color MUST NOT be baked into persistence.
- **FR-003**: New Studio projects MUST start in theme mode with `#F4F6F5` as the fallback/custom color.
- **FR-004**: A single canonical migration MUST validate `1.0.0`, preserve every existing field and
  revision, add `backgroundMode: "custom"`, set `schemaVersion: "1.1.0"`, then validate `1.1.0`.
- **FR-005**: Studio repository initialization MUST migrate and rewrite every existing IndexedDB project
  record before list/open/save operations complete. ProjectRecord keys, timestamps, revision fields and
  IndexedDB version MUST remain unchanged.
- **FR-006**: JSON and ZIP import MUST accept valid `1.0.0` and `1.1.0` scenes, return only current `1.1.0`
  documents, and preserve the source schema version check in archive manifests.
- **FR-007**: JSON/ZIP export and Studio save MUST emit only canonical `1.1.0` documents. Archive container
  version remains `1.0.0`; manifest `sceneSchemaVersion` MUST truthfully be `1.1.0` for new exports.
- **FR-008**: Scene settings MUST be reachable from the Project menu in Edit mode and unavailable as a
  mutation in Run mode.
- **FR-009**: The settings dialog MUST provide Follow theme and Custom modes, a native color input, a
  `#RRGGBB` text input, live preview, Apply and Cancel.
- **FR-010**: Invalid color input MUST be visibly and accessibly rejected without changing history or
  persistence.
- **FR-011**: Apply MUST execute one atomic `set-scene-background` command with complete before/after
  settings; no-op submissions MUST not change revision or history.
- **FR-012**: The command MUST support Undo/Redo and existing autosave semantics without changing
  ProjectRecord shape.
- **FR-013**: Runtime MUST accept framework-neutral transient theme and optional authoring-preview
  background inputs, resolve preview before document custom/theme/fallback, and update the existing scene
  in place. Runtime MUST not read DOM theme state or Studio CSS variables.
- **FR-014**: React MUST expose the runtime input as a controlled prop without recreating Canvas, Viewer,
  generation, controls, adapters or event subscriptions.
- **FR-015**: Theme switching in theme mode MUST update the effective background without document,
  revision, history, selection, save or Run lifecycle changes.
- **FR-016**: Theme switching in custom mode MUST not change the effective 3D background.
- **FR-017**: The dialog and all status/error copy MUST support English and Simplified Chinese, keyboard
  focus containment, Escape, focus restoration and visible focus.

## Non-Functional Requirements

- **NFR-001 (P0 migration)**: No valid stored `1.0.0` project may remain in IndexedDB after successful
  repository initialization.
- **NFR-002 (P0 contract)**: Migration is deterministic and idempotent; failed validation aborts the
  rewrite transaction without partially migrated records.
- **NFR-003 (lifecycle)**: A theme switch must reach the Canvas by the next animation frame without a
  source reload or adapter restart.
- **NFR-004 (responsive)**: Settings remain usable at 1280x720 and 1440x900 without page overflow or
  clipped controls.
- **NFR-005 (visual)**: Light/dark theme defaults and custom colors must be machine-verified from Canvas
  pixels; grid and selection remain readable in both themes.

## Acceptance

- Valid 1.0.0 raw JSON, archive and multiple IndexedDB records migrate to canonical 1.1.0.
- New theme-mode scenes follow light/dark theme with unchanged document bytes and revision.
- Custom preview cancels cleanly; Apply/Undo/Redo each produce the expected single transition.
- Custom mode persists through reload and JSON/ZIP round trips and ignores host theme changes.
- ProjectRecord has the same eight persisted keys and IndexedDB remains version 1.
- Root unit/static/build gates and full Chromium E2E pass with zero unresolved review findings.
