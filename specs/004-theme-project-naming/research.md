# Research: Theme And Scene Naming

## Decision 1: SceneDocument Owns The Name

**Decision**: Treat `SceneDocument.name` as authoritative and mirror it into `ProjectRecord.name` after
every history transition and again at repository save.

**Rationale**: Exports already use the document name while recent-project UI uses the record name. A
single source prevents visible and persisted divergence across rename, Undo, Redo and reload.

**Alternatives considered**:

- Rename record and document in a workspace-only operation: rejected because it bypasses document
  history and makes Undo/Redo custom and fragile.
- Remove `ProjectRecord.name`: rejected because it changes the persisted record contract and requires
  parsing every document to list recent projects.

## Decision 2: Rename Is A Document Command

**Decision**: Add a `rename-document` command to the existing command union.

**Rationale**: Revision, validation, Run-mode protection, Undo and Redo are already centralized there.
Using that path makes rename indistinguishable from other authoring edits to autosave and history.

**Alternatives considered**:

- Direct state mutation in `useStudioWorkspace`: rejected because it would bypass command history.
- A separate project-metadata history: rejected as duplicate state machinery for one field.

## Decision 3: Theme Is Browser-Local Presentation State

**Decision**: Store an independent `light | dark` preference for each app and expose the active value on
the root HTML dataset.

**Rationale**: Theme does not describe a scene or factory asset. Root data state lets both application
styles switch atomically without coupling rendering/runtime packages to presentation preferences.

**Alternatives considered**:

- Store theme in SceneDocument: rejected because exports would carry user-specific UI preference.
- CSS-only `prefers-color-scheme`: rejected because users need an explicit persistent override.
- One cross-app storage key: rejected because Studio and Factory can be independently deployed and may
  need different preferences.

## Decision 4: Keep Scene Background Document-Driven

**Decision**: Theme changes host chrome only and do not rewrite `environment.background`.

**Rationale**: Scene background is authored content and may encode contrast, presentation intent or
business meaning. Rewriting it would silently mutate document semantics and revision.

## Decision 5: Reuse One Naming Dialog

**Decision**: Use one focused dialog with create/rename copy and controlled input.

**Rationale**: Validation, focus, keyboard dismissal and bilingual behavior remain consistent while
mode-specific commands stay explicit.

**Alternatives considered**:

- Inline toolbar editing: rejected because it is cramped and makes cancel/validation less discoverable.
- Browser prompt: rejected because it cannot match accessibility, localization or theme requirements.
