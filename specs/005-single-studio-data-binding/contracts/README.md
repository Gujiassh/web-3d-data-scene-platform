# Contract Impact

This feature introduces no new network API, public persistence schema or archive field.

The authoritative contracts remain:

- `SceneDocument 1.0.0` and its generated validator.
- Existing archive manifest and ZIP/JSON codecs.
- Existing `DataAdapter` semantics.
- Existing project repository record shape and revision/save semantics.

Legacy SceneDocument load/validation acceptance is unchanged. Canonical RFC 6901 syntax is enforced for
newly authored/configured bindings at the command and Studio form boundaries, not by tightening the
global validator for existing documents.

The user approved these backward-compatible additions to the public authoring runtime API on 2026-07-15:

- enable or disable data evaluation without rebuilding the Viewer;
- expose current binding state through a Viewer event and snapshot;
- clear runtime values, alarms and projected effects when data evaluation stops.

Read-only Viewer data evaluation remains enabled by default. No existing method, event variant or field is
removed, and no new runtime value is persisted.

The implementation may also add `DocumentCommand` variants and Studio-local typed view models. Any need
to add, remove or reshape a SceneDocument, archive or project-save field must stop for explicit product
approval and a new contract plan before code changes continue.
