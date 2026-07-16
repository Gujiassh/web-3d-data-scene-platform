# Data Model: Studio Usability And Scene Lighting

## Persistent SceneDocument 1.2.0

### SceneEnvironment

| Field            | Type            | Meaning                                   |
| ---------------- | --------------- | ----------------------------------------- |
| `backgroundMode` | `"theme"        | "custom"`                                 | Existing background resolution mode |
| `background`     | `#RRGGBB`       | Existing authored/fallback background     |
| `grid`           | `boolean`       | Existing authored grid visibility         |
| `unit`           | `"mm"           | "cm"                                      | "m"`                                | Existing scene unit |
| `upAxis`         | `"Y"`           | Existing scene up axis                    |
| `lighting`       | `SceneLighting` | Required scene-wide concrete fill/key rig |

### SceneLighting

| Field                  | Type      | Validation                                  |
| ---------------------- | --------- | ------------------------------------------- |
| `fill.skyColor`        | `#RRGGBB` | required                                    |
| `fill.groundColor`     | `#RRGGBB` | required                                    |
| `fill.intensity`       | number    | finite, `0 <= value <= 5`                   |
| `key.color`            | `#RRGGBB` | required                                    |
| `key.intensity`        | number    | finite, `0 <= value <= 5`                   |
| `key.directionToLight` | `Vec3`    | finite unit vector, length tolerance `1e-6` |

Presets are not persisted. The document stores only concrete values.

## Legacy Migration States

| Input | Precondition                             | Output                                        |
| ----- | ---------------------------------------- | --------------------------------------------- |
| 1.0.0 | frozen 1.0 structure and semantics valid | add `backgroundMode: "custom"`, then continue |
| 1.1.0 | frozen 1.1 structure and semantics valid | add Standard concrete lighting                |
| 1.2.0 | current structure and semantics valid    | unchanged current document                    |

Every output is revalidated as current 1.2. Migration preserves document ID, name, revision, arrays,
environment fields and unknown-by-contract rejection. IndexedDB writes all changed project JSON in one
transaction or writes none.

## Existing Persistent Transform

`SceneEntity.transform` remains `{ position: Vec3, rotation: Quat, scale: Vec3 }`. Rotation degree inputs
are transient projections. Position/Rotation/Scale reset changes only the selected component; Reset all
uses position `[0,0,0]`, rotation `[0,0,0,1]` and scale `[1,1,1]`.

## Transient Models

### StudioCommandDefinition

- stable command ID and category
- exact platform chord descriptors
- localized label/description keys
- Edit/Run and selection capability
- Help visibility

### SmartAlignPreference

- versioned local key
- `enabled: boolean`, default `true`
- never enters SceneDocument, ProjectRecord or archive

### SmartAlignCandidate

- active world axis
- moving anchor and reference anchor
- reference entity ID or scene-origin sentinel
- world delta and camera-derived threshold
- hierarchy depth and deterministic relation rank
- transient guide endpoints

### SceneAppearanceDraft

- background mode/color, grid and concrete lighting draft
- preview-only until one Apply command
- discarded on Cancel, project change, mode mutation gate or superseded load
