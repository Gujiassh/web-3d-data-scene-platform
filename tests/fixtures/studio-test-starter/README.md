# Studio Test Starter

This deterministic CC0 fixture preserves the pre-Feature-009 empty `Untitled Scene` behavior for browser tests. It is
selected only when `VITE_STARTER_DESCRIPTOR_PATH=/test-starter/descriptor.json`; production defaults continue to use the
smart-home starter path.

Regenerate the tracked descriptor and archive with:

```bash
node tests/fixtures/studio-test-starter/generate.mjs
```
