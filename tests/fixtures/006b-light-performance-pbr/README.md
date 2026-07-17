# Feature 006B PBR Performance Fixture

This directory owns the deterministic lit PBR fixture for Feature 006B punctual-light performance acceptance.
It complements the existing 006 MeshBasicMaterial fixture: 006 measures controller, generation, and identity
overhead, while this fixture exercises real punctual-light fragment shading through `MeshStandardMaterial`.

## Frozen Shape

- SceneDocument: current `1.3.0`, with zero authored punctual lights in the base state.
- Asset: 10 rendered cube instances, 4 bounded PBR material variants, 120 rendered triangles.
- Scale: world bounds `[-4, -0.15, -3]` to `[4, 2.2, 3]` meters.
- Camera: position `[7.5, 5.5, 8.5]`, target `[0, 0.75, 0]`, FOV `42`.
- Baseline: the accepted Hemisphere fill and Directional key rig remains unchanged.
- Performance states: zero, Point `25`, Spot `10`, and eight-light `4 Point + 4 Spot`.

The fixture has no visual business-meaning oracle. Colors, materials, and geometry exist only to provide stable,
bounded shader cost. It must not be imported into ProjectRecords or treated as JSON/ZIP persistence data.

## Regeneration

```bash
node tests/fixtures/006b-light-performance-pbr/scripts/generate-fixture.mjs
```

The accepted GLB is 3200 bytes with SHA-256
`9a0dcc3641f98f5f6ac9efa8993f3d103228c6a170b0fc36b6ca75a1eb6b901d`. Regeneration must preserve the byte length,
hash, manifest, fixed camera, scene bounds, material count, and current SceneDocument unless the performance contract
is deliberately revised.

Final production-path Chromium execution, serial event sampling, warm-up/measured counts, and p95 acceptance remain
owned by T033/CHK038 and are intentionally not run by this fixture lane.

The generated GLB is released under CC0-1.0. Generator source follows the repository MIT license.

## Integrity Checks

```bash
stat -c '%s %n' tests/fixtures/006b-light-performance-pbr/public/006b-light-performance-pbr.glb
sha256sum tests/fixtures/006b-light-performance-pbr/public/006b-light-performance-pbr.glb
node tests/fixtures/006b-light-performance-pbr/scripts/generate-fixture.mjs
pnpm exec prettier --check tests/fixtures/006b-light-performance-pbr
```
