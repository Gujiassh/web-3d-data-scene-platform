# Implementation Plan: Single Studio Data Binding

**Branch**: `main` | **Date**: 2026-07-15 | **Spec**: [spec.md](./spec.md)

## Summary

Consolidate the product into one Studio application and deliver the first complete data-driven scene
workflow. Studio will map an imported asset-root target to a business ID, author a Mock source, select a
stable JSON Pointer, configure ordered equality rules with color and optional alarm effects, and preview
the result through the existing runtime pipeline in Run mode. All persistent edits use document commands;
runtime connection, value, alarm and diagnostic state remains transient. The feature does not change
`SceneDocument 1.0.0`, archive fields or project save semantics.

## Technical Context

**Language/Version**: TypeScript 6.0, React 19

**Primary Dependencies**: Three.js 0.185, `@web3d/document`, `@web3d/runtime`, `@web3d/react`, Vite 8,
lucide-react

**Storage**: Existing IndexedDB project repository and JSON/ZIP archive codecs; no new storage

**Testing**: Vitest 4, fake-indexeddb, Playwright 1.61 with real WebGL

**Target Platform**: Node.js 22.12+ tooling and modern desktop browsers with WebGL and IndexedDB

**Project Type**: pnpm workspace with one Studio application and reusable document/runtime/react
packages

**Performance Goals**: Accepted Mock updates project color/alarm and host status within 100 ms in the
fixed acceptance scene; locale/theme and Edit/Run transitions preserve one Viewer and one active adapter

**Constraints**: Preserve `SceneDocument 1.0.0`, archive shape, project record shape and save payload
meaning; no credentials or runtime values in persistence; no model-node target authoring, WebSocket UI,
layout expansion, surface hotspots or arbitrary actions in this slice

**Scale/Scope**: One selected imported asset-root target, multiple authored Mock sources/bindings/rule
sets, deterministic sample payload paths, equality rules, color/alarm effects and one Studio Run preview

## Governance Check

The repository has no `.specify/memory/constitution.md`. The active gates are the product SSoT,
`specs/001-product-foundation`, this feature specification, root quality scripts and the risk-based review
protocol from the workspace instructions.

| Gate                    | Pre-design | Post-design response                                                                                                                                        |
| ----------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Goal alignment          | PASS       | One Studio owns the complete author-to-preview workflow; no second product remains.                                                                         |
| User-visible flow       | PASS       | Edit and Run retain the same project, scene and selection; only transient runtime state starts/stops.                                                       |
| Architecture boundaries | PASS       | Document commands own persistent mutations; a dedicated Studio feature owns forms; runtime owns adapter/value/rule/effect processing.                       |
| Data/save contracts     | PASS       | Existing Target/DataSource/Binding/RuleSet fields are used unchanged; archive and project records are not reshaped.                                         |
| Deterministic identity  | PASS       | Commands receive generated stable IDs once at authoring time; bindings reference IDs and RFC 6901 pointers, never names/order.                              |
| Runtime isolation       | PASS       | Connection/value/alarm/diagnostic snapshots are typed host state and never enter document/history/autosave/export.                                          |
| Internal contracts      | PASS       | Existing adapter injection remains; approved additive authoring Viewer/React APIs expose Run enablement and binding state without changing persistence.     |
| Performance             | PASS       | Runtime-to-host and runtime-to-canvas latency is measured separately from scenario scheduling delay.                                                        |
| Diagnosability          | PASS       | Existing connection/alarm/diagnostic events feed a bounded Run status panel; no payload or secret logging.                                                  |
| Breaking changes        | PASS       | Factory Demo is intentionally retired as a product surface after equivalent Studio browser evidence exists; package APIs and document schema remain stable. |
| Package exports         | PASS       | New document commands are exported through existing barrels; no runtime internals are exposed.                                                              |
| Verification            | PASS       | Unit, contract, persistence, E2E, canvas pixels, screenshots, topology scan, i18n/design and full root gates are required.                                  |

## Performance Evidence Plan

- Baseline semantic: compare the accepted runtime envelope timestamp with the first matching host snapshot
  and rendered pixel/state observation; do not include the Mock step's scheduled `atMs` delay.
- Environment: Linux x64, Chromium 140+, headless Playwright, fixed M0 GLB fixture.
- Collect at least one timing sample for each authored status and assert every sample is at most 100 ms.
- Repeat Edit/Run, locale and theme transitions and assert Canvas identity, Viewer ready count, adapter
  starts/stops, emitted transitions and active timers do not multiply.
- Capture desktop screenshots at 1280x720 and 1440x900 plus nonblank Canvas pixel checks.
- A timeout, missing envelope, lost context or non-comparable screenshot blocks acceptance rather than
  producing a performance conclusion.

## Project Structure

### Documentation

```text
docs/ssot/
├── product-definition.md
├── product-decisions.md
├── single-studio-data-binding.md
├── i18n-architecture.md
├── theme-and-scene-naming.md
└── m2-verification.md

specs/001-product-foundation/
├── spec.md
├── product-design.md
├── technical-design.md
├── delivery-plan.md
└── validation-plan.md

specs/005-single-studio-data-binding/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── tasks.md
├── contracts/README.md
├── checklists/requirements.md
└── acceptance.md
```

### Source Code

```text
apps/studio/src/
├── data-binding/             # forms, sample paths, command builders, preview state
├── features/                 # thin panel integration
├── workspace/                # orchestration; no rule/form business logic
├── i18n/                     # Chinese/English copy
├── App.tsx                   # composition only
└── styles.css

apps/shared/                  # shared theme/i18n controls only

packages/document/src/
├── commands/                 # target/source/binding/rule-set document commands
├── types.ts                  # unchanged SceneDocument 1.0.0 types
└── semantics.ts              # existing reference/writer validation

packages/runtime/src/         # existing adapter/value/rule/effect/alarm pipeline
packages/react/src/           # existing AuthoringScene lifecycle boundary

tests/
├── e2e/                      # Studio-only authoring, Run and topology evidence
└── fixtures/m0-factory/      # preserved generic GLB/document/hash fixture
```

**Structure Decision**: Add a cohesive `apps/studio/src/data-binding/` feature boundary rather than
placing form, command construction and preview-state logic into the already large `App.tsx` or
`useStudioWorkspace.ts`. Keep persistent command execution in `packages/document`, generic runtime
behavior in `packages/runtime`, and React Viewer reconciliation in `packages/react`. Retire
`apps/factory-demo`; keep its fixed asset only as test evidence outside Studio's production public files.

## Architecture

### Persistent Authoring Boundary

- Resolve the selected asset entity to its existing root `SceneTarget` by `entityId`.
- Target business ID, Mock source, binding and rule-set changes are atomic `DocumentCommand` variants;
  removing a source atomically removes its dependent bindings and only their now-unreferenced rule sets.
- Each accepted form submission produces at most one revision/history entry and is rejected before
  mutation when invalid or unchanged.
- Commands replace or remove only the addressed record and rely on whole-document semantic validation
  for existing references, writer conflicts and deterministic rule meaning. The new configure command
  additionally rejects malformed RFC 6901 pointers without tightening legacy document-load semantics.
- IDs are generated in Studio command builders before execution and remain stable through autosave,
  Undo/Redo, reload and JSON/ZIP round trips.

### Mock Source And Field Boundary

- Persist only existing Mock source fields: name, scenario, optional seed/default speed and stale/offline
  thresholds.
- A Studio scenario registry maps a known scenario ID to a deterministic sample payload and adapter step
  factory. The registry is runtime construction logic, not persisted schema.
- Enumerate bindable sample leaves recursively and encode each segment as RFC 6901 JSON Pointer. Sort by
  pointer for deterministic presentation.
- Do not infer fields from display names or whichever payload arrives first.

### Rules And Effects Boundary

- The first editor writes ordered `value eq expected` rules with explicit priorities.
- Each row writes a color effect and may write one alarm effect. The binding declares exactly the effect
  types its connected rule set can produce.
- Existing unsupported operators/effects remain readable and preserved. The limited editor must not
  silently rewrite them; it presents them as unsupported for this slice.
- Whole-document validation rejects missing references and conflicting enabled writers before history
  advances.

### Run Preview Boundary

- Entering Run derives adapters from the active document's supported Mock sources and passes them through
  the existing `AuthoringScene` adapter map.
- Authoring Viewer data evaluation is disabled in Edit and enabled in Run through the approved additive
  public API; read-only `SceneViewer` behavior remains enabled by default.
- Viewer events update a dedicated transient preview store containing connection status, current bound
  values, alarms and diagnostics. Runtime-only state never dispatches a document command.
- Leaving Run removes/stops adapters and clears preview state. Authored source/binding/rule configuration
  remains in the document.
- Theme and locale providers must not participate in Viewer keys or adapter factory identity.

### Single Product Topology

- Root `dev` starts only `@web3d/studio` on strict port 4173.
- Factory Demo application/package and port 4174 are removed only after its generic runtime evidence is
  represented in Studio Run E2E coverage.
- The M0 factory asset moves unchanged to `tests/fixtures/m0-factory`; its GLB hash remains the accepted
  oracle and it is not copied into Studio's production build.
- Stable SSoT describes a domain-neutral Studio. Historical feature acceptance records remain historical
  and receive only supersession notes where necessary.

## Implementation Lanes

1. **Document/runtime lane** owns command variants, atomic mutations, command tests, Mock scenario adapter
   construction and runtime preview helpers/tests.
2. **Studio UI lane** owns `data-binding/`, thin app/workspace integration, bilingual controls, Run status
   surfaces, responsive styling and focused component/unit tests.
3. **Topology/QA/docs lane** owns Factory removal, fixture relocation, scripts/lockfile, Studio-only E2E,
   topology scan and roadmap/SSoT updates.
4. **Main controller** owns contract decisions, cross-lane integration, diff inspection, runtime evidence,
   reviewer coordination, acceptance, workbench writeback, commit and push.

The same three implementation conversations remain assigned through audit, implementation and rework.
Independent contract and frontend reviewer conversations from the prior slice are resumed for final review.

## Verification Strategy

- Document unit tests prove every command's no-op/reject/success, one-revision behavior, Undo/Redo and
  reference cleanup without schema changes.
- Runtime tests prove deterministic scenario construction, JSON Pointer values, rule/effect/alarm output,
  adapter stop/replace behavior and transient snapshot ownership.
- Studio unit tests prove field enumeration/escaping, form validation, unsupported-content preservation,
  Edit-only mutation and preview state reduction.
- Persistence tests compare stable IDs and meanings after autosave/reload and JSON/ZIP round trip.
- E2E proves the complete import-to-Run workflow in Chinese and English, both themes, connection/value/
  color/alarm/diagnostic output, Edit/Run cleanup, context restoration and no duplicate lifecycle work.
- Topology verification rejects `4174`, `@web3d/factory-demo`, `apps/factory-demo`, Factory preference keys
  and a second Playwright server outside explicit historical/supersession records.
- Full gates: `format:check`, `lint`, `typecheck`, `test`, `build`, `verify:i18n`, `verify:design`, E2E,
  topology verification and `git diff --check`.

## Complexity Tracking

No schema, archive, backend, new framework or compatibility layer is introduced. The only intentional
product-topology break is removing the independent Factory Demo after replacing its generic runtime
evidence in Studio.
