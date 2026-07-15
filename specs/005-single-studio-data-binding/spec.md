# Feature Specification: Single Studio Data Binding

**Feature Branch**: `005-single-studio-data-binding`

**Created**: 2026-07-15

**Status**: Implemented and Accepted

**Input**: Replan the product around one Studio application and deliver the first complete data-driven
scene workflow.

## User Scenarios & Testing

### User Story 1 - Use One Coherent Product (Priority: P1)

A user opens one Studio application to edit and run a scene. They do not need to understand or launch a
separate factory demonstration application.

**Why this priority**: Two visible applications make the product purpose and workflow unclear. The
portfolio experience needs one primary product and one continuous path.

**Independent Test**: Start the project, open the documented application URL, and complete both Edit
and Run workflows without launching a second frontend.

**Acceptance Scenarios**:

1. **Given** the repository is installed, **When** the user starts development, **Then** one Studio
   application is served as the product entry point.
2. **Given** a scene is open, **When** the user changes between Edit and Run, **Then** the same project,
   scene and selection remain active.
3. **Given** legacy factory demonstration code, **When** the single-product migration completes,
   **Then** no second user-facing application or port is required.

---

### User Story 2 - Map A Scene Object To Business Data (Priority: P1)

A user selects an imported scene object, assigns a stable business ID, adds a mock data source and
chooses a data field to bind to the object.

**Why this priority**: Business mapping is the point where the editor stops being a generic model
placement tool and becomes a data-scene authoring product.

**Independent Test**: Starting from one imported model, select its scene object, assign a business ID,
create a mock source, choose its status field and confirm all mapping information survives reload.

**Acceptance Scenarios**:

1. **Given** a selected imported object, **When** the user opens its data configuration, **Then** the
   associated target and current business ID are visible.
2. **Given** a valid business ID, **When** the user saves it, **Then** it is stored on the selected target
   as a normal undoable scene edit.
3. **Given** no data source, **When** the user creates the initial mock source, **Then** its name, scenario
   and connection thresholds are stored in the scene.
4. **Given** the mock source is available, **When** the user inspects its sample data, **Then** bindable
   fields are shown as stable paths and one can be selected without manually typing an ambiguous path.
5. **Given** a selected target, source and field, **When** the user confirms a binding, **Then** the
   binding is persisted and remains associated with the same stable IDs after reload and archive
   round-trip.

---

### User Story 3 - Configure Visual State Rules (Priority: P1)

A user configures status values so the bound object changes color and optionally creates an alarm.

**Why this priority**: A binding without a visible result does not demonstrate product value.

**Independent Test**: Configure at least three status rows, preview each input and confirm the object
color and alarm output match the authored rules.

**Acceptance Scenarios**:

1. **Given** a binding, **When** the user opens its rules, **Then** existing conditions, colors and alarm
   settings are presented in editable rows.
2. **Given** a status value and color, **When** the user confirms the rule, **Then** it is saved in a
   deterministic rule set connected to the binding.
3. **Given** an alarm-enabled rule, **When** its status value is active in Run mode, **Then** an alarm
   with the configured level and message is visible.
4. **Given** an unchanged or invalid rule form, **When** the user submits, **Then** no partial document
   edit or invalid history entry is created.

---

### User Story 4 - Preview Live Behavior In Studio (Priority: P1)

A user switches to Run mode and sees the mock source update the same scene, including connection state,
current bound value, object color and active alarms.

**Why this priority**: Edit and Run must form one closed workflow before more layout or interaction
features are added.

**Independent Test**: Author one mapping and rule set, enter Run, exercise the mock status sequence and
confirm the expected visual and operational state without changing persistent authoring data.

**Acceptance Scenarios**:

1. **Given** a valid configured binding, **When** Run mode starts, **Then** the source connection and
   current bound value become observable in Studio.
2. **Given** successive mock values, **When** each value is applied, **Then** the matching color and alarm
   result appear within 100 milliseconds of the accepted runtime update.
3. **Given** Run mode is active, **When** telemetry, connection, alarm or runtime selection changes,
   **Then** no runtime-only value is written into the scene document or command history.
4. **Given** the user returns to Edit mode, **When** runtime preview stops, **Then** authored mappings and
   rules remain while transient connection, value and alarm state is cleared.

### Edge Cases

- Data authoring actions are disabled in Run mode.
- A scene object without an associated target clearly explains that this slice only supports imported
  asset roots; arbitrary model-node target authoring is deferred.
- Blank or overlong business IDs, source names and rule values are rejected before document mutation.
  Studio authoring limits a string equality-rule value to 160 characters after trimming; this is a
  form/command boundary and does not change the SceneDocument schema or legacy document load semantics.
- A binding cannot reference a missing target, source or rule set.
- One target effect type cannot have multiple enabled writers with undefined precedence.
- Deleting or undoing a source, binding or rule updates the panels without leaving a selected dangling
  configuration.
- Switching locale or theme does not restart the preview or change the configured document.
- Opening a legacy scene that already contains targets, data sources, bindings and rule sets presents
  those values without migration or guessing.
- Mock preview failure or a rule error is reported in Diagnostics and preserves the last valid document.

## Requirements

### Functional Requirements

- **FR-001**: The product MUST expose Studio as its only user-facing frontend and development entry.
- **FR-002**: Edit and Run MUST operate on the same active project and SceneDocument.
- **FR-003**: The selected imported asset entity MUST expose its associated target and editable business
  ID without deriving identity from display names or traversal order.
- **FR-004**: Business ID changes MUST be validated, undoable, redoable, revisioned and autosaved as
  persistent document edits.
- **FR-005**: The user MUST be able to create and edit one or more mock data sources using the existing
  scene data-source semantics.
- **FR-006**: Studio MUST present a deterministic sample-data field list and stable field paths for the
  selected source.
- **FR-007**: The user MUST be able to create, enable, disable and remove a binding between one target,
  one source path and one rule set.
- **FR-008**: The user MUST be able to author ordered equality rules that map status values to color and
  optional alarm effects.
- **FR-009**: Rule editing MUST preserve deterministic priority and reject conflicting enabled writers.
- **FR-010**: All persistent target, source, binding and rule changes MUST use the existing document
  command/history boundary and preserve monotonic revision semantics.
- **FR-011**: Run mode MUST start the configured mock source and apply its accepted values through the
  existing runtime binding/rule/effect pipeline.
- **FR-012**: Studio Run MUST display source connection, current bound value, active alarms and relevant
  diagnostics in host UI outside the SceneDocument.
- **FR-013**: Runtime color, connection, current value, alarm and selection state MUST NOT be written into
  SceneDocument, project metadata, archive content or command history.
- **FR-014**: Returning to Edit MUST stop preview adapters and clear transient runtime state without
  changing authored configuration.
- **FR-015**: Configured business IDs, sources, bindings and rules MUST survive local reload and JSON/ZIP
  round-trip without ID or meaning changes.
- **FR-016**: All new controls, states, errors, accessible names and tooltips MUST support English and
  Simplified Chinese and both interface themes.
- **FR-017**: The independent Factory Demo application and its separate development port MUST be removed
  after required generic runtime behavior is represented in Studio and automated tests.
- **FR-018**: This feature MUST preserve the existing `SceneDocument 1.0.0` field and archive shapes.

### Non-Functional Requirements

- **NFR-001**: An accepted mock update MUST produce its visible color/alarm result within 100 milliseconds
  in the fixed acceptance scene.
- **NFR-002**: Run/Edit cycles and locale/theme changes MUST NOT create duplicate adapters, timers,
  listeners or Viewer instances.
- **NFR-003**: Studio at 1280x720 and 1440x900 MUST have no page overflow, clipped primary commands or
  incoherent panel overlap in Edit or Run.
- **NFR-004**: Persistent authoring state and transient runtime state MUST have separate typed ownership
  and lifecycle boundaries.
- **NFR-005**: No source credential, endpoint secret, runtime payload or active alarm may enter exported
  scene data or diagnostic output.
- **NFR-006**: Removing the independent demo MUST leave one documented development command, one product
  URL and no dead package/script/reference.

### Key Entities

- **Target**: Stable mapping from a scene asset entity or model node to an optional business ID.
- **Data Source**: Persistent logical description of the selected mock scenario and health thresholds.
- **Binding**: Persistent connection from a target and source field path to a rule set and written effect
  types.
- **Rule Set**: Ordered deterministic conditions and color/alarm effects plus fallback behavior.
- **Runtime Preview State**: Transient connection, current value, alarm and diagnostic state owned by the
  active Run session.

## Assumptions

- The first vertical slice authors bindings for the existing target created with each imported asset
  root; model-node target creation is a later expansion.
- The first source UI supports the existing mock adapter. WebSocket configuration follows after the
  mock authoring loop is accepted.
- Data fields are selected from a deterministic sample payload; free-form JSON Pointer entry may remain
  available only as a validated advanced control.
- Rule authoring initially supports equality conditions, color effects and optional alarm effects. Other
  existing effect/operator types remain readable and preserved but are not all editable in this slice.
- Advanced scene layout, snapping, grouping/reparenting, exact surface hotspots and persisted arbitrary
  click actions are outside this feature.
- Runtime and React packages remain separate reusable libraries even though Studio is the only product
  frontend.

## Success Criteria

### Measurable Outcomes

- **SC-001**: A first-time evaluator can complete import, business mapping, mock source creation, field
  binding, three-state rule setup and Run preview through one application without editing code.
- **SC-002**: The acceptance scene produces the configured color and alarm for 100% of authored mock
  status values within the 100-millisecond budget.
- **SC-003**: After Undo, Redo, autosave, reload, JSON round-trip and ZIP round-trip, all persistent
  target/source/binding/rule IDs and meanings match the accepted authored state.
- **SC-004**: Repeated Edit/Run, language and theme transitions preserve one Viewer and one active preview
  adapter with zero duplicate events or timers.
- **SC-005**: Repository start documentation exposes one Studio URL, and automated scans find zero
  remaining user-facing Factory Demo package, script, route or documentation references.
- **SC-006**: Automated contract comparison finds zero new, removed or reshaped SceneDocument/archive
  fields for this feature.
