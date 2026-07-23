# Collision Geometry Visibility

> Status: Accepted
> Updated: 2026-07-23

SceneWeave supports glTF assets that separate visible geometry from collision and picking geometry through a strict
node contract. The runtime hides only collision geometry proven by that complete contract; a loose name match is not
sufficient. Within the same proven contract, the runtime also resolves proven duplicate or highly covered coplanar
visual faces without modifying the source asset.

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

## Coplanar Visual Face Contract

Coplanar resolution is restricted to rigid meshes inside the exact recognized `VISUAL` subtree. The runtime compares
triangles in stable traversal and face order after applying node transforms. Plane normals, plane distance, and exact
vertices use a fixed `1e-6` glTF-unit canonical precision. An animated-ancestor signature prevents faces that can move
independently from being compared.

A later triangle is assigned to an invisible render material only when it belongs to a different formal node and has
the same material instance, cyclic winding, animated-ancestor signature, and canonical vertices as an earlier
triangle. After exact duplicates are removed, a later triangle is assigned its original material cloned with positive
`polygonOffset` only when an earlier triangle on the same canonical plane covers at least 95 percent of its projected
area. The coverage path intentionally accepts different triangulation, material, and winding: it preserves the later
face's color and visibility while making depth ordering deterministic. A stable predecessor graph assigns offset
priorities `1..n` when more than two layers overlap. A projected-bounds sweep excludes spatially disjoint triangles
before polygon clipping without changing traversal priority.

The runtime does not delete or reorder vertices or indexes. It clones only affected runtime geometry and uses material
groups `0` for the authored material, `1` for an invisible exact duplicate, and `2` for a locally offset coplanar face.
Three.js raycasting still evaluates every source triangle, so original `faceIndex` values remain available. Different
animation ancestry, planes outside the canonical precision, coverage below 95 percent, same-node overlap, and
edge-only contact remain unchanged. Skinned, instanced, batched, morph-target, pre-grouped, partial-draw, malformed,
and non-triangle geometry fail closed.

## Default Smart-Home Layout

Runtime face resolution is asset-local and never guesses how independently placed scene entities should move. The
default smart-home layout therefore owns cross-entity clearance. The master-bedroom wardrobe is 2.40 m high; the wall
air conditioner center is authored at `y=2.57`, so its 0.30 m body starts at `y=2.42` and leaves a 0.02 m gap. The
previous `y=2.25` placement put the air-conditioner intake slats and wardrobe top at the same depth.

The visible kitchen assembly also uses explicit millimeter-scale plane separation. The cabinet moves 0.01 m away from
the presentation-shell partition; the sink/faucet rises 0.005 m above the countertop; the dishwasher moves 0.006 m up
and 0.01 m forward; and the cooktop moves 0.01 m forward. A world-space triangle sweep includes all 44 visible assets,
including the contract-free generated presentation shell, and reports no non-ground coplanar entity pairs. Furniture
bottoms touching room floors remain intentional ground contacts.

Changing this explicit starter position changes generated SceneDocument/archive bytes but not the document schema,
save behavior, or any source asset byte/hash. Existing user-authored projects are not silently migrated; their entity
placement remains user data.

## Frozen Invariants

- `SceneDocument` schemas, save behavior, published package contracts, and asset resolver behavior are unchanged.
- Source asset bytes, byte lengths, SHA-256 hashes, materials, node transforms, animations, and hierarchy are unchanged.
- Formal target/node indexes and `nodesByIndex` / `nodeIndexByObject` mappings are unchanged.
- `VISUAL` remains renderable and only the recognized `COLLISION` subtree is skipped by the renderer.
- Collision objects remain available to explicit Three.js raycasts and existing picking flows.
- Runtime visibility effects cannot re-enable the recognized `COLLISION` root.
- Qualifying duplicate visual faces contribute one rendered surface while retaining source index order and raycasts.
- Qualifying high-coverage coplanar faces retain their material/color and raycasts with deterministic depth priority.
- The generated default starter changes only `master-ac`, `kitchen-cabinet`, `kitchen-faucet`,
  `kitchen-dishwasher`, and `kitchen-cooktop` positions; asset hashes remain frozen.
- Runtime-only geometry/material clones are disposed without disposing resources still referenced by another mesh.

## Verification

Loader tests must cover direct and nested valid contracts, preserved visual geometry, formal maps and hierarchy,
raycasting through the invisible collision root, and rejection of incomplete, cross-root, duplicate-name, or nested
visual/collision shapes. Runtime target tests must prove a visibility rule cannot re-enable the recognized collision
root. Coplanar-visual tests must prove exact suppression, different-triangulation coverage, the 95 percent boundary,
stable multi-layer priority, unchanged indexes and `faceIndex`, raycast availability, and shared-resource lifecycle.
The starter contract test must prove at least 0.02 m master air-conditioner/wardrobe clearance and at least 0.005 m
separation for audited visible kitchen planes. Browser acceptance must cover both an existing project with the explicit
placement correction and a fresh generated starter while retaining all source asset bytes and hashes.
