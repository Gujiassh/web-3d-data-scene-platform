# Web 3D Data Scene Platform

A domain-neutral, self-hostable Web 3D scene runtime and authoring platform for frontend teams.
It loads existing 3D assets, binds scene targets to live data, evaluates declarative rules, and
publishes an embeddable Three.js viewer. The factory cell is a reference application, not a core
domain model.

## Status

The M0 vertical contract slice is implemented and locally verified. It includes the document
contract, framework-neutral Three.js runtime, React wrapper, Studio contract console, and Factory
Demo.

This is not a production release. External developer testing, Firefox/Safari coverage, the fixed
hardware performance benchmark, archive import/export, and the full Studio editing workflow remain
future milestones.

See [M0 verification](docs/ssot/m0-verification.md) for the exact evidence and remaining limits.

## Run Locally

Prerequisites: Node.js `>=22.12.0` and pnpm `10.33.4`.

```bash
pnpm install
pnpm dev
```

- Studio: <http://localhost:4173>
- Factory Demo: <http://localhost:4174>

## What M0 Proves

- A persisted `SceneDocument` can be structurally and semantically validated without runtime
  Three.js or React state.
- glTF targets resolve by asset hash and glTF node index rather than names or traversal order.
- The same runtime and rule semantics drive Studio Run mode and an independent React host.
- Snapshot/Patch ordering, stale/offline/recovery state, alarms, selection, focus, diagnostics, and
  WebGL context restoration work in the browser slice.
- Viewer teardown owns renderer, asset, adapter, timer, listener, observer, and pending-load
  lifecycles, including React StrictMode remounts.

## Workspace

- `packages/document`: SceneDocument types, standalone AJV validation, semantic checks, and stable
  serialization.
- `packages/runtime`: framework-neutral Three.js viewer, asset loading, data ordering, rules,
  alarms, diagnostics, and lifecycle ownership.
- `packages/react`: thin React lifecycle and imperative API wrapper around the runtime.
- `apps/studio`: M0 contract console using the shared runtime.
- `apps/factory-demo`: independent reference host with factory-specific operations UI.
- `apps/shared`: deterministic M0 fixture and mock telemetry scenario shared by both apps.

## Verify

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
./scripts/verify-product-design.sh
```

The browser suite starts isolated Studio and Factory Demo servers and writes local screenshots to
the ignored `artifacts/e2e/` directory.

## Product Documents

- [Product definition](docs/ssot/product-definition.md)
- [Accepted product decisions](docs/ssot/product-decisions.md)
- [Technology decisions](docs/ssot/technology-decisions.md)
- [Market and positioning](docs/ssot/market-and-positioning.md)
- [M0 verification](docs/ssot/m0-verification.md)
- [MVP product requirements](specs/001-product-foundation/spec.md)
- [Product and interaction design](specs/001-product-foundation/product-design.md)
- [Technical design](specs/001-product-foundation/technical-design.md)
- [Scene document contract](specs/001-product-foundation/contracts/scene-document.md)
- [Archive manifest contract](specs/001-product-foundation/contracts/archive-manifest.md)
- [Data adapter contract](specs/001-product-foundation/contracts/data-adapter.md)
- [Viewer API contract](specs/001-product-foundation/contracts/viewer-api.md)
- [Factory asset strategy](docs/ssot/factory-asset-strategy.md)
- [Validation plan](specs/001-product-foundation/validation-plan.md)
- [Delivery plan](specs/001-product-foundation/delivery-plan.md)
- [Requirements quality checklist](specs/001-product-foundation/checklists/requirements.md)
- [Product design completion audit](specs/001-product-foundation/checklists/product-design-completion.md)

## Scope Boundary

MVP excludes browser-based modeling, real industrial protocol integration, multiplayer
collaboration, game systems, and physics simulation. Factory telemetry and operations state stay in
the reference host; they are not persisted in `SceneDocument` or imported into the platform core.

## License

Platform code is released under the [MIT License](LICENSE). The generated factory reference asset
is released under CC0-1.0; see `assets/factory/LICENSE-CC0.txt`.
