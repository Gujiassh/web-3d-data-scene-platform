# Specification: SceneWeave Brand And Repository Discovery

## Goal

Rename the public product and GitHub repository to SceneWeave and improve repository discovery for developers searching
for open-source Three.js scene editing, data-driven 3D, digital-twin, IoT, glTF, React, and embeddable WebGL tooling.

## Requirements

- **FR-001**: The public product name MUST be `SceneWeave` and the GitHub slug MUST be `sceneweave`.
- **FR-002**: The README MUST state the literal product category, differentiators, implemented use cases, quick start,
  packages, architecture, verification, scope, release status, contribution, and licensing.
- **FR-003**: The README MUST use a real tracked Studio screenshot and valid CI/license/technology badges.
- **FR-004**: GitHub description and topics MUST describe actual implemented technology and use cases without keyword
  stuffing or unsupported production claims.
- **FR-005**: Studio document titles and application metadata MUST use SceneWeave in English and Chinese.
- **FR-006**: Root package identity, public package repository links, release verification, clone commands, badges, and Git
  remote MUST point at `Gujiassh/sceneweave`.
- **FR-007**: `@web3d/*` package names, SceneDocument and archive contracts, IndexedDB/storage keys, fixtures, generator
  provenance, asset hashes, save semantics, and runtime behavior MUST remain unchanged.
- **FR-008**: No homepage URL or public smart-home distribution claim MAY be added without real deployment and asset
  authorization evidence.

## Success Criteria

- **SC-001**: GitHub resolves `Gujiassh/sceneweave`, local/upstream/remote SHAs match, and the old slug redirects.
- **SC-002**: GitHub exposes the accepted description and discovery topics.
- **SC-003**: All README links and assets pass the release documentation audit.
- **SC-004**: Brand metadata tests, i18n, typecheck, unit, build, package, design, and final CI gates pass.
- **SC-005**: Contract-sensitive identifiers and deterministic hashes have no diff.
