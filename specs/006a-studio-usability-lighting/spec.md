# Feature Specification: Studio Usability And Scene Lighting

**Feature ID**: `006A`

**Created**: 2026-07-16

**Status**: Approved on 2026-07-16; includes `SceneDocument 1.1.0 -> 1.2.0` and real stored-data migration

**Input**: Make everyday scene editing simple to discover and fast to operate by exposing keyboard
shortcuts, reset actions, smart alignment guides, scene-grid controls and an authored lighting workflow
without turning Studio into a modeling package.

## Product Outcome

An evaluator who has not read the repository can import an asset, discover the main controls, place and
straighten objects with visible snapping feedback, adjust the scene appearance and recover every change
through Undo. Frequent actions stay in the toolbar or Inspector; detailed values stay in one scene
settings dialog.

006A is a follow-up to the accepted Feature 006 layout foundation and is delivered in three ordered,
independently reviewed slices:

1. **006A.1 Command and discoverability**: transform command invariants, canonical shortcut registry,
   tooltips, Help, degree input and reset actions.
2. **006A.2 Smart alignment**: deterministic live-drag candidate selection, guides, local preference and
   fixed-step interaction.
3. **006A.3 Scene appearance**: grid UI, lighting contract/migration, settings preview and in-place Runtime
   reconciliation.

Feature 007 begins after 006A acceptance; 006A does not change hotspot or declarative-action ownership.

## Interaction Model

### Toolbar And Shortcuts

- Existing Select, Move, Rotate and Scale tools remain one stable icon group and expose `Q`, `W`, `E`
  and `R` in their tooltips and accessible descriptions.
- A pressed-state Magnet button sits next to the transform tools. It toggles Smart Align; `S` performs
  the same action.
- A Help icon remains available in Edit and Run. Clicking it or pressing `?` opens the shortcut help
  dialog.
- Shortcut help is searchable by localized command name or key and groups commands into Project,
  Selection, Transform, View and Help. Displayed modifiers use `Cmd` on macOS and `Ctrl` elsewhere.
- Scene shortcuts do not run while an input, textarea, select or editable element owns focus. Reset
  shortcuts additionally require an editable selected entity.
- Shortcut matching uses normalized `KeyboardEvent.key` and exact modifier combinations. A chord with an
  extra modifier is not a match. `Delete` deletes on every platform; macOS `Backspace` is the only alias.
- The topmost modal owns keyboard input. While a modal is open, global scene commands are inert except
  its documented `Esc` close behavior. Every handled chord prevents the browser default.
- During a transform drag, `Alt` is reserved solely for temporary snap bypass. Reset chords and all other
  scene mutations are ignored until the drag ends.

| Action                                      | Shortcut                                                                 |
| ------------------------------------------- | ------------------------------------------------------------------------ |
| Select / Move / Rotate / Scale              | `Q` / `W` / `E` / `R`                                                    |
| Toggle Smart Align                          | `S`                                                                      |
| Temporarily bypass snapping while dragging  | Hold `Alt`                                                               |
| Focus selection                             | `F`                                                                      |
| Reset local position / rotation / scale     | `Alt+G` / `Alt+R` / `Alt+S`                                              |
| Undo / Redo                                 | `Cmd/Ctrl+Z` / `Cmd/Ctrl+Shift+Z`; `Ctrl+Y` also redoes on Windows/Linux |
| Duplicate / Delete                          | `Cmd/Ctrl+D` / `Delete`                                                  |
| Save                                        | `Cmd/Ctrl+S`                                                             |
| Clear selection or close the topmost dialog | `Esc`                                                                    |
| Open shortcut help                          | `?`                                                                      |

Shortcut rebinding is not part of 006A.

### Transform And Reset

- Inspector exposes local Position, Rotation and Scale as three editable XYZ rows. Rotation is displayed
  and edited in degrees using intrinsic local `XYZ` order while the existing document continues to store
  a normalized quaternion. All three degree fields commit together from one authoritative draft.
- Each row ends with one reset icon: Position returns to local `[0, 0, 0]`, Rotation returns to the local
  identity rotation and Scale returns to local `[1, 1, 1]`.
- A Reset all command applies all three identities in one atomic operation. Reset means local identity;
  it does not mean restore the transform that existed when a model was imported.
- Reset, numeric edit and gizmo edit are unavailable in Run, on locked entities and on hidden entities.
  Hidden entities must be shown before transform editing.
- Position, Rotation, Scale and Reset all support one or more reduced selected roots. A component reset
  preserves every other TRS component byte-exactly. A mixed invalid or stale-before selection rejects the
  whole action.
- Visibility uses effective rendered visibility: a self-hidden entity or a descendant of a hidden
  ancestor cannot be transformed. Lock keeps the accepted local-edit meaning; a locked ancestor does not
  recursively lock an otherwise editable child.
- An unchanged reset is a true no-op: no document mutation, revision, history entry or autosave is
  produced.

### Smart Alignment Guides

Smart Alignment Guides provide edge/center alignment during translation. They are distinct from the
existing fixed Position, Angle and Scale steps and do not claim equal-gap or general presentation-layout
behavior.

- Smart Align is enabled by default and remembered as a local Studio preference. It is not part of a
  project, SceneDocument, JSON or ZIP.
- During translation, the primary moving entity's world-space bounds minimum, center and maximum are
  compared with every minimum, center and maximum anchor on other visible bounded entities and with the
  zero coordinate of each scene-origin axis. Interactive Smart Align moves only the current primary entity;
  authors group entities before moving a hierarchy as one object.
- The reference set excludes the moving entity, its ancestors, its descendants and every other selected
  root/descendant. Locked references remain eligible; hidden or null-bounds references do not.
- Candidate selection runs independently for each axis enabled by the active handle. An axis handle may
  snap one axis; a plane or free handle may snap one candidate on each enabled axis in the same preview.
- At the moving bounds center's positive camera-space depth `d`, one CSS pixel represents
  `2 * d * tan(fov / 2) / viewportCssHeight` world units. A candidate is eligible when the absolute
  axis-coordinate delta is no more than eight times that value. Invalid/behind-camera depth disables
  smart guides for that frame rather than guessing.
- Each enabled axis chooses the minimum lexicographic tuple: absolute world delta; entity target before
  scene origin; relation order `center-center`, `min-min`, `max-max`, `center-min`, `center-max`,
  `min-center`, `max-center`, `min-max`, `max-min`; deeper hierarchy before ancestor; stable entity ID.
  This depth rule makes an asset win over an enclosing Group when both expose the same bound coordinate.
- Object/scene-anchor Smart Align takes priority when active. If no smart candidate is active, an enabled
  fixed Position step may quantize the translation. Existing Angle and Scale steps keep their current
  independent meaning.
- Only axes affected by the active transform handle may snap. Locked entities may be reference targets;
  hidden entities and selected roots/descendants may not.
- While dragging, the viewport shows at most one axis-colored guide and paired anchor marks per enabled
  axis. Guides appear with the snapped preview before commit and disappear on release, cancel, selection
  change, mode change, superseded load or disposal.
- Holding `Alt` bypasses smart and fixed snapping only for the current drag. It does not change the saved
  local preference.
- Dynamic equal-gap placement, semantic connectors, mesh vertex/edge/surface snap and collision-aware
  placement remain outside 006A. Existing explicit Align, Distribute and bounds-anchor actions remain
  available for those deterministic layout tasks.

### Scene Settings

The existing Scene settings dialog becomes one flat two-tab dialog rather than a collection of nested
cards.

- **Appearance** retains theme/custom background controls and adds a Show grid switch backed by the
  existing authored grid field.
- **Lighting** starts with three presets whose concrete values are defined below. Selecting a preset writes
  those values; the preset name is not persisted as rendering meaning.
- The primary Lighting surface exposes preset selection, Fill brightness, Key brightness and nine
  direction choices: Standard plus eight compass directions at a fixed 45-degree elevation. It does not
  require XYZ coordinates or a 3D light gizmo.
- An Advanced disclosure exposes fill sky/ground colors and key color. Direction is saved as one
  normalized world-space `directionToLight` vector from the scene origin toward the light source; Runtime
  points its directional light from that source toward the scene origin.
- Preset values are fixed for 006A: Standard uses fill `#FFFFFF/#65706A` intensity `1.8` and key `#FFFFFF`
  intensity `2.2`; Soft uses fill `#FFFFFF/#84918B` intensity `2.0` and key `#FFF4E5` intensity `1.2`;
  Contrast uses fill `#DDE7E3/#3D4743` intensity `0.9` and key `#FFF1D6` intensity `3.0`. All use Standard
  direction `normalize([5, 10, 7])`.
- For compass directions, azimuth is clockwise from world `-Z` toward `+X` and elevation is 45 degrees.
  The canonical vector is
  `normalize([sin(azimuth) * cos(45deg), sin(45deg), -cos(azimuth) * cos(45deg)])` for N, NE, E, SE, S,
  SW, W and NW at 45-degree azimuth intervals.
- Every setting has live preview. Apply creates one atomic, undoable scene-environment command; Cancel or
  `Esc` restores the authored appearance without rebuilding the Canvas, Viewer, controls or data adapters.
- Run and published Viewer render the same authored appearance. Run may inspect but cannot mutate it.

006A intentionally provides one scene-wide fill/key rig. Imported punctual lights are reported during
asset inspection and are not silently activated in addition to the scene rig. Arbitrary point/spot light
entities, shadows, light gizmos, HDR environment imports and per-model material editing are not part of
this feature.

## User Scenarios & Testing

### User Story 1 - Discover And Use Editing Commands (Priority: P1)

A first-time author can identify the transform keys from tooltips or Help and switch tools without
searching project documentation.

**Acceptance Scenarios**:

1. **Given** Studio is open, **When** the author hovers or focuses a transform icon, **Then** its localized
   name and shortcut are exposed.
2. **Given** no text control owns focus, **When** the author presses `Q`, `W`, `E` or `R`, **Then** exactly
   one corresponding tool becomes active without changing the document.
3. **Given** the author presses `?`, **When** Help opens, **Then** all active shortcuts can be filtered by
   localized action or key and `Esc` returns focus to the Help trigger.

### User Story 2 - Straighten And Recover An Object (Priority: P1)

A scene author can enter an exact rotation in degrees, return position/rotation/scale to their local
identity values and undo the result.

**Acceptance Scenarios**:

1. **Given** one visible unlocked entity, **When** its XYZ rotation is edited, **Then** the visible result
   and stored normalized quaternion represent the entered degrees.
2. **Given** a rotated entity, **When** Rotation reset or `Alt+R` is invoked, **Then** local rotation becomes
   identity in one revision and one history entry.
3. **Given** a component is already at its identity value, **When** its reset is invoked, **Then** revision,
   history and autosave state remain unchanged.
4. **Given** the reset is undone, **Then** the exact previous transform is restored.

### User Story 3 - Place An Object With Smart Guides (Priority: P1)

A scene author drags an object near another object or the scene origin, sees a guide and receives a
predictable aligned result without entering coordinates.

**Acceptance Scenarios**:

1. **Given** Smart Align is on, **When** a moving bounds anchor enters the threshold of a visible reference
   anchor, **Then** the preview aligns and one matching guide is shown on the affected axis.
2. **Given** several candidates are near, **When** their distances tie, **Then** the same stable candidate
   wins across reloads and locale/theme changes.
3. **Given** the author holds `Alt`, **When** the same drag is repeated, **Then** no smart or fixed snap is
   applied and the master preference remains on for the next drag.
4. **Given** Smart Align is toggled off, **When** Studio is reopened in the same browser, **Then** the local
   preference remains off while exported project data remains byte-free of the preference.

### User Story 4 - Author Scene Appearance (Priority: P1)

A scene author can change background, grid visibility and a simple scene-wide lighting rig with live
preview, then apply, cancel, undo, reload and export it predictably.

**Acceptance Scenarios**:

1. **Given** Scene settings is open, **When** a lighting preset or control changes, **Then** the current
   Canvas previews it without rebuilding the Viewer.
2. **Given** preview changes exist, **When** Cancel or `Esc` is used, **Then** the exact authored appearance
   returns and document revision stays unchanged.
3. **Given** Apply is used, **Then** background/grid/lighting changes form one history entry and survive
   autosave, reload, JSON and ZIP round trips.
4. **Given** an existing 1.1 scene, **When** migration completes, **Then** its first rendered frame matches
   the current hard-coded light rig.

## Requirements

### Functional Requirements

- **FR-001**: Studio MUST expose active shortcuts in transform tooltips and one searchable bilingual Help
  dialog generated from the same command definitions used by keyboard resolution.
- **FR-002**: Shortcut resolution MUST use exact normalized-key/modifier matches, modal and active-drag
  priority, browser-default prevention and text-editing/Edit/Run gates defined by this specification.
- **FR-003**: Inspector MUST provide editable local XYZ degrees for rotation while persisting only the
  existing normalized quaternion representation.
- **FR-004**: Position, Rotation, Scale and Reset all MUST use explicit local identity values and MUST be
  atomic, undoable and no-op when unchanged.
- **FR-005**: Single-entity and batch transform command boundaries MUST reject non-finite TRS and
  non-positive scale regardless of caller.
- **FR-006**: A rejected Inspector transform MUST restore the last authoritative value rather than leave
  an unsaved invalid draft visible.
- **FR-007**: Smart Align MUST have a toolbar switch, `S` shortcut, local preference persistence and a
  hold-`Alt` temporary bypass.
- **FR-008**: Translation Smart Align MUST compare world-bounds min/center/max anchors against the explicit
  reference set and scene-origin axes using the specified camera-relative eight-pixel formula.
- **FR-009**: Smart candidate selection MUST use the specified per-axis lexicographic oracle and MUST never
  use mutable names, document order or first-available fallback.
- **FR-010**: Smart Align MUST provide transient guides before commit and MUST clear them on every drag end,
  cancellation, selection change, mode change, superseded load and disposal path.
- **FR-011**: Existing Position, Angle and Scale steps MUST remain optional editor settings and MUST NOT be
  conflated with the new smart-guide switch.
- **FR-012**: Scene settings MUST expose the existing authored grid visibility without adding a new grid
  field or persisting editor snap preferences.
- **FR-013**: Scene settings MUST provide Standard, Soft and Contrast lighting presets, live preview,
  simple brightness/direction controls and advanced fill/key controls.
- **FR-014**: Presets MUST resolve to concrete authored values; Runtime MUST NOT interpret a persisted
  preset name whose future definition could change rendering.
- **FR-015**: Imported punctual lights MUST be reported during asset inspection and MUST NOT silently
  combine with the authored scene rig.
- **FR-016**: Apply MUST create one validated scene-environment command; Cancel MUST produce no document,
  revision, history or autosave change.
- **FR-017**: Edit, Run and Viewer MUST resolve the same authored environment without recreating the
  Canvas, Viewer, transform controls, adapters or data-runtime state when appearance changes.
- **FR-018**: Lighting persistence MUST NOT be implemented until the proposed SceneDocument version and
  migration are explicitly approved.

### Non-Functional Requirements

- **NFR-001**: A first-time evaluator MUST be able to find a requested transform shortcut through a
  tooltip or Help in under 15 seconds.
- **NFR-002**: Smart-guide feedback MUST update in the same visual frame as the transform preview and MUST
  not add a second document command during one drag.
- **NFR-003**: Fixed-scene candidate selection MUST remain responsive with 500 bounded entities; a
  repeatable benchmark and threshold are defined during planning.
- **NFR-004**: Chinese/English and light/dark layouts at 1280x720 and 1440x900 MUST have no toolbar,
  dialog, Inspector or Canvas overlap and no shortcut label clipping.
- **NFR-005**: Keyboard-only users MUST be able to open, search and close Help and Scene settings with
  visible focus, focus trap and trigger restoration.
- **NFR-006**: Document, archive and ProjectRecord scans MUST find zero Help, shortcut, active tool,
  smart-align, guide, candidate or preview state.

## Approved Data Contract Change

Lighting is authored scene meaning and must render identically after reload/export. It therefore cannot
be a front-end-only preference.

The proposed change upgrades `SceneDocument 1.1.0` to `1.2.0` and adds one required
`environment.lighting` object:

```ts
interface SceneLighting {
  fill: {
    skyColor: string;
    groundColor: string;
    intensity: number;
  };
  key: {
    color: string;
    intensity: number;
    directionToLight: Vec3;
  };
}
```

Contract rules:

- Colors are authored as canonical uppercase `#RRGGBB`; intensities are finite in `[0, 5]`;
  `directionToLight` is a finite unit vector within `1e-6` length tolerance. Legacy migration and controlled
  Studio inputs may canonicalize at their own boundary. Document commands strictly validate exact canonical
  before/after snapshots and never repair or normalize caller input.
- Current hard-coded lighting migrates to fill `#FFFFFF/#65706A` intensity `1.8`, key `#FFFFFF`
  intensity `2.2` and `directionToLight = normalize([5, 10, 7])`. Runtime places its directional source on
  this ray and targets the scene origin, preserving the current light direction without persisting an
  irrelevant source distance.
- Immutable 1.0 and 1.1 schemas and validators remain available only for import/migration. Parsing reads
  the raw version, validates that version's structure and complete semantics before migration, migrates
  `1.0 -> 1.1 -> 1.2` or `1.1 -> 1.2`, then validates current 1.2 structure and semantics again.
- Every migration preserves all pre-existing fields and the document revision. Current validation, save
  and export accept only 1.2. JSON/ZIP import may accept valid 1.0/1.1 input but returns and stores only
  current 1.2.
- IndexedDB initialization scans every project record in one readwrite transaction before repository
  operations resolve. Every changed `documentJson` is rewritten while all eight ProjectRecord keys,
  metadata, timestamps, revisions, store contents and DB version remain otherwise unchanged. One invalid
  record aborts and rolls back the complete transaction; migration never creates history, Undo or autosave
  events.
- `ProjectRecord` keys, IndexedDB version/store topology, archive container version, asset bytes and save
  semantics do not change. The archive manifest's supported scene-schema versions expand truthfully.
- `environment.grid` remains the existing boolean. Smart-align settings remain local editor preferences
  and never enter SceneDocument.

The user's 2026-07-16 approval authorizes this exact 1.1-to-1.2 migration boundary. Any later move to
arbitrary light entities, HDR environments or additional persistent settings requires a separate contract
decision.

## Dependencies And Risks

- The existing single-entity transform command does not currently enforce the same positive-scale and
  no-op invariants as the batch command. That boundary is repaired and tested before reset UI is added.
- Smart alignment is a live-drag computation. Candidate indexing and deterministic filtering must be
  measured against the fixed 500-entity scene before acceptance.
- Imported punctual lights currently have no explicit platform policy. 006A must detect them during
  inspection and exclude them from the scene rig instead of allowing an invisible double-lighting path.
- Editable Euler degrees are a UI projection only. Conversion must define one stable XYZ order and avoid
  leaking Euler values into persistence.
- Imported asset lights and arbitrary point/spot authoring are not controlled by the 006A scene-wide rig
  and are not inferred from model names.

## Non-Goals

- Custom shortcut bindings, command palette execution or keyboard macros.
- World/local transform mode switching, custom pivots or restoring an unpersisted import-time transform.
- Dynamic equal-spacing guides, geometry/vertex/surface snap, collision placement or semantic connectors.
- Arbitrary light entities, point/spot light placement, shadows, light gizmos, HDRI import, tone mapping,
  exposure or material editing.
- Modeling, physics, animation authoring or game-engine behavior.

## Success Criteria

- **SC-001**: A first-time evaluator completes tool selection, one smart-aligned move, rotation reset and
  Undo without external documentation in under two minutes.
- **SC-002**: One hundred percent of accepted reset operations create exactly one revision/history entry,
  while unchanged, locked, hidden, invalid and Run-mode requests create none.
- **SC-003**: Fixed smart-align drags choose the expected stable candidate and committed transform across
  reload, locale/theme changes and repeated runs.
- **SC-004**: Help and every toolbar tool expose the same shortcut definitions with zero missing or stale
  localized entries.
- **SC-005**: Existing migrated projects render the same baseline lighting on the first ready frame, and
  accepted lighting/grid changes deep-equal after IndexedDB, JSON and ZIP round trips.
- **SC-006**: Runtime verification retains one Canvas/Viewer/controls/adapters instance through snap,
  preview, Apply, Cancel, Undo, theme and Edit/Run cycles.
