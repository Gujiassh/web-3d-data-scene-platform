# Feature 008: Publish And Embed

**Status**: Implementation-ready

**Date**: 2026-07-19

## Problem

Studio can author and export a project archive, but an integrating frontend team still lacks a reproducible static
publish artifact, a strict pre-publish readiness decision and an executable host example. Existing Runtime and React
APIs already cover load, adapter injection, selection events and focus commands; Feature 008 must expose those existing
boundaries without turning Studio state into a public contract.

## Goal

An author publishes one deterministic bundle from Studio. A frontend developer serves the exploded bundle from static
hosting and embeds the same document through either the framework-neutral Runtime or the React wrapper, with host-owned
adapters and trusted-content mapping.

## User Scenarios

### US-001 Publish A Ready Scene

Given a current saved project whose assets and Surface hotspots are resolved, Publish validates the exact current
document/runtime evidence and downloads one versioned bundle. Publishing does not mutate the document, revision,
history, autosave state or runtime selection.

### US-002 Reject An Unsafe Or Incomplete Publish

Given a legacy/unresolved hotspot, missing or mismatched asset, missing Runtime resolution evidence or invalid current
document, Publish emits stable actionable blockers and produces no partial artifact.

### US-003 Embed With The Framework-Neutral Runtime

A developer serves the exploded bundle, calls the published-scene loader, injects adapters, receives stable selection
events and invokes `focusTarget` without reading Three.js objects or Studio state.

### US-004 Embed With React

A React host uses the same loaded document and asset resolver through `SceneViewer`. Source and adapter updates preserve
the existing transactional load and lifecycle semantics.

### US-005 Resolve Host-Owned Content

The manifest lists required trusted-content keys but never embeds their host values. A host maps those keys locally and
handles `hotspot-host-content-request`; missing host mappings remain an explicit host integration error.

## Functional Requirements

- **FR-001**: Publish MUST accept only a valid current SceneDocument 1.4 and MUST NOT migrate or rewrite persisted data.
- **FR-002**: Publish readiness MUST return a closed set of stable blockers rather than free-form booleans.
- **FR-003**: Every Legacy hotspot MUST block publication until an author explicitly repositions it to a Surface anchor.
- **FR-004**: Every Surface hotspot MUST have exact Runtime resolution evidence for the same document ID and revision;
  missing, stale or unresolved evidence MUST block publication.
- **FR-005**: Every referenced asset MUST resolve to bytes matching its declared SHA-256 and byte length before any
  artifact is returned.
- **FR-006**: Readiness MUST NOT use names, traversal order, nearest/first-available assets or other heuristic mapping.
- **FR-007**: Publish MUST produce a strict `publish-manifest.json`, canonical `scene.json` and one content-addressed
  asset file per unique published asset.
- **FR-008**: `publishVersion` starts at `1.0.0`; parsers MUST reject unknown versions and unknown manifest properties.
- **FR-009**: The manifest MUST bind every payload path by media type, byte length and SHA-256 and MUST reject unsafe,
  duplicate, missing or extra paths.
- **FR-010**: The manifest MUST list required data source IDs/adapter kinds and trusted-content keys in deterministic
  order without including adapter instances, endpoints, credentials or content values.
- **FR-011**: Identical document, asset bytes and resolution evidence MUST produce byte-identical manifest, static files
  and ZIP output.
- **FR-012**: The publish API MUST expose both an exploded read-only file map and a deterministic ZIP of the same files.
- **FR-013**: The published-scene loader MUST fetch and strictly validate the manifest and canonical scene before
  returning a SceneDocument and AssetResolver.
- **FR-014**: The loader AssetResolver MUST fetch only manifest-declared same-bundle paths and MUST verify bytes before
  returning a Blob to Runtime.
- **FR-015**: Loader fetches MUST honor AbortSignal and MUST NOT publish a partially validated scene to the caller.
- **FR-016**: Studio MUST expose one clear Publish command, show readiness blockers and download nothing when blocked.
- **FR-017**: Successful Studio Publish MUST use the authoritative current project snapshot and exact Runtime hotspot
  view states without changing save/export revision semantics.
- **FR-018**: The framework-neutral minimal host MUST demonstrate load, adapter injection, selection event handling,
  `focusTarget` and trusted-content mapping against one real published fixture.
- **FR-019**: The React boundary MUST accept the same loaded document, AssetResolver and adapters and preserve existing
  callback/imperative-handle behavior.
- **FR-020**: Static hosting guidance MUST define base URL rules, MIME types, SPA-independent paths, cache guidance and
  a CSP that does not require `unsafe-eval` or inline script.
- **FR-021**: The embed tutorial MUST be executable from a clean checkout and separate author, publish, deploy and host
  responsibilities.
- **FR-022**: Runtime selection, alarms, connection state, current payloads, editor drafts, history, diagnostics and host
  content values MUST NOT occur in any publish file.
- **FR-023**: Publish MUST preserve the existing SceneDocument, archive container, ProjectRecord and autosave contracts.
- **FR-024**: The minimal host is an integration example, not a second product frontend or an industry dashboard.

## Non-Functional Requirements

- **NFR-001**: Publish output MUST be deterministic across repeated runs and operating systems for identical inputs.
- **NFR-002**: Manifest and loader validation MUST fail closed before Runtime activation.
- **NFR-003**: Existing archive size/file/path protections are the minimum publish limits; no payload is allocated before
  declared limits are checked.
- **NFR-004**: Published browser code MUST pass a production scan with no `eval` or `new Function` requirement.
- **NFR-005**: Loader errors MUST identify a stable code, affected path or authored ID and one actionable correction.
- **NFR-006**: Publish generation MUST be all-or-nothing and leave authoritative Studio state byte-identical on success,
  rejection, asset failure and user cancellation.
- **NFR-007**: Runtime and React loading/disposal behavior MUST remain transactional and StrictMode-safe.
- **NFR-008**: The minimal host MUST work at 1280x720 and 1440x900 with visible focus and no overlapping controls.
- **NFR-009**: The documented embed path MUST be measurable in 15 minutes, but Feature 008 may use an explicit Owner
  Waiver if external developer timing participants remain unavailable; no timing claim may be fabricated.

## Success Criteria

- **SC-001**: Repeating publish twice produces identical file names, file hashes, manifest bytes and ZIP bytes.
- **SC-002**: Invalid document, Legacy hotspot, missing/stale/unresolved surface evidence and asset byte mismatch each
  produce no artifact and the expected stable blocker.
- **SC-003**: Studio Run and the minimal host reach the same ready document/revision and normalized initial snapshot for
  the fixed fixture.
- **SC-004**: The minimal host proves adapter injection, viewer-origin selection event, API-origin focus/selection and
  trusted-content mapping without document mutation.
- **SC-005**: Publish outputs contain zero forbidden transient/security keys and all manifest/file hashes verify.
- **SC-006**: Runtime, React and publish public type-contract tests pass with no unresolved imports or hidden Studio
  dependency.
- **SC-007**: Production minimal-host output passes CSP/static-path checks and Chromium E2E with zero page/console errors.
- **SC-008**: Root typecheck, lint, tests, builds, i18n, design, topology, formatting and diff gates pass sequentially.

## Scope Boundaries

- No SceneDocument 1.5, ProjectRecord, IndexedDB, archive 1.0.0 or save-semantic change.
- No credential store, hosted backend, CDN provisioner, account, permission or deployment control plane.
- No arbitrary script/action, analytics payload, host route persistence or automatic trusted-content fetching.
- No npm registry release; Feature 009 owns release packaging and public release claims.
- No second Studio or product dashboard. The host example remains under `examples/` with a dedicated acceptance server.

## Owner Decisions

- Feature 007 T044 was owner-waived on 2026-07-19 without fabricated usability results, clearing the Feature 008 gate.
- Feature 008 extends distribution/public integration contracts only; existing persisted/save meanings remain frozen.
