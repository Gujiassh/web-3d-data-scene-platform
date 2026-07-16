# Implementation Plan: Theme-Aware Scene Background

## Contract

The current document becomes `SceneDocument 1.1.0`:

```ts
interface SceneEnvironment {
  readonly backgroundMode: "theme" | "custom";
  readonly background: string;
  readonly grid: boolean;
  readonly unit: "mm" | "cm" | "m";
  readonly upAxis: "Y";
}
```

`background` is the authored custom color and fallback. Effective rendering is:

```text
custom -> environment.background
theme  -> transient host theme background, falling back to environment.background
```

Application theme preference remains in `web3d.studio.theme`; only the resolution strategy enters the
document.

## Migration

1. Keep an immutable 1.0.0 schema/validator alongside the current 1.1.0 schema/validator.
2. Read the raw `schemaVersion` and dispatch to the exact validator.
3. Convert a valid 1.0.0 value to 1.1.0 with `backgroundMode: "custom"`; preserve revision and all other
   values; validate the migrated result with the current validator.
4. `parseSceneDocument`, canonical JSON import and archive import return current documents only.
5. Archive import checks manifest `sceneSchemaVersion` against the raw scene version before migration.
6. IndexedDB repository initialization opens one readwrite transaction, parses/migrates every project,
   rewrites only changed `documentJson`, and commits all-or-nothing before normal repository use.
7. Export/save serialize only 1.1.0. `archiveVersion` stays 1.0.0; manifest scene version becomes 1.1.0.

No migration changes ProjectRecord fields, timestamps, lastSavedRevision, lastExportedRevision, scene
revision, assets or database version.

## Runtime Boundary

Runtime receives generic transient theme-background and optional authoring-preview inputs. Resolution
order is preview, document custom color, host theme color, then document fallback. It updates
`THREE.Scene.background` and requests render. It retains the latest inputs across an in-flight load so a
late generation cannot restore stale color. It does not know light/dark, CSS, React or Studio.

React exposes controlled presentation props and reconciles them independently from `source`. This is
required for both `theme -> custom` and `custom -> theme` dialog preview without loading a temporary
document.

## Studio Boundary

- Project menu owns the Scene settings entry.
- `scene-background/` owns draft validation, effective-color resolution, the settings dialog and its CSS.
- App reads the active theme, supplies the matching token color, controls dialog visibility/preview and
  passes the effective presentation value to React.
- Workspace remains the command/history/autosave owner and receives an ordinary
  `set-scene-background` command.
- Run mode may render a theme-mode background change but cannot apply authored settings.

## Fixed Ownership

| Lane               | Write ownership                                                                   |
| ------------------ | --------------------------------------------------------------------------------- |
| Document/migration | `packages/document/**`, SceneDocument schema/example contracts                    |
| Runtime/React      | `packages/runtime/**`, `packages/react/**`                                        |
| Studio             | `apps/studio/**`, `apps/shared/**` only when required                             |
| Main controller/QA | `specs/004a-*/**`, SSoT/roadmap, `tests/e2e/**`, integration and final acceptance |

Reviewers remain read-only. Findings return to the original implementation lane.

## Verification Oracle

- P0: old/new raw payload comparison, all-record IndexedDB rewrite, JSON/ZIP source/current version
  comparison and exact ProjectRecord keys.
- P2: same Canvas identity, no runtime restart, corner-pixel background values, dialog preview/cancel,
  command/Undo/Redo and 1280/1440 responsive evidence.
- Static: generated validators, focused package tests, root test/lint/typecheck/build/i18n/design/topology,
  format and diff checks.
