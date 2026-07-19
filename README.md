# Web 3D Data Scene Platform

A domain-neutral, self-hostable Web 3D scene authoring and runtime platform for frontend teams. It
loads existing 3D assets, binds stable scene targets to live data, evaluates declarative rules, and
publishes the same versioned scene to an embeddable Three.js viewer.

## Status

The foundation through feature 007 is implemented and verified: the single Studio covers editing, data-binding Run,
layout, lighting, precise surface hotspots and declarative interactions on `SceneDocument 1.4.0`. Studio remains the
sole product frontend. Feature 007's representative-user timing gate was owner-waived because participants were
unavailable; no usability result is claimed, and external target-developer testing remains a release-stage requirement.

This is not a production release. External developer testing, Firefox/Safari coverage, fixed-hardware
performance evidence, publish/embed packaging, and formal open-source release gates remain future work.

## Product Entry

Studio is the product frontend and the continuous Edit/Run workspace.

Prerequisites: Node.js `>=22.12.0` and pnpm `10.33.4`.

```bash
pnpm install
pnpm dev
```

Open Studio at <http://localhost:4173>. The development server uses strict port 4173 and exits instead
of silently selecting another port when 4173 is occupied.

## What M0 Proves

- A persisted `SceneDocument` can be structurally and semantically validated without runtime Three.js
  or React state.
- glTF targets resolve by asset hash and glTF node index rather than names or traversal order.
- Snapshot/Patch ordering, stale/offline/recovery state, alarms, selection, focus, diagnostics, and
  WebGL context restoration work in the browser slice.
- Viewer teardown owns renderer, asset, adapter, timer, listener, observer, and pending-load lifecycles,
  including React StrictMode remounts.

The original M0 browser evidence used an independent Factory host. Feature 005 preserved those generic
runtime invariants in Studio Run and automated tests, then removed that host.

## What M1 Adds

- Local projects and content-addressed model assets are stored in IndexedDB without changing the
  `SceneDocument 1.0.0` schema.
- GLB and self-contained glTF files are inspected before confirmation and committed atomically with
  their asset, entity, and target records.
- Tree and viewport selection share stable entity IDs; rename, visibility, lock, transform, duplicate,
  and delete edits flow through reversible document commands.
- TransformControls preview does not change document revision; pointer release commits exactly one
  command. Run mode blocks document commands.
- JSON and ZIP import/export preserve the canonical local document, asset hashes, and `asset://` URI
  contract.

## Roadmap

1. `005-single-studio-data-binding`: single Studio, business mapping, rules, and Mock Run preview.
2. `006-scene-layout`: scene layout, hierarchy, alignment, and snapping.
3. `007-hotspots-interactions`: precise surface hotspots, annotations, and persisted interactions.
4. `008-publish-embed`: publish artifacts, a minimal host example, and embed documentation.
5. `009-performance-usability-open-source`: fixed benchmarks, external usability, and release gates.

## Workspace

- `apps/studio`: the sole product frontend and local Edit/Run workspace.
- `packages/document`: SceneDocument types, standalone AJV validation, semantic checks, stable
  serialization, document commands, history, and archive codecs.
- `packages/runtime`: framework-neutral Three.js viewer, asset loading, data ordering, rules, alarms,
  diagnostics, authoring controls, and lifecycle ownership.
- `packages/react`: thin React lifecycle and imperative API wrappers around the runtime.
- `tests/fixtures/m0-factory`: deterministic GLB, SceneDocument, manifest, generator, and license used as
  test evidence; it is not a product application or production asset bundle.

## Verify

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
pnpm verify:i18n
pnpm verify:topology
pnpm verify:design
```

The browser suite starts one isolated Studio server on 4173 and writes local screenshots to the ignored
`artifacts/e2e/` directory. `verify:topology` rejects a second app/server, obsolete Factory package or
preference keys, and non-strict Studio port configuration.

## Product Documents

- [Product definition](docs/ssot/product-definition.md)
- [Accepted product decisions](docs/ssot/product-decisions.md)
- [Technology decisions](docs/ssot/technology-decisions.md)
- [Market and positioning](docs/ssot/market-and-positioning.md)
- [M0 verification](docs/ssot/m0-verification.md)
- [M1 architecture](docs/ssot/m1-architecture.md)
- [M1 verification](docs/ssot/m1-verification.md)
- [MVP product requirements](specs/001-product-foundation/spec.md)
- [Product and interaction design](specs/001-product-foundation/product-design.md)
- [Technical design](specs/001-product-foundation/technical-design.md)
- [Single Studio data-binding specification](specs/005-single-studio-data-binding/spec.md)
- [Calibrated hotspot interaction design](specs/007-hotspots-interactions/technical-design.md)
- [Hotspot implementation plan](specs/007-hotspots-interactions/plan.md)
- [Publish and embed specification](specs/008-publish-embed/spec.md)
- [Publish and embed technical design](specs/008-publish-embed/technical-design.md)
- [Scene document contract](specs/001-product-foundation/contracts/scene-document.md)
- [Archive manifest contract](specs/001-product-foundation/contracts/archive-manifest.md)
- [Data adapter contract](specs/001-product-foundation/contracts/data-adapter.md)
- [Viewer API contract](specs/001-product-foundation/contracts/viewer-api.md)
- [Reference fixture strategy](docs/ssot/factory-asset-strategy.md)
- [Validation plan](specs/001-product-foundation/validation-plan.md)
- [Delivery plan](specs/001-product-foundation/delivery-plan.md)

## Scope Boundary

MVP excludes browser-based modeling, real industrial protocol integration, multiplayer collaboration,
game systems, and physics simulation. Runtime values, connection state, alarms, current selection, and
host business state never enter `SceneDocument` or archive content.

## License

Platform code is released under the [MIT License](LICENSE). The generated M0 reference fixture is
released under CC0-1.0; see
[tests/fixtures/m0-factory/LICENSE-CC0.txt](tests/fixtures/m0-factory/LICENSE-CC0.txt).
