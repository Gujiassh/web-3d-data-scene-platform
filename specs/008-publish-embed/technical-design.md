# Technical Design: Publish And Embed

**Status**: Accepted for implementation

**Date**: 2026-07-19

## Architecture

Feature 008 adds one domain package and one non-product example:

```text
packages/publish/
  readiness.ts       current document + exact Runtime evidence gate
  manifest.ts        strict versioned metadata parser/serializer
  bundle.ts          deterministic exploded files + ZIP
  loader.ts          static manifest/scene/asset loader
  types.ts           public publish contracts and stable diagnostics

examples/minimal-host/
  framework-neutral Runtime integration and real published fixture
```

Studio calls `@web3d/publish` through a dedicated workspace hook/service. Runtime remains the geometry/session authority;
the publish package never imports Studio and never creates a Three.js renderer. React remains a thin wrapper over the
same Runtime instance.

## Frozen Contracts

- SceneDocument remains 1.4.0.
- Existing JSON/ZIP project export and archiveVersion 1.0.0 remain unchanged.
- ProjectRecord, IndexedDB version/stores, autosave, history and `lastExportedRevision` meaning remain unchanged.
- Publish is a new artifact contract, not a reinterpretation of project export.
- Existing Runtime/React methods and events retain their current signatures and semantics.

## Publish Readiness

`inspectPublishReadiness(input)` validates:

1. exact current document structure and semantics;
2. no Legacy annotations;
3. one `HotspotViewState` per Surface annotation bound to the same document ID/revision;
4. every Surface annotation is resolved by Runtime;
5. every declared asset has supplied bytes matching byte length and SHA-256;
6. bundle limits and deterministic path uniqueness.

The returned result is either `{ ok: true, value }` or `{ ok: false, blockers }`. Blockers use a closed code union and
carry authored IDs/paths where relevant. Builder functions accept only the successful value so no bypass boolean exists.

## Manifest Contract

`publish-manifest.json` is canonical UTF-8 JSON with a trailing newline:

```json
{
  "publishVersion": "1.0.0",
  "sceneSchemaVersion": "1.4.0",
  "documentId": "scene-id",
  "revision": 7,
  "entry": "scene.json",
  "files": [],
  "requirements": {
    "dataSources": [{ "sourceId": "source-1", "adapter": "mock" }],
    "trustedContentKeys": ["inspection-card"]
  }
}
```

`files` lists `scene.json` and `assets/<sha256>.<ext>` only. The manifest does not list itself because its own hash would
be recursive. Arrays and keys use a specified deterministic order. Unknown properties, versions, unsafe paths, duplicate
paths and file budget violations reject.

## Deterministic Bundle

`createPublishBundle(readyInput)` returns:

- `manifest`: parsed immutable metadata;
- `files`: read-only map containing manifest, scene and assets;
- `zipBytes`: deterministic stored ZIP with fixed DOS epoch mtime.

Document serialization reuses `serializeSceneDocument`. Assets are content-addressed and deduplicated by final path.
No wall clock, random ID, OS path or locale enters output.

## Static Loader

`loadPublishedScene({ baseUrl, fetch, signal })`:

1. resolves `publish-manifest.json` relative to a directory base URL;
2. checks HTTP success and declared size limits;
3. strictly parses the manifest;
4. fetches, hashes and parses canonical `scene.json`;
5. verifies document ID/revision/schema against the manifest;
6. returns the document, manifest and an AssetResolver that fetches only declared asset paths and rechecks bytes.

The loader does not instantiate adapters or Runtime. The host explicitly injects adapter instances and trusted-content
values. URL construction uses `new URL(relativePath, normalizedBaseUrl)` and forbids credential-bearing bases.

## Studio Integration

Studio adds a Publish command distinct from project JSON/ZIP export. The integration:

- reads the current authoritative project snapshot;
- asks the existing AuthoringScene handle for every Surface hotspot view state;
- resolves assets through the repository without changing it;
- runs readiness and bundle creation;
- presents stable localized blockers or downloads one `.web3d.zip`;
- never calls `markExported`, because publish status is not the existing project-export revision contract.

Publish UI state stays transient. No publish metadata is added to SceneDocument or ProjectRecord.

## Minimal Host

The example is under `examples/minimal-host`, is included in workspace build/acceptance, and has no root `dev` ownership.
It uses `createSceneViewer`, `loadPublishedScene`, a host-created Mock adapter, `onEvent`, `focusTarget` and a local trusted
content map. A dedicated Playwright config may start it on a non-product acceptance port; root topology continues to
start only Studio on strict port 4173.

## CSP And Static Hosting

Production host HTML contains no inline executable script. The documented minimum policy is:

```text
default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' blob: data:;
connect-src 'self' wss:; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'self'
```

The build verifier scans emitted JS for dynamic-eval constructs. Static hosts must serve JSON as `application/json`, GLB
as `model/gltf-binary`, glTF as `model/gltf+json`, JS as JavaScript and fonts with their real MIME types.

## Semantic Oracles

1. Publishing never mutates document bytes, revision, history, autosave, selection or current Runtime state.
2. A bundle cannot exist unless document, Surface evidence and asset bytes all belong to one accepted snapshot.
3. Published file identity is content/hash based; names and traversal order never determine meaning.
4. Studio Run and host Runtime consume the same canonical SceneDocument and adapter semantics.
5. Host-only values remain host-only; the manifest declares requirements without embedding secrets or content.
6. Static loader validation completes before Runtime activation and fails closed.
7. The example host proves the public boundary without becoming a second product application.

## Verification

- Unit: readiness codes, stale evidence, manifest strictness, asset hashing, determinism and loader cancellation.
- Contract: forbidden keys, exact file set, schema JSON examples and Runtime/React type surface.
- Integration: fixed real GLB published twice, loader round-trip, Runtime ready/selection/focus/adapter/trusted content.
- Browser: minimal host at 1280x720 and 1440x900, zero page/console errors, CSP/static-path behavior.
- Build: production host build and emitted-JS no-eval scan.
- Repository: full sequential gates and independent Critical reverse review.
