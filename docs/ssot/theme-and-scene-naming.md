# Theme And Scene Naming

> 2026-07-16 supersession：本文件关于“主题切换不得改变有效 3D 背景”的历史规则已由
> `theme-aware-scene-background.md` 修订。应用 `light | dark` 偏好仍是 presentation-only；
> SceneDocument 1.1.0 现在只持久化 `theme | custom` 背景解析策略和自定义颜色。

This document records the stable ownership and persistence rules introduced by
`specs/004-theme-project-naming`.

Feature 004's Studio/Factory theme acceptance remains a historical fact. Feature 005 superseded and
removed the Factory product surface after replacement Studio Run evidence passed. The current product
contract and browser-local preference below are Studio-only.

## Scene Name Ownership

`SceneDocument.name` is the authoritative scene name. `ProjectRecord.name` is a denormalized index
used by recent-project navigation and must mirror the active document name.

The invariant is:

```text
activeSnapshot.record.name === activeSnapshot.document.name
persistedProject.name === parsedPersistedDocument.name
```

Explicit rename is a `rename-document` command. It trims surrounding whitespace, rejects an empty
result, honors the existing SceneDocument 160-character name limit and returns the original document
for an unchanged name. A real rename uses the normal document history path, so revision, Undo, Redo,
dirty state, Run-mode protection and autosave keep their existing semantics.

Studio synchronizes the record mirror after execute, Undo and Redo. The IndexedDB repository writes the
validated document name into the project record as a final persistence-boundary guard. A completed save
callback must keep the current in-memory document name if a newer revision already exists.

No SceneDocument or ProjectRecord field was added, removed or repurposed. JSON and ZIP archive shapes
remain unchanged.

## Naming Interaction

The Project menu has two explicit entry points:

- New scene opens an empty naming dialog. Repository creation starts only after a valid confirmation.
- Rename scene opens the same dialog with the current name selected. It is disabled outside Edit mode.

Dialog draft, validation and submitting state are transient React state. Cancel, Escape and backdrop
dismissal never mutate workspace, history or repository state. Submitting the unchanged current name is
a no-op with no revision or history entry.

The first-run bootstrap workspace may still use the localized untitled default so Studio can open
without an extra onboarding step.

## Theme Ownership

Theme is the closed union `light | dark` and belongs to application presentation only.

Resolution order:

1. Valid app-specific browser-local preference.
2. Browser `prefers-color-scheme` value.
3. Light fallback.

Storage keys:

- Studio: `web3d.studio.theme`

The shared provider exposes the active theme on `document.documentElement.dataset.theme`, synchronizes
native `color-scheme`, and applies explicit changes without reload. Studio uses the icon control with
app-owned bilingual accessible labels.

Theme data must never enter:

- `SceneDocument` or `ProjectRecord`
- document command history
- JSON/ZIP archives
- Viewer/runtime snapshots
- telemetry adapters or state

`SceneDocument.environment.background` remains authored scene content. Theme switching changes host
chrome and overlays but does not rewrite the 3D scene background or increment document revision.

## Styling Contract

Shared `theme.css` owns semantic tokens for surfaces, text, borders, accents, selection, statuses,
translucent overlays, backdrops and shadows. Application styles must consume those tokens instead of
introducing light-only color literals.

Both themes must keep visible focus, readable status states and stable geometry at the Studio 1280x720
and 1440x900 breakpoints. A theme change must preserve the current Canvas element, authored document,
selection and active Run state.

## Verification

Required regression coverage:

- Unit tests for theme resolution/persistence/control accessibility and document rename/history.
- IndexedDB test proving document-name-to-record-name synchronization.
- Browser flow for cancel/invalid/valid create, rename, no-op, Undo/Redo, autosave, reload and export.
- Name-aware unit and browser evidence for stale save completion, immediate recent-list synchronization,
  long-name truncation and renamed JSON/ZIP round trips.
- Browser flow proving theme detection/persistence, same Canvas, unchanged document/selection/connection,
  nonblank Canvas pixels and no target-viewport overflow.
- Light/dark screenshot inspection for Studio Edit and Run.
