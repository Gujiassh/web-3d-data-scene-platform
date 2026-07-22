# SceneWeave Brand And Discovery

> Status: Accepted
> Date: 2026-07-22

## Brand

- Product name: `SceneWeave`
- GitHub repository: `Gujiassh/sceneweave`
- Primary descriptor: open-source, self-hosted, data-driven 3D scene editor and runtime
- Core promise: weave existing 3D assets, application data, declarative rules, and interactions into one portable web scene

The name is product-facing. Existing `@web3d/*` package names remain the `0.1.0-rc.1` SDK contract. Persistence keys,
SceneDocument identifiers, archive formats, fixture generator strings, and hash-bound asset provenance are not branding
surfaces and must not be renamed as part of this change.

## Discovery Vocabulary

Use these terms naturally where they describe real capabilities:

- Three.js scene editor and runtime
- data-driven 3D and WebGL visualization
- digital twin and IoT visualization
- glTF and GLB scene authoring
- React 3D viewer and framework-neutral viewer
- self-hosted and open-source 3D platform
- embeddable 3D scene viewer

Do not claim managed IoT integration, CAD/modeling, production readiness, real Safari support, or reference-hardware
performance until the corresponding gates pass.

## Repository Metadata

The GitHub description should state the primary category and differentiators in one sentence. Topics should cover the
implemented technologies and use cases: `threejs`, `webgl`, `react`, `typescript`, `3d`, `scene-editor`, `digital-twin`,
`iot`, `data-visualization`, `gltf`, `self-hosted`, and `open-source`.

No homepage URL is published until a real public deployment exists. Repository search metadata must not imply that the
local unlicensed smart-home starter is publicly distributed.

## README Structure

The README first viewport must identify SceneWeave and its literal category, show the real Studio, and expose the core
workflow. Detailed sections cover use cases, actual features, quick start, packages, architecture, verification, release
status, scope, contribution, and licensing. Keywords are supporting vocabulary, not a repeated keyword list.

## Acceptance

- The repository slug, Git remote, package repository URLs, README badge URLs, and GitHub metadata use `sceneweave`.
- Studio browser titles and application metadata use `SceneWeave`.
- README local links and the product screenshot resolve.
- `@web3d/*`, SceneDocument, save semantics, storage keys, fixtures, and generated asset hashes remain unchanged.
- Formatting, lint, typecheck, unit, build, documentation, i18n, package, design, and GitHub CI gates pass.
