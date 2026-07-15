# Data Model: Theme And Scene Naming

## Scene Name

**Authoritative field**: `SceneDocument.name`

**Index mirror**: `ProjectRecord.name`

Validation:

- Trim leading and trailing whitespace before create or rename.
- Reject an empty trimmed value.
- Honor the existing SceneDocument name maximum of 160 characters; do not introduce a new constraint.
- Persist and export the exact trimmed value.

Transitions:

```text
create dialog draft -> confirm -> new SceneDocument.name + ProjectRecord.name
current name -> rename command -> revised SceneDocument.name -> mirrored ProjectRecord.name
renamed name -> Undo -> prior SceneDocument.name -> mirrored ProjectRecord.name
prior name -> Redo -> renamed SceneDocument.name -> mirrored ProjectRecord.name
```

Invariant:

```text
activeSnapshot.record.name === activeSnapshot.document.name
persistedProject.name === parsedPersistedDocument.name
```

## Naming Intent

Transient UI state:

- `mode`: `create | rename`
- `initialName`: empty for create, active scene name for rename
- `draft`: controlled input value
- `submitting`: prevents duplicate confirmation while asynchronous creation saves

Naming intent is discarded on cancel and is never stored in the project repository or command history.

## Theme Preference

Fields:

- `theme`: `light | dark`
- `storageKey`: app-specific key
- `source`: valid saved preference, otherwise browser preference, otherwise light fallback

Persistence:

- Studio and Factory Demo use different browser-local keys.
- Invalid values are ignored.
- Storage failure preserves current-page theme switching but does not create fallback project state.

Forbidden relationships:

- No field or metadata in `SceneDocument`, `ProjectRecord`, document history, archive manifest, runtime
  snapshot, telemetry or adapter receives theme data.
