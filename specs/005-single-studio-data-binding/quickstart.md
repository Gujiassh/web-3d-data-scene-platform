# Quickstart: Single Studio Data Binding Acceptance

## Development Topology

```bash
pnpm install
pnpm dev
```

Open `http://127.0.0.1:4173`. No second product server or port is required.

## Automated Gates

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm verify:i18n
npm_config_offline=true pnpm verify:design
pnpm verify:topology
CHOKIDAR_USEPOLLING=true CHOKIDAR_INTERVAL=250 pnpm test:e2e
git diff --check
```

## Authoring Workflow

1. Create a named scene and import the fixed GLB fixture from `tests/fixtures/m0-factory`.
2. Select the imported asset root and open its data configuration.
3. Set a business ID and confirm revision increases once; Undo and Redo it.
4. Create a Mock source with a known scenario and valid stale/offline thresholds.
5. Inspect the deterministic sample field list, including an RFC 6901 escaped-key fixture, and select a
   status pointer.
6. Create a binding and three equality rules with distinct colors. Enable an alarm on at least one row.
7. Reload the project and confirm target/source/binding/rule IDs, values and relationships are unchanged.

## Run Preview

1. Enter Run mode and confirm the same project, scene and selection remain active.
2. Observe connecting/online state and the current bound value in Studio host UI.
3. Exercise every Mock status and confirm the configured color and alarm result.
4. Measure from accepted runtime update to matching host/Canvas state; every result must be at most 100 ms.
5. Confirm relevant diagnostics are accessible and contain no source payload or secret.
6. Switch Chinese/English and light/dark while Run is active. Confirm Canvas identity, active adapter,
   connection, value, alarm and selection do not reset or duplicate.
7. Return to Edit. Confirm adapters stop and connection/value/alarm/diagnostic preview state clears while
   authored mappings remain unchanged.

## Persistence And Contract

1. Export JSON and ZIP, then import each into a clean local project.
2. Compare target/source/binding/rule-set IDs and semantic values with the authored document.
3. Confirm no runtime connection, current value, alarm, diagnostic, endpoint or credential appears in the
   exported document, archive manifest or project metadata.
4. Run the generated validator and archive tests to confirm the `1.0.0` field shapes are unchanged.

## Runtime Regression Evidence

1. Run Studio through the full M0 telemetry sequence and assert Snapshot/Patch ordering, stale/offline and
   recovery behavior.
2. Confirm selection, focus, alarm transitions and material color projection in real WebGL.
3. Trigger WebGL context loss/restoration and confirm the Studio Run scene becomes nonblank again without
   duplicating adapters.
4. Repeat Edit/Run cycles and confirm starts, stops, timers and Viewer events remain balanced.

## Responsive And Visual Evidence

1. Capture Edit and Run screenshots at 1280x720 and 1440x900 in both themes.
2. Check for page overflow, clipped primary controls, inaccessible status rows and panel overlap.
3. Run Canvas pixel checks for every screenshot; a blank or incorrectly framed scene blocks acceptance.

## Single-Product Scan

Confirm active packages, scripts, routes and current product documentation contain no user-facing
`apps/factory-demo`, `@web3d/factory-demo`, `4174`, second Playwright server or Factory-specific browser
preference key. Explicit historical acceptance/supersession notes may retain names only as history.
