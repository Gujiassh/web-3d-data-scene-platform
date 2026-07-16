# Quickstart: Feature 006A Verification

## 006A.1

1. Open the fixed editing project and select a visible unlocked asset.
2. Discover `W/E/R` from toolbar tooltips; open Help with `?` and filter by command/key.
3. Enter XYZ rotation degrees, reset Rotation with the row icon and Undo/Redo.
4. Multi-select roots and test Position, Scale and Reset all; confirm one revision per accepted command.
5. Verify input/modal/Run/active-drag gates and rejected invalid scale recovery.

## 006A.2

1. Enable Smart Align, drag on X/Y/Z and plane handles near fixed reference bounds and the scene origin.
2. Verify one guide per active axis and the oracle candidate/transform.
3. Hold Alt to bypass; release and verify the preference remains enabled.
4. Reload Studio and verify the local switch persists but JSON/ZIP/IndexedDB contain no align state.
5. Run the fixed 500-entity benchmark and lifecycle cleanup checks.

## 006A.3

1. Open Scene settings and exercise background/grid plus Standard, Soft and Contrast lighting.
2. Preview colors/intensities/directions, Cancel, Apply, Undo and Redo without Canvas replacement.
3. Reload, export/import JSON and ZIP, then compare current 1.2 documents and asset bytes.
4. Seed valid 1.0/1.1 IndexedDB records and prove real 1.2 rewrites; seed one invalid mixed record and prove
   complete rollback.
5. Inspect a glTF with punctual lights and verify a diagnostic without double lighting.

## Required Gates

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
pnpm verify:i18n
pnpm verify:design
pnpm verify:topology
pnpm format:check
pnpm test:e2e
```
