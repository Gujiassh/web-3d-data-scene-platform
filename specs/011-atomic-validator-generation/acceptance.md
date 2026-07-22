# Acceptance: Atomic Validator Generation

## Status

In progress.

## Semantic Oracle

Validator source bytes and behavior remain deterministic. Generation no longer exposes partial target files to Vite:
unchanged output leaves the target untouched, changed output appears through one atomic rename, and replacement failure
leaves the prior complete target intact.

## Delivery Lineage

- Source and repair branch: `main`.
- Starting ref: `origin/main@714ce79341f3772cac9cd05e4385b31a7cc4d995`.
- Symptom: opening the running Studio failed because a generated validator module did not provide its default export.
- Root cause: in-place generation temporarily truncated the imported module; Vite cached that partial read under the
  browser's timestamped URL.
- Changed scope: validator generation file writes, focused regression coverage, test discovery, release documentation
  audit, and Feature 011 SSoT only.
- Frozen scope: generated validator bytes, schemas, SceneDocument/save/archive contracts, package manifests/exports, and
  smart-home assets.
- Delivery target: `origin/main`; no downstream merge or cherry-pick is required.

## Reproduction Evidence

- The completed `scene-document-1.2.validator.js` contains `export default validate20` and is 627324 bytes.
- The running Vite server returned a 195-byte empty source-map module for the cached timestamp URL from the browser error.
- A fresh query returned the complete module, proving the failure was a cached partial read rather than a missing export
  in generated source.

## Verification

### Implemented locally

- `writeGeneratedFile` skips identical content and writes changed content to a unique same-directory temporary file,
  syncs it, and atomically renames it over the target. Failed replacement removes the temporary file and preserves the
  previous target.
- All generated validator JS and declarations use the same helper. No generated source file changed.
- Unit tests cover unchanged content, changed content, and failed replacement: 3/3 passed.
- The existing standalone smoke imported default exports for all five validators and validated current plus migrated
  fixtures.
- Twenty concurrent generation passes overlapped 250 fresh Vite module requests. Every response was over 600000 bytes
  and contained `export default validate20`; no response exposed a partial module.
- Before and after repeated generation, typecheck, build, and package verification, every generated file retained the
  same inode, mtime, and SHA-256.
- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` passed. Vitest covered 125 files / 792
  tests.
- `pnpm verify:docs`, `pnpm verify:i18n`, `pnpm verify:assets`, `pnpm verify:design`, `pnpm verify:topology`, and
  `pnpm verify:packages` passed. The four package tarball hashes are unchanged from Feature 010.
- After restarting Studio, the exact timestamped URL from the reported error returned 627316 bytes and both named and
  default exports. The browser loaded `90 m2 Smart Home | SceneWeave 场景编辑器`, rendered the nonblank smart-home scene,
  and showed no module/SyntaxError text. Running contract generation while the page was open and then refreshing kept
  the same healthy result.

### Pending

- Commit, push, local/upstream/remote SHA parity, and final GitHub Actions CI.
