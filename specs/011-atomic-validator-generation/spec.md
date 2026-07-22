# Specification: Atomic Validator Generation

## Problem

The running Studio can fail with `does not provide an export named 'default'` after typecheck, build, or package
verification regenerates AJV validators. The completed validator contains the export; Vite observed the file during the
temporary zero-byte window created by an in-place `writeFile` and cached an empty transformed module.

## Requirements

- **FR-001**: Re-generating identical validator JS and declarations MUST leave existing files untouched.
- **FR-002**: Changed generated files MUST switch atomically from the previous complete bytes to the new complete bytes.
- **FR-003**: A failed replacement MUST preserve the old file and remove the temporary file.
- **FR-004**: Generated ESM exports, validator behavior, schemas, SceneDocument contracts, and package exports MUST remain
  unchanged.
- **FR-005**: The running Studio MUST remain loadable when contract generation overlaps Vite module reads.

## Success Criteria

- Unit tests prove the three generated-file write invariants.
- Standalone validator smoke, typecheck, unit, build, package, and documentation gates pass.
- Browser/runtime evidence shows the affected validator returns a complete ESM module and Studio opens without runtime
  errors.
