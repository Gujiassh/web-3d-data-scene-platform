# Protocols

## SceneDocument

The current write contract is `SceneDocument 1.4.0`. Imports accept the documented legacy versions and migrate them before
use; exports write only the current version. Structural AJV validation and semantic validation are both required.

Stable references use IDs, content hashes and node indices. Names are display copy. A `SceneTarget` therefore contains the
owning entity ID, asset SHA-256 and exact glTF node index. Persisted runtime values, connection flags and current alarms are
invalid additional fields.

Canonical details: [scene-document.md](../specs/001-product-foundation/contracts/scene-document.md).

## Archive 1.0.0

A `.web3d.zip` contains `manifest.json`, `scene.json` and content-addressed assets under `assets/<sha256>.glb|gltf`.
The manifest lists every payload path, media type, byte length and SHA-256. Import rejects missing, extra, duplicated,
oversized, path-traversing or hash-mismatched entries. Export uses deterministic path order, timestamps and ZIP encoding.

Canonical details: [archive-manifest.md](../specs/001-product-foundation/contracts/archive-manifest.md).

## Adapter Envelopes

Adapters implement `start`, `subscribe` and `stop`, and emit:

- `connection`: source health without document mutation;
- `snapshot`: complete JSON value with a new/current stream ID and sequence;
- `patch`: JSON-pointer changes ordered within the active stream.

Old streams, duplicate/out-of-order sequences and invalid pointers fail closed with diagnostics. Stale/offline health is
derived from source thresholds. An application-level value such as the smart-home starter's `"offline"` remains a value;
it does not falsify the shared adapter connection.

Canonical details: [data-adapter.md](../specs/001-product-foundation/contracts/data-adapter.md).

## Viewer And Publish

The framework-neutral Viewer accepts validated documents, asset resolvers and adapters. Public events and snapshots expose
serializable product state, never Three.js `Object3D`. React forwards the same lifecycle through typed components and
imperative handles.

Publish creates one deterministic bundle containing a canonical document, referenced assets, host content policy and
checksummed manifest. A host must verify the bundle before rendering trusted content.

- [Viewer API](../specs/001-product-foundation/contracts/viewer-api.md)
- [Publish manifest](../specs/008-publish-embed/contracts/publish-manifest.md)
