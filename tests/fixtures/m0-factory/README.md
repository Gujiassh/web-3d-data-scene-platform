# M0 Factory Fixture

This directory contains the deterministic M0 GLB, SceneDocument, node manifest, generator, and CC0
license used by document, runtime, archive, Studio, and browser tests. Factory names inside the fixture
are stable test data, not a product application boundary.

```bash
node tests/fixtures/m0-factory/scripts/generate-m0-asset.mjs
```

Regeneration is an explicit fixture update. The accepted GLB is 1216 bytes with SHA-256
`e123f3d64ec60f136d8673478eb2fd2ce28f56bcb5fb94cef5a7377b9605efe8`; ordinary path or topology
changes must preserve it. Generated GLB files are released under CC0-1.0. Generator source uses the
repository's MIT license.
