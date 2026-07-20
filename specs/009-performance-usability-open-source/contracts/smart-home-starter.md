# Smart-Home Starter Contract

## Source

- Owner-provided source root: `/mnt/e/data/model/smart_home_90sqm`.
- Registry: `00_specs/asset_registry.json`, versioned independently from this repository.
- Audited snapshot at 2026-07-20 15:10 CST: 55 registered families, 39 manifests and 39 GLBs. Manifest QA reports 38
  `SHIP` plus one `NO-SHIP` smart toilet, while `production_status.md` calls the same smart toilet `SHIP`; it is excluded
  until those sources agree and all hash-bound gates replay.
- Delivered manifest totals: 13,654,936 bytes and 286,534 declared triangles before starter selection.
- Snapshot hashes: registry `d05619974d36c0be5ec8d47dc41ed11dfe15197f671f5628ec8009aca1692606`, production
  status `bac931c67ecbe394525c71233a6f71be5e4ce170aceb6622079cf818d317a958`, floorplan
  `11acb6ad855f243f62211ef58b9c7b99f64a08ac09bb9a797159d272e41f8f9d`, sorted manifest digest
  `3da7f1a4f58fffc8d5828717da9d0fc292bc77941177bc5298e852847d20af01`.

The source registry is 2,107 lines and should be split by category with a generated root index in its own asset project.
Feature 009 does not edit that external source and instead consumes a small explicit allowlist.

## Distribution Gate

The Owner authorized importing these resources as default project assets on 2026-07-20. Public redistribution still
requires an explicit license statement identifying the copyright owner, license text and covered hashes. Until that
record exists, generated starter bytes may be used for local validation but MUST NOT be committed, deployed or released.

## Required Starter Coverage

- Architecture: `home_shell` plus exact door/window instances.
- Living/dining: sofa, coffee table, dining table/chairs, TV console and smart TV.
- Bedrooms/work: beds, wardrobe, bedside table, desk and office chair as space permits.
- Kitchen/bath/utility: cabinet and selected SHIP appliances; `smart_toilet` is excluded while `NO-SHIP`.
- Smart devices: ceiling light, wall air conditioner, curtain, door lock, wall switch, control panel and video doorbell.
- Cleaning: robot vacuum and dock.

## Persisted Boundary

The starter is one ordinary SceneDocument 1.4 archive:

- one SceneAsset per unique GLB hash;
- AssetEntity instances with explicit transforms and hierarchy;
- stable SceneTargets bound through an explicit `assetHash + semanticTargetId -> nodeIndex` map; node names only assert
  that the mapped node is the expected authored target and never select the index;
- one Mock source plus ordinary Bindings/RuleSets;
- authored SceneViews and current SceneEnvironment;
- no room schema, asset capability manifest, live value, connection or alarm instance.

## Runtime State Story

- `normal`: online devices use ready/healthy colors and no alarms;
- `offline`: one climate/security channel carries an application-level `offline` value while the source remains online;
- `alarm`: one access or appliance target produces visible critical state and alarm copy.

The exact Mock payload contract and Target/pointer map are frozen by the generator fixture. Device state semantics are
reference content only; the platform core remains domain-neutral.

## Bootstrap

Only a repository with zero projects invokes the dedicated domain-neutral `starter-bootstrap` service for the versioned
archive. That service owns fetch, content-hash verification, archive import, cancellation and construction of one ordinary
repository snapshot. Workspace initialization only persists the completed snapshot. Existing databases are untouched.
Explicit New Scene remains empty. Failure creates no partial project and exposes one actionable diagnostic.
