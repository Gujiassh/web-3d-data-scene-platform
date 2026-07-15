# Feature Specification: Theme And Scene Naming

**Feature Branch**: `004-theme-project-naming`

**Created**: 2026-07-15

**Status**: Ready for implementation

**Input**: User description: "Add a theme switch. New scenes must be named before creation, and existing scenes need a rename entry point."

## User Scenarios & Testing

### User Story 1 - Name A Scene Before Creation (Priority: P1)

A Studio user can choose New scene, enter a meaningful name, and explicitly create or cancel. The
current scene remains active until a valid name is confirmed.

**Why this priority**: A scene is a durable project artifact. Creating anonymous records immediately
makes recent-project navigation and exported files hard to understand.

**Independent Test**: Open the project menu, start a new scene, cancel once, then create a named scene
and confirm only the named submission creates and activates a new record.

**Acceptance Scenarios**:

1. **Given** a scene is open, **When** the user chooses New scene, **Then** a focused naming dialog
   appears and no project is created yet.
2. **Given** the naming dialog is open, **When** the user cancels or submits only whitespace, **Then**
   the current project and recent-project list remain unchanged.
3. **Given** a non-empty name with surrounding whitespace, **When** the user confirms creation,
   **Then** one new scene is created with the trimmed name in the title, document, recent list and
   subsequent export filename.

---

### User Story 2 - Rename The Current Scene (Priority: P2)

A Studio user can rename the current scene from the project menu. The change behaves like other scene
edits: it is undoable, redoable, autosaved and restored after reload.

**Why this priority**: Naming only at creation is insufficient when a scene's purpose changes or a
temporary name needs correction.

**Independent Test**: Rename the current scene, undo and redo the change, wait for local save, reload,
then confirm the visible name, recent-project metadata and exported document all agree.

**Acceptance Scenarios**:

1. **Given** an editable scene, **When** the user chooses Rename scene, **Then** the naming dialog opens
   with the current name selected for editing.
2. **Given** a valid replacement name, **When** the user confirms, **Then** the document revision
   increases once and the toolbar and recent list show the new name.
3. **Given** a completed rename, **When** the user uses Undo and Redo, **Then** the old and new names are
   restored respectively while revisions remain monotonic.
4. **Given** a renamed scene has autosaved, **When** the app reloads or exports the scene, **Then** the
   restored project metadata, document name and export filename all use the renamed value.
5. **Given** Studio is in Run mode, **When** the project menu is opened, **Then** Rename scene is not
   available as an executable edit.

---

### User Story 3 - Choose A Comfortable Interface Theme (Priority: P3)

Studio and Factory Demo users can switch between light and dark interface themes. Each application
remembers its own preference and otherwise follows the browser color preference on first use.

**Why this priority**: Theme choice improves comfort in different environments but must remain a
presentation preference independent from scene authoring and factory telemetry.

**Independent Test**: Open each application with a controlled browser preference, switch theme,
reload, and confirm the preference persists while the current canvas, scene document and runtime state
remain intact.

**Acceptance Scenarios**:

1. **Given** no saved theme preference, **When** an application opens, **Then** it uses the browser's
   preferred light or dark color scheme.
2. **Given** either theme, **When** the user activates the theme control, **Then** all host interface
   surfaces update immediately without reloading or rebuilding the 3D Viewer.
3. **Given** the user selected a theme, **When** that application reloads, **Then** the selected theme is
   restored independently from the other application.
4. **Given** a theme switch during editing or telemetry, **When** the switch completes, **Then** scene
   content, history, selection, save state, connection and telemetry continue unchanged.

### Edge Cases

- Leading and trailing whitespace is removed from scene names; whitespace-only values are rejected.
- Cancel, Escape and backdrop dismissal never create or rename a scene.
- Re-entering the current trimmed name is a no-op and does not add a history entry or revision.
- A save failure preserves the in-memory renamed document and reports the existing save diagnostic;
  retry uses the same name in project metadata and document data.
- Invalid saved theme values are ignored and the browser preference is used.
- Unavailable or restricted browser storage does not block theme switching for the current page.
- Theme switching changes application chrome only; a scene's configured environment/background remains
  document-driven.
- Both themes must remain readable at the existing Studio desktop and Factory tablet breakpoints.

## Requirements

### Functional Requirements

- **FR-001**: Choosing New scene MUST open a naming dialog before any scene is created or activated.
- **FR-002**: The naming dialog MUST require a non-whitespace name, trim surrounding whitespace and
  support explicit confirm and cancel actions.
- **FR-003**: Cancelling or dismissing scene creation MUST preserve the active scene, current history,
  save state and recent-project list.
- **FR-004**: Confirming a valid new name MUST create exactly one scene whose project display name and
  scene document name are equal.
- **FR-005**: Studio MUST provide a Rename scene action for the active scene in Edit mode and prefill
  the dialog with the current name.
- **FR-006**: A successful rename MUST be a document edit that increments revision, participates in
  Undo/Redo, marks the scene dirty and enters the existing autosave flow.
- **FR-007**: Submitting the unchanged trimmed name MUST be a no-op with no revision, history or save
  state change.
- **FR-008**: The active project display name, recent-project display name, scene document name and
  export filename MUST remain consistent after create, rename, Undo, Redo, save, reload and export.
- **FR-009**: Studio and Factory Demo MUST each provide an accessible control that toggles between
  light and dark interface themes.
- **FR-010**: Without a valid saved preference, each application MUST initially follow the browser
  light/dark preference; an explicit selection MUST be remembered locally for that application.
- **FR-011**: Theme changes MUST apply immediately to visible host interface surfaces, controls, text,
  focus indicators, overlays and status colors in both supported languages.
- **FR-012**: Theme preference MUST NOT be written into the scene document, project record, command
  history, archive, runtime snapshot or telemetry state.
- **FR-013**: Theme switching MUST NOT rebuild the active Viewer, reset the canvas, interrupt telemetry,
  change selection or alter document revision.
- **FR-014**: Scene naming and theme control labels, validation messages, accessible names and tooltips
  MUST be available in English and Simplified Chinese.
- **FR-015**: Scene environment and background values MUST remain controlled by the scene document and
  MUST NOT be silently rewritten when the interface theme changes.

### Non-Functional Requirements

- **NFR-001**: A theme change MUST complete without page reload and expose the selected theme on the
  application root before the next visual frame.
- **NFR-002**: Name synchronization MUST preserve the existing scene schema, project record shape,
  archive shape and save payload fields.
- **NFR-003**: Theme state MUST remain presentation-only and use no network request, remote service or
  runtime dynamic code execution.
- **NFR-004**: Light and dark themes at 1440x900, 1280x720 and Factory 768x1024 MUST have no incoherent
  overlap, clipped command labels or page overflow greater than 1px.
- **NFR-005**: Both themes MUST retain visible keyboard focus and readable text/status contrast for the
  existing primary controls and dialogs.

### Key Entities

- **Scene Name**: The user-authored name stored in the scene document and mirrored into project list
  metadata for discovery. The document value is authoritative.
- **Naming Intent**: Temporary dialog state for either create or rename. It is discarded on cancel and
  never persisted by itself.
- **Theme Preference**: A browser-local `light` or `dark` presentation choice scoped independently to
  Studio or Factory Demo.

## Assumptions

- The automatically created first-run workspace may retain its existing localized untitled default;
  explicit New scene actions always require a name.
- Rename is available only in Studio Edit mode because it changes the scene document.
- Scene names have no new length limit beyond the existing document contract; the UI remains resilient
  to long valid names.
- The 3D scene background is business/document content, not application chrome, and therefore does not
  automatically invert with the interface theme.

## Success Criteria

### Measurable Outcomes

- **SC-001**: In automated create-flow acceptance, 100% of cancelled or invalid attempts create zero
  projects and 100% of valid submissions create exactly one correctly named project.
- **SC-002**: Rename, Undo, Redo, autosave, reload and export acceptance produces the same scene name in
  every user-visible and persisted location, with zero name mismatches.
- **SC-003**: A theme switch preserves the same canvas element and leaves document revision, selection,
  history depth, save state, telemetry connection and current alarm values unchanged.
- **SC-004**: Each application restores its explicit theme preference on 100% of reload checks and uses
  the controlled browser preference on 100% of first-use checks.
- **SC-005**: Automated layout checks across all target viewports report at most 1px overflow, and visual
  review finds no unreadable text, invisible focus state or incoherent overlap in either theme.
