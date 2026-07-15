# Quickstart: Theme And Scene Naming Acceptance

## Automated Gates

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm verify:i18n
npm_config_offline=true pnpm verify:design
CHOKIDAR_USEPOLLING=true CHOKIDAR_INTERVAL=250 pnpm test:e2e
git diff --check
```

## Scene Creation

1. Open Studio with an existing scene and note its name and recent-project count.
2. Choose Project, then New scene.
3. Confirm the dialog is focused and no project has been created.
4. Submit whitespace and confirm the dialog remains with an inline validation state.
5. Cancel and confirm the original scene/history/recent list is unchanged.
6. Reopen the dialog, enter `  Assembly Review  ` and confirm.
7. Confirm the new active scene and recent list use `Assembly Review` exactly once.

## Scene Rename

1. Choose Project, then Rename scene; confirm the current name is selected.
2. Enter `Line A Commissioning` and confirm revision increases once.
3. Undo and confirm the old name returns; Redo and confirm the new name returns.
4. Wait for saved state, reload and confirm toolbar, recent list and document name agree.
5. Export JSON and confirm the JSON name and download filename use the renamed value.
6. Switch to Run mode and confirm Rename scene is disabled.

## Theme

1. Clear app theme storage and emulate dark browser preference.
2. Open Studio and Factory Demo independently; confirm each starts dark.
3. Capture the canvas node, document revision, selection and Factory telemetry state.
4. Toggle to light; confirm the host UI updates and all captured semantic state is unchanged.
5. Reload and confirm the explicit light preference returns.
6. Verify changing one application's theme key does not change the other's preference.
7. Inspect light and dark screenshots at 1440x900, 1280x720 and Factory 768x1024; confirm the canvas
   is nonblank and no text, controls or overlays overlap.
