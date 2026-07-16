# Internal Contracts: Feature 006A

Feature 006A adds no HTTP API. Its contracts are package-local TypeScript boundaries.

## Document

- Current `SceneDocument` is 1.2.0 with required `environment.lighting` from `data-model.md`.
- `parseSceneDocument` accepts valid declared 1.0/1.1/1.2 input and returns current 1.2.
- `validateSceneDocument` accepts only current 1.2.
- `transform-entity` and `transform-entities` share finite/normalized/positive/no-op invariants.
- One environment command applies complete before/after `SceneEnvironment` atomically.

## Runtime Authoring

The additive authoring seam may accept controlled Smart Align settings and expose drag-state facts needed
by Studio, but must preserve existing public transform preview/commit event meaning. One drag emits at most
one final document commit. Guide/candidate details remain authoring-only and are not Viewer events.

Runtime exposes in-place authored/preview lighting reconciliation through the existing Viewer ownership
boundary. The final API shape is fixed during implementation against current background setters; it must
not require a source reload.

## React

React forwards stable Smart Align and lighting-preview inputs/handle methods. Prop changes reconcile the
existing Viewer instance and never recreate Canvas, controls, adapters or generation.

## Studio

- One canonical registry feeds keyboard resolution, tooltips and Help.
- Shortcut matching is exact and subject to text, modal, drag and Edit/Run gates.
- Smart Align enabled is a local presentation preference.
- Apply is one document command; preview/candidate/guide/draft state is transient.
