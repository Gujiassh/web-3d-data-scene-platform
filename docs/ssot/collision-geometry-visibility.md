# Collision Geometry Visibility

> Status: In verification
> Updated: 2026-07-22

SceneWeave supports glTF assets that separate visible geometry from collision and picking geometry through a strict
node contract. The runtime hides only collision geometry proven by that complete contract; a loose name match is not
sufficient.

## Recognition Contract

After `GLTFLoader` parsing and formal node-index collection, an asset is recognized only when its formal glTF nodes
contain exactly one node named `ROOT`, exactly one named `VISUAL`, and exactly one named `COLLISION`. Both `VISUAL` and
`COLLISION` must be descendants of that same `ROOT` node. They may be nested below state or motion nodes and do not need
to be direct siblings, but neither may be an ancestor of the other.

When the contract is recognized, the runtime sets the exact `COLLISION` root to `visible = false`. It does not change
descendant visibility or detach, clone, replace, rename, or dispose any collision object. Assets with missing,
duplicate, or structurally unrelated contract nodes keep their authored visibility.

The recognized collision root is also carried into runtime target state as a hidden-visibility lock. A `SceneTarget`
may still resolve that formal node index for picking or other non-rendering uses, but a runtime `visibility: true` rule
effect cannot make the collision subtree render. Ordinary authored hidden targets remain visibility-controllable.

Only formal glTF nodes proven by parser associations participate in recognition. Runtime attachments or primitive
objects that merely reuse a contract name cannot activate the behavior.

## Frozen Invariants

- `SceneDocument`, schemas, save behavior, archives, published packages, and asset resolver behavior are unchanged.
- Source asset bytes, byte lengths, SHA-256 hashes, materials, transforms, animations, and hierarchy are unchanged.
- Formal target/node indexes and `nodesByIndex` / `nodeIndexByObject` mappings are unchanged.
- `VISUAL` remains renderable and only the recognized `COLLISION` subtree is skipped by the renderer.
- Collision objects remain available to explicit Three.js raycasts and existing picking flows.
- Runtime visibility effects cannot re-enable the recognized `COLLISION` root.

## Verification

Loader tests must cover direct and nested valid contracts, preserved visual geometry, formal maps and hierarchy,
raycasting through the invisible collision root, and rejection of incomplete, cross-root, duplicate-name, or nested
visual/collision shapes. Runtime target tests must prove a visibility rule cannot re-enable the recognized collision
root. Browser acceptance must reload an already-imported smart-home project without changing its document or asset
bytes and show that the moving-camera black-line interference is removed.
