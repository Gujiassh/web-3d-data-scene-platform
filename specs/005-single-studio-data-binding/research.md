# Research: Single Studio Data Binding

## Decision 1: One Studio Is The Product Surface

**Decision**: Retire the independent Factory Demo and make Edit and Run modes of Studio the complete
product workflow.

**Rationale**: The separate application suggests two products and hides the platform's actual value.
Studio can prove authoring and runtime behavior without coupling the core to a factory-specific host.

**Alternatives considered**:

- Keep Factory as a second product: rejected because it preserves the confusing two-port workflow.
- Embed the full Factory dashboard inside Studio: rejected because domain UI would become product scope.
- Delete Factory immediately: rejected until its generic adapter/rule/alarm/WebGL evidence is migrated.

## Decision 2: Reuse SceneDocument 1.0.0 Without Migration

**Decision**: Author the existing `SceneTarget`, `DataSource`, `Binding` and `RuleSet` structures and add
document command variants for their mutations.

**Rationale**: The accepted schema already models the required workflow. A schema change would create
migration and archive risk without adding user value.

**Alternatives considered**:

- Add editor-specific configuration fields: rejected because UI state does not belong in the document.
- Store a combined mapping record: rejected because it changes IDs, references and archive semantics.
- Mutate arrays directly in Studio: rejected because it bypasses revision, validation and Undo/Redo.

## Decision 3: Limit First Target Authoring To Imported Asset Roots

**Decision**: Resolve the selected imported asset entity to its existing target by stable `entityId`.

**Rationale**: M1 already creates one root target per imported asset instance. This supports a complete
business mapping slice without introducing model-node picking and target creation UX.

**Alternatives considered**:

- Bind any glTF node now: rejected because surface/node target authoring is a separate interaction and
  layout problem.
- Derive target from entity name or tree order: rejected because neither is stable identity.

## Decision 4: Use A Deterministic Mock Scenario Registry

**Decision**: Map persisted Mock `scenario` IDs to code-owned sample payloads and adapter step factories.

**Rationale**: Existing source fields describe a scenario but intentionally do not persist runtime
envelopes. A registry keeps runtime construction deterministic without changing the data source contract.

**Alternatives considered**:

- Persist arbitrary scenario JSON: rejected because it reshapes the document and can leak runtime data.
- Reuse `apps/shared/m0.ts`: rejected because it hardcodes factory domain content and product topology.
- Build steps from whichever live payload appears: rejected because field lists and tests become unstable.

## Decision 5: Enumerate RFC 6901 Leaf Pointers

**Decision**: Recursively enumerate sample payload leaves, escape `~` and `/` per RFC 6901, and sort
lexically by pointer.

**Rationale**: Users select unambiguous stable paths while the runtime continues to use its existing JSON
Pointer resolver.

**Alternatives considered**:

- Dot paths: rejected because keys containing dots are ambiguous and runtime semantics use JSON Pointer.
- Free text only: rejected because it is error-prone for the primary workflow.
- Object-key insertion order: rejected because order can vary by source construction.

## Decision 6: Submit Mapping Changes Atomically

**Decision**: Each accepted authoring form builds one document command that replaces the complete target,
source, binding or rule set record addressed by ID.

**Rationale**: Atomic submission prevents partial history entries and lets whole-document validation prove
reference and writer invariants before state changes.

**Alternatives considered**:

- One command per field keystroke: rejected because history and autosave become noisy and partial forms
  can temporarily invalidate references.
- One broad workspace transaction containing all arrays: rejected because ownership and review scope
  become opaque.

## Decision 7: Keep Run State In A Dedicated Host Snapshot

**Decision**: Derive a transient Studio preview state from Viewer events and runtime value observation;
clear it when Run ends.

**Rationale**: Connection, current values, alarms and diagnostics are runtime facts. Separating them from
the document preserves deterministic exports and Undo/Redo.

**Alternatives considered**:

- Mirror current values into target metadata: rejected because runtime data would pollute persistence.
- Read only from the Canvas: rejected because host status and diagnostics need typed accessible UI.
- Recreate the Viewer on every event: rejected because it violates lifecycle and performance constraints.

## Decision 8: Preserve Unsupported Existing Rule Content

**Decision**: The equality/color/alarm editor handles only its supported subset. Existing documents with
other operators or effects remain valid and unchanged; the panel reports that they are outside this
editor rather than coercing them.

**Rationale**: The schema is broader than this first UI slice. Silent normalization would change document
meaning and break round-trip guarantees.

## Decision 9: Preserve The M0 Asset As A Test Fixture

**Decision**: Move the existing asset, source files, manifest and license unchanged under
`tests/fixtures/m0-factory` and remove Studio's production `publicDir` mapping to it.

**Rationale**: The fixed GLB hash and node mapping are valuable archive/runtime oracles, while the asset no
longer represents a separate product surface.

**Alternatives considered**:

- Delete the asset: rejected because it removes real GLB and archive evidence.
- Regenerate or rename all fixture internals: rejected because it creates unrelated hash/snapshot churn.
