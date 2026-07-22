# Changelog

All notable project changes are recorded here. The project follows Semantic Versioning after the first public release.

## Unreleased

- Stopped contract-compliant glTF collision proxies from rendering over visible geometry or being re-enabled by runtime
  visibility effects while preserving their formal node indexes, hierarchy, and raycast availability for picking.
- Prevented contract generation from exposing temporarily empty AJV validator modules to a running Vite server by
  skipping unchanged files and atomically replacing changed generated output.
- Branded the product and repository as SceneWeave and added clearer Three.js, WebGL, digital-twin, IoT, glTF, React,
  and self-hosted discovery metadata while preserving the `@web3d/*` RC package contract.
- Public smart-home starter, Pages deployment, GitHub release and npm publication remain gated by asset licensing,
  reference-environment evidence and owner credentials.

## 0.1.0-rc.1 - 2026-07-20

- Added the continuous Studio Edit/Run workspace with IndexedDB projects and content-addressed assets.
- Added SceneDocument 1.4 validation, migrations, commands, deterministic JSON/ZIP archives and authored lighting.
- Added framework-neutral and React viewers with Snapshot/Patch data, rules, alarms, diagnostics and lifecycle ownership.
- Added hierarchy/layout tools, Smart Align, precise surface hotspots and declarative interactions.
- Added deterministic publish bundles and a minimal embeddable host.
- Added hash-bound smart-home starter generation and generic multi-channel state bindings without changing persisted
  contracts.
- Added fixed release-performance generation, cross-engine browser projects and clean-consumer ESM/declaration package
  verification.
