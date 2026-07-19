# SceneDocument Contract

> Status: MVP v1 design
> Machine-readable schema: `scene-document.schema.json`
> Current version: `1.4.0`; immutable legacy schemas: `scene-document-1.0.schema.json`,
> `scene-document-1.1.schema.json`, `scene-document-1.2.schema.json` and
> `scene-document-1.3.schema.json`

## Purpose

SceneDocument is a domain-neutral, serializable description of authored scene state. It is not a
Three.js scene dump and does not contain live telemetry, credentials, editor layout, current
selection, runtime alarms, or host application state.

## Identity

- Every persisted object has a stable document-scoped ID.
- IDs are explicit and never derived from array order, display name, or Three.js UUID.
- Display names are mutable and never used as references.
- Assets are immutable and identified by SHA-256 content hash.
- glTF nodes are addressed by global node index within the exact hashed asset version.

## Entity Model

- `group`: authored hierarchy without a model asset.
- `asset`: one scene instance of an imported GLB/GLTF asset.
- `light`: one root Point or Spot light with unitless authored intensity and no children.
- `target`: a selectable and bindable business target under an entity. A target may represent the
  whole entity or one glTF node from that asset instance.

Bindings reference targets, not renderer objects. Runtime adapters resolve target IDs to current
Object3D or InstancedMesh instance IDs.

## Document Sections

| Section       | Responsibility                                     |
| ------------- | -------------------------------------------------- |
| `assets`      | Immutable model references and content integrity   |
| `entities`    | Authored scene hierarchy and transforms            |
| `targets`     | Stable selection/data-binding targets              |
| `dataSources` | Logical adapter declarations without credentials   |
| `bindings`    | JSON Pointer to target/rule-set mapping            |
| `ruleSets`    | Declarative condition/effect mappings              |
| `annotations` | Authored hotspots with anchors, content and action |
| `views`       | Named camera bookmarks                             |
| `environment` | Scene-level rendering configuration                |

`environment.backgroundMode` is `theme | custom`. Theme mode resolves against a transient host
presentation color and keeps `environment.background` as the dormant custom color/fallback. Custom
mode always renders `environment.background`.

`environment.lighting` stores one concrete hemisphere fill and directional key rig. Environment colors
are canonical uppercase `#RRGGBB`, intensities are finite values in `[0, 5]`, and `directionToLight` is a finite
unit vector within `1e-6`. Preset names and editor previews are not persisted.

## Persistence Rules

- Arrays do not imply business priority unless a field explicitly says so.
- Rule ordering uses `priority`, then rule ID.
- The serializer sorts top-level arrays by ID before hashing/export to produce deterministic output.
- Unknown fields are rejected in MVP rather than silently ignored.
- `schemaVersion` uses semantic versioning. Major changes require explicit migration or rejection.
- Valid 1.0.0 documents migrate deterministically through every frozen intermediate validator. Valid
  1.1.0 documents add the approved Standard concrete environment lighting values; valid 1.2.0
  documents change only `schemaVersion`. The 1.3 -> 1.4 step maps each legacy Annotation to the
  approved opaque Legacy anchor, Host content reference and Show content action. Every path finishes
  as a validated 1.4.0 document without
  changing revision or other authored fields. Persisted stores and exports write only current data.
- Runtime values are never written back by Viewer.

## Asset Replacement

Replacing an asset creates a new asset hash. Studio compares old and new node manifests and asks
the author to remap affected targets. It must not infer meaning from node name, nearest transform,
mesh order, or first available node.

## Validation Layers

1. JSON parse.
2. JSON Schema validation.
3. Reference and hierarchy validation.
4. Asset hash and glTF node validation.
5. Binding conflict and rule determinism validation.

Only a document passing all required layers can replace the active project or Viewer scene.
