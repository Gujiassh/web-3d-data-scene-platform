# Data Model: Single Studio Data Binding

This feature uses the existing `SceneDocument 1.0.0` types. The descriptions below constrain authoring
and runtime ownership; they do not add or reshape persisted fields.

## Selected Target Context

Derived, non-persistent Studio context:

- `entityId`: current selected scene entity ID.
- `target`: the existing `SceneTarget` whose `entityId` matches the selection.
- `support`: `supported | no-selection | no-root-target | model-node-deferred`.

Invariant:

```text
selected target identity = SceneTarget.id
selected target relation = SceneTarget.entityId === selected entity ID
```

Names, traversal order and Three.js UUIDs are never identity inputs.

## SceneTarget

Existing persistent fields used by this feature:

- `id`: stable target identity.
- `entityId`: stable imported asset-instance relation.
- `businessId?`: trimmed business identifier edited in Studio.
- `assetHash` and `nodeIndex`: preserved exactly.
- `name` and `metadata`: preserved exactly.

Validation:

- Business ID is optional for legacy/readability, but a binding workflow requires a non-empty trimmed ID.
- Accepted input has a bounded UI length and cannot contain control characters.
- An unchanged value is a no-op with no revision/history entry.

## Mock DataSource

Existing persistent fields:

- `id`: stable source identity.
- `name`: trimmed user-facing name.
- `adapter`: always `mock` in this slice.
- `staleAfterMs`: positive threshold.
- `offlineAfterMs`: positive threshold greater than `staleAfterMs`.
- `options.scenario`: known scenario registry ID.
- `options.seed?`: optional deterministic seed.
- `options.defaultSpeed?`: optional positive playback speed.

The sample payload and scheduled envelopes are code-owned scenario definitions and are not persisted.
WebSocket sources remain readable/preserved but cannot be authored by this slice.

## Sample Field

Derived, non-persistent view model:

- `pointer`: canonical RFC 6901 path.
- `label`: display form of the pointer.
- `value`: sample JSON leaf value.
- `valueType`: `string | number | boolean | null`.

Rules:

- Recursively enumerate only bindable primitive leaves.
- Escape `~` as `~0` and `/` as `~1` in each segment.
- Array positions use numeric path segments.
- Sort fields lexically by canonical pointer.

## Binding

Existing persistent fields:

- `id`: stable binding identity.
- `targetId`: selected `SceneTarget.id`.
- `sourceId`: selected Mock `DataSource.id`.
- `pointer`: selected canonical sample field pointer.
- `ruleSetId`: associated `RuleSet.id`.
- `writes`: unique effect types produced by the associated supported rules/fallback.
- `enabled`: author-controlled state.

Validation:

- All three referenced IDs exist before command acceptance.
- Pointer is valid RFC 6901 and belongs to the selected scenario sample for the guided workflow.
- `writes` is deterministic and has no duplicates.
- Existing semantic validation rejects conflicting enabled writers for a target/effect type.

## Equality Rule Row

Studio view model submitted into an existing `Rule`:

- `id`: stable rule identity.
- `priority`: explicit integer; rows are evaluated by priority descending, then ID ascending.
- `expected`: JSON primitive matching the authored field's intended type.
- `color`: valid CSS hex color persisted as a `ColorEffect`.
- `alarmEnabled`: form-only boolean derived from alarm effect presence.
- `alarmLevel`: `info | warning | critical` when enabled.
- `alarmMessage`: trimmed plain text when enabled.

Persisted condition:

```text
fact = value
operator = eq
expected = authored JSON primitive
```

Persisted effects contain one color effect and zero or one alarm effect. No scripts, HTML or template
execution is introduced.

## RuleSet

Existing persistent fields:

- `id`: stable rule-set identity.
- `name`: trimmed user-facing name.
- `rules`: ordered equality rules with explicit priorities.
- `fallback`: preserved declared effects.

Validation:

- Rule IDs are unique across the document.
- Priorities are deterministic.
- At least one supported rule is required for the guided flow.
- Invalid/unchanged submissions do not produce a revision.
- Unsupported existing operators/effects make the limited editor read-only until a future full editor;
  they are never discarded or rewritten.

## Preview Session

Transient Studio state, excluded from all persistence:

- `active`: whether Run preview is active.
- `connections`: source ID to runtime connection status.
- `values`: binding ID to current resolved JSON value and quality metadata.
- `alarms`: current runtime alarm instances.
- `diagnostics`: bounded runtime diagnostic list.
- `startedAdapterIds`: current adapter identities for lifecycle verification.

Transitions:

```text
Edit -> Run: derive adapters -> start Viewer reconciliation -> populate preview snapshot
Run -> Run event: reduce transient snapshot -> update host UI and Canvas projection
Run -> Edit: remove/stop adapters -> clear transient snapshot
```

Forbidden relationships:

- Preview state cannot dispatch a `DocumentCommand`.
- Preview state cannot enter `ProjectRecord`, IndexedDB document content, JSON/ZIP archives or autosave.
- Locale and theme changes cannot recreate the preview session, Viewer or adapters.

## Document Command Transitions

```text
valid form draft -> build command with stable IDs -> execute + semantic validation
  -> revision +1 -> one history entry -> autosave

invalid form draft -> validation error -> no command -> no history/revision/save change

unchanged form draft -> no-op -> no history/revision/save change
```

Removal commands maintain references atomically: removing a source removes its dependent bindings and
only rule sets that become unreferenced; removing a binding removes its rule set only when no other
binding references it and never deletes a target or source.
