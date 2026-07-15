# Implementation Plan: Theme And Scene Naming

**Branch**: `main` | **Date**: 2026-07-15 | **Spec**: [spec.md](./spec.md)

## Summary

Add a shared, browser-local light/dark theme layer for Studio and Factory Demo. Add a Studio naming
dialog used by explicit new-scene and rename-scene flows. Scene rename becomes a first-class document
command so existing revision, history, dirty-state and autosave behavior remains authoritative.
`SceneDocument.name` is the source of truth; `ProjectRecord.name` is synchronized display metadata.

## Technical Context

**Language/Version**: TypeScript 6.0, React 19

**Primary Dependencies**: Three.js runtime wrappers, lucide-react, Vite 8

**Storage**: Existing IndexedDB project repository; browser localStorage for presentation preferences

**Testing**: Vitest 4, fake-indexeddb, Playwright 1.61

**Target Platform**: Modern desktop/tablet browsers with WebGL and IndexedDB

**Project Type**: pnpm monorepo with Studio and Factory Demo applications

**Performance Goals**: Theme application before the next paint; no Viewer/adapter reconstruction

**Constraints**: Preserve SceneDocument/project/archive schemas and save payload shape; no theme state in
project or runtime data; preserve document-controlled scene background

**Scale/Scope**: Two application shells, one shared presentation package, one document command, one
Studio create/rename workflow

## Governance Check

The repository has no `.specify/memory/constitution.md`; the active gates are existing SSoT documents,
feature specs, the product-design verifier and root quality scripts.

| Gate                    | Status | Evidence / design response                                                                                |
| ----------------------- | ------ | --------------------------------------------------------------------------------------------------------- |
| Goal alignment          | PASS   | Explicit naming removes anonymous creation; theme is scoped to host UI.                                   |
| User-visible timing     | PASS   | No project mutation before create confirmation; theme updates immediately.                                |
| Architecture boundaries | PASS   | Theme is shared presentation state; rename is a document command; dialog intent is local UI state.        |
| Data/save contracts     | PASS   | No fields added or removed; project record name mirrors document name at workspace/repository boundaries. |
| Runtime isolation       | PASS   | Viewer, adapter, scene environment and runtime snapshot APIs are unchanged.                               |
| Verification            | PASS   | Unit, IndexedDB, E2E, canvas-continuity and dual-theme visual evidence are required.                      |

## Project Structure

### Documentation

```text
specs/004-theme-project-naming/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── tasks.md
├── checklists/requirements.md
└── acceptance.md

docs/ssot/theme-and-scene-naming.md
```

### Source Code

```text
apps/shared/
├── theme.ts
├── ThemeProvider.tsx
├── ThemeSwitch.tsx
└── theme.css

apps/studio/src/
├── features/SceneNameDialog.tsx
├── workspace/useStudioWorkspace.ts
├── i18n/catalog.ts
├── App.tsx
└── styles.css

apps/factory-demo/src/
├── App.tsx
├── i18n/catalog.ts
└── styles.css

packages/document/src/commands/
├── types.ts
├── document-command.ts
└── document-command.test.ts
```

**Structure Decision**: Reuse the existing shared demo-support package for presentation preference
utilities and controls. Keep app-specific storage keys and translated labels in each app. Keep scene
name mutation in the document package and orchestration in Studio workspace/UI layers.

## Architecture

### Theme Boundary

- `Theme` is the closed union `light | dark`.
- Resolution order is valid app-specific saved preference, browser color preference, then light.
- A shared provider owns in-memory theme and synchronizes `document.documentElement.dataset.theme` plus
  browser `color-scheme`; changing it never reloads the page.
- Studio and Factory provide independent storage keys and translated accessible labels.
- Shared CSS variables describe semantic surfaces, text, borders, status colors, translucent fills and
  shadows for both themes. App styles consume tokens rather than light-only literals.
- The scene viewport background remains derived from `SceneDocument.environment.background`.

### Scene Name Boundary

- Add `rename-document` to the public `DocumentCommand` union. Execution trims input, rejects an empty
  result, increments revision and passes existing SceneDocument validation.
- The history module needs no special case: command execution, Undo and Redo already preserve monotonic
  revisions.
- Studio maps every resulting history document back into the active snapshot with
  `record.name = document.name`, preventing execute/Undo/Redo divergence.
- The repository persists `document.name` as the project record name, providing a final invariant at
  the save boundary without changing the record shape.
- Autosave remains revision-driven; rename is naturally scheduled because it increments revision.

### Naming Interaction

- A single controlled `SceneNameDialog` supports `create` and `rename` modes.
- New scene only stores temporary input until valid confirmation. Cancel, Escape and backdrop dismiss
  without touching repository or workspace state.
- Rename is prefilled with the current name. Submitting the same trimmed name closes as a no-op.
- Project menu owns entry points; `App` owns transient dialog mode; workspace owns durable operations.
- Rename is disabled outside Edit mode. Create remains available because it starts a separate project.

## Verification Strategy

- Unit: theme resolution/persistence, theme control accessibility, rename command trim/reject/history,
  new-project trim behavior and repository name invariant.
- Integration: workspace-level project snapshot synchronization through execute/Undo/Redo where
  practical; repository save/reopen equality.
- E2E: cancel/invalid/valid create; rename, Undo, Redo, autosave and reload; theme detection, toggle,
  persistence, app isolation and same-canvas/runtime-state assertions.
- Visual: Studio and Factory screenshots in light/dark at existing target viewports, overflow checks and
  canvas nonblank pixel checks.
- Full gates: `format:check`, `lint`, `typecheck`, `test`, `build`, `verify:i18n`, `verify:design`, E2E and
  `git diff --check`.

## Complexity Tracking

No governance violation or new framework is required. The new public command variant expands the
document command contract intentionally but does not alter SceneDocument or persistence schemas.
