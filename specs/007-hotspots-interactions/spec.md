# Feature Specification: Hotspots And Declarative Interactions

**Feature Branch**: `007-hotspots-interactions`
**Created**: 2026-07-17
**Status**: Direction approved 2026-07-17; calibration and implementation approval complete 2026-07-18
**Input**: Add precise surface hotspots and simple declarative interactions through direct Canvas manipulation, without exposing technical forms.

> **Approval gate**: This specification freezes the approved user experience. The linked SceneDocument 1.4 model,
> migration, command and save semantics received explicit implementation approval on 2026-07-18 after calibration and
> Critical closure. SceneDocument 1.3 remains production authority until the approved migration is implemented and
> accepted.

## Problem

The platform can import and lay out models, author data behavior and place lights, but it cannot yet attach a useful
annotation to a precise point on a model. The current Annotation record is not authorable in Studio: it exposes only a
Target reference, a content key and an underdefined offset, while Runtime neither renders nor activates it.

The feature must feel like placing and editing a pin in a visual tool. Authors should click the model, type a title and
continue working. Coordinates, normals, glTF node indices, Target IDs, content keys and action JSON are implementation
details and must not become the normal editing experience.

## Candidate Product Decisions

These decisions are the recommended complete package and require explicit approval where they affect persistence:

- A hotspot is the user-facing form of the existing Annotation concept; no parallel Hotspot collection is added.
- `Add hotspot` is a direct toolbar tool with exact unmodified shortcut `H` and single-shot placement.
- A surface click creates a transient draft. The document changes only after the adjacent one-line title editor is
  confirmed with Enter.
- Existing hotspots use direct Canvas manipulation and a compact action popover. Advanced content and behavior use a
  dedicated Hotspot Inspector with progressive disclosure, not a large creation form.
- New hotspots attach to a supported rigid glTF surface using the exact asset hash and node-local point/normal.
- Existing Annotation records migrate deterministically to an explicit opaque legacy anchor. Its old Target reference
  and offset bytes are preserved, but no coordinate frame is invented; explicit Reposition creates a surface anchor.
- One hotspot has one activation behavior from a closed declarative set: show content, focus this hotspot, focus an
  existing Target, or open an absolute HTTPS link.
- Every activation also emits the hotspot ID through the public Viewer event contract. Host business routing remains
  outside SceneDocument.
- Arbitrary scripts, Action JSON, host route names, automatic Target creation and heuristic node remapping are out of
  scope.
- Annotation and Surface-anchor counts have no product/schema hard cap. Runtime renders every valid visible Surface
  hotspot without silent truncation. Two hundred simultaneously visible hotspots are the minimum calibrated performance
  acceptance scene, not a user limit. Placement excludes skinned, morph-capable, instanced and batched surfaces.

## User Scenarios & Testing

### User Story 1 - Place And Title A Hotspot Directly (Priority: P0)

A scene author selects Add hotspot, clicks the desired model surface, types a title beside the new marker and presses
Enter. They never leave the Canvas or fill in technical anchor fields.

**Why this priority**: Direct placement is the defining workflow. If it is slow or form-heavy, the feature does not
solve the author's problem.

**Independent Test**: In a ready Edit scene, use both pointer and keyboard paths to create and title a hotspot. Confirm
one hotspot, one document revision and one Undo entry are produced only after Enter.

**Acceptance Scenarios**:

1. **Given** Edit mode and a ready supported asset surface, **When** the author presses `H` and moves the pointer,
   **Then** a ghost pin follows valid surface hits and no document, history, revision or autosave value changes.
2. **Given** active placement, **When** the author clicks a valid surface without dragging, **Then** one transient
   draft marker appears and a one-line title editor beside it receives focus with a selected suggested title.
3. **Given** a valid draft title, **When** Enter is pressed, **Then** one complete hotspot is added atomically, one
   revision and Undo entry are created, the hotspot is selected and placement exits.
4. **Given** a valid draft title, **When** the adjacent Confirm icon is activated, **Then** it invokes the same atomic
   add as Enter; ordinary focus loss MUST NOT submit or discard the draft.
5. **Given** placement or a title draft, **When** Escape, Cancel, project switch or Run transition occurs, **Then** the draft
   is discarded synchronously and persistent state remains byte-identical.
6. **Given** an unsupported, hidden, unloaded or empty surface, **When** the author attempts placement, **Then** no
   draft is created and a concise localized reason is available without exposing a node ID or raycast data.

---

### User Story 2 - Manage Hotspots On The Canvas (Priority: P1)

An author selects a marker and uses a compact popover to rename, reposition, hide, lock or delete it. Common actions
remain visual and direct; only content and activation behavior move into the Inspector.

**Why this priority**: A placement tool is not usable unless authors can correct and organize its results quickly.

**Independent Test**: Select one hotspot, exercise every compact action, then Undo and Redo each committed change.
Verify Canvas and list selection stay synchronized and canceled previews never mutate the document.

**Acceptance Scenarios**:

1. **Given** a visible hotspot, **When** its marker is clicked, **Then** it becomes the only authoring subject and a
   compact popover offers Rename, Reposition, Hide, Lock, Delete and More actions.
2. **Given** an unlocked hotspot, **When** its marker is dragged at least 4 CSS pixels across supported surfaces,
   **Then** preview follows the pointer directly and pointer release commits exactly one reposition command.
3. **Given** reposition preview, **When** Escape, pointer cancellation or an invalid drop occurs, **Then** the exact
   original anchor returns and document revision/history remain unchanged.
4. **Given** a locked hotspot, **When** rename, reposition, content, action or delete is attempted, **Then** it is
   rejected before preview or mutation; visibility and unlock remain available.
5. **Given** an unlocked hotspot, **When** Delete is invoked, **Then** one remove command occurs, focus moves
   predictably and Undo restores the complete hotspot.

---

### User Story 3 - Find And Edit Hotspots Without Hunting In 3D (Priority: P1)

An author uses a dedicated Hotspots view in the left rail to scan all annotations, including hidden or occluded ones,
select one, focus it and open its compact Inspector.

**Why this priority**: Canvas-only controls fail for hidden, overlapping and keyboard-operated content.

**Independent Test**: Complete select, focus, rename, visibility, lock and delete flows from the list using only the
keyboard, including one hidden hotspot and two overlapping markers.

**Acceptance Scenarios**:

1. **Given** hotspots in the document, **When** the Hotspots view opens, **Then** each row exposes title, visibility
   and lock state without nested cards or technical anchor data.
2. **Given** Canvas or list selection, **When** a hotspot is selected, **Then** the corresponding list row and marker
   share selection; any entity selection is cleared without persisting either selection.
3. **Given** a hidden or occluded hotspot, **When** its list row is focused, **Then** it can be shown, unlocked,
   renamed, deleted or explicitly focused without requiring a visible marker.
4. **Given** list keyboard focus, **When** Arrow Up/Down, Home/End, Enter, F2 or Delete is used, **Then** navigation
   and actions match the pointer workflow and focus remains deterministic.

---

### User Story 4 - Configure A Safe Activation (Priority: P1)

An author opens More and chooses one understandable behavior using labels, search selection and purpose-specific
controls. The author never edits JSON, scripts, IDs or host routing values.

**Why this priority**: Hotspots become useful in a viewer only when activation has a predictable, safe result.

**Independent Test**: Configure and run each permitted behavior, verify one expected result and activation event, and
verify invalid references or links cannot be committed.

**Acceptance Scenarios**:

1. **Given** a selected hotspot, **When** More is chosen, **Then** Hotspot Inspector shows title and content first and
   one collapsed Behavior section for advanced settings.
2. **Given** Show content, **When** the author edits content, **Then** they enter plain text or choose a trusted host
   content item by display name; no content key field is shown.
3. **Given** Focus existing Target, **When** the author configures it, **Then** they search by display name and the
   stable Target ID remains hidden.
4. **Given** Open link, **When** a non-HTTPS, malformed or oversized URL is entered, **Then** Apply is blocked with a
   localized field error and no mutation occurs.
5. **Given** any hotspot activation, **When** it succeeds or reports a recoverable action failure, **Then** Viewer
   emits the hotspot ID without persisting host routes, callbacks or runtime state.

---

### User Story 5 - Preview The Same Hotspots In Run (Priority: P0)

An author switches to Run and sees the same visible markers without edit handles. Pointer, keyboard and the read-only
Hotspots list activate the same declarative behavior.

**Why this priority**: Edit and Run must prove one authored interaction contract before publishing and embedding.

**Independent Test**: Enter Run during placement and during reposition, then activate every action from a marker and
from the list. Confirm no authoring surface or document mutation remains.

**Acceptance Scenarios**:

1. **Given** an active draft, rename or reposition operation, **When** Run is requested, **Then** the operation is
   canceled and authoritative state is restored before Run becomes interactive.
2. **Given** Run mode, **When** a visible marker is hovered, focused or activated, **Then** it gives accessible state
   feedback and performs exactly its declared behavior without exposing edit actions.
3. **Given** Run mode, **When** the read-only Hotspots list is used, **Then** focus and activation match the marker
   path, including for a marker that is difficult to reach visually.
4. **Given** a hotspot whose surface cannot currently resolve, **When** Run loads, **Then** no marker is invented or
   remapped; a stable diagnostic and unavailable list state identify the hotspot.

---

### User Story 6 - Upgrade Existing Annotations Without Guessing (Priority: P0)

An existing user opens a legacy project and keeps every annotation's identity, title, content reference and exact
Target-relative offset. The system does not pretend that the old offset is a precise surface attachment.

**Why this priority**: This feature changes persisted Annotation meaning. Silent remapping would corrupt saved work.

**Independent Test**: Import documents from every supported version, migrate through every frozen validator, compare
legacy values and inject invalid or failed storage writes. Confirm all-or-nothing current-version persistence.

**Acceptance Scenarios**:

1. **Given** a valid legacy Annotation, **When** migration succeeds, **Then** its ID, title, Target reference, opaque
   offset and content key are represented explicitly with visible true, locked false and Show content, without a
   fabricated Canvas marker.
2. **Given** migration, **When** any intermediate document or storage write is invalid, **Then** all ProjectRecords
   remain unchanged and normal repository operations reject.
3. **Given** successful migration, **When** Studio subsequently loads the project, **Then** it uses only the current
   contract; no render-time legacy compatibility branch remains.

## Edge Cases

- A click that exceeds the existing click/drag threshold or starts an orbit gesture does not place a hotspot.
- Only one placement, title edit or reposition session can be active; starting another authoring tool cancels it first.
- Losing pointer capture, browser visibility, WebGL context, current source revision or project authority cancels any
  transient surface evidence before it can commit.
- A surface hit becomes stale when document ID, document revision, entity, asset hash, node mapping or project changes.
- Hidden hotspots have no Canvas marker or hit proxy but remain in the Edit list.
- A visible hotspot on a hidden ancestor, opaque legacy anchor or unavailable asset remains in the Edit list with an
  unavailable state; the system does not silently change its persisted visibility.
- Occluded markers follow depth visibility. Exact screen overlap activates the nearest resolvable marker; all markers
  remain available from the list. Clustering and leader-line layout are excluded from this release.
- Selecting a hotspot clears entity selection and selecting an entity clears hotspot selection. Neither changes
  revision, history or autosave.
- A locked hotspot can be selected, focused, hidden/shown and unlocked; all content-changing operations reject.
- Empty or whitespace-only titles cannot commit. Titles are plain text, at most 160 characters, and not HTML.
- Plain body content is text only and at most 2,000 characters. Host content is resolved only by an injected trusted
  catalog; unavailable keys are not converted to text or guessed.
- A failed or browser-blocked action still emits an activation/error event but never changes SceneDocument.
- Deleting an asset subtree removes surface hotspots anchored to that subtree and legacy annotations whose Targets are
  removed, in the same atomic command. Duplicate does not copy hotspots.
- Assets with exact bytes but unsupported skinned, morph-capable, instanced or batched hit surfaces cannot receive a new
  surface hotspot in this release.
- A semantically valid annotation whose runtime node cannot resolve remains locally saveable and exportable with a
  diagnostic, but it has no Canvas marker or Run activation. Feature 008 owns publish-readiness blocking.
- Touch authoring is not required because Studio remains a desktop tool at widths of at least 1280px. Run activation
  uses standard pointer semantics and must remain compatible with mouse, touch and keyboard hosts.

## Requirements

### Functional Requirements

- **FR-001**: Studio MUST provide a direct pressed Add hotspot icon in the authoring toolbar with canonical exact
  unmodified shortcut `H`, a localized tooltip and the same command in Help.
- **FR-002**: Add hotspot MUST be single-shot. It MUST enter a Canvas placement state, show a transient valid-hit
  preview and exit after one commit or cancellation.
- **FR-003**: A surface click MUST create only a transient draft and focus a one-line title editor beside the marker.
  No document, revision, history, redo, autosave or storage mutation may occur before confirmation.
- **FR-004**: Enter on a valid title MUST add one complete hotspot through one atomic command and one Undo entry.
  An adjacent Confirm icon MUST invoke the same command. Escape or the adjacent Cancel icon MUST cancel without
  mutation and restore focus to the initiating Add control. Ordinary focus loss MUST do neither.
- **FR-005**: Default creation UI MUST NOT expose position, normal, asset hash, node index, entity ID, Target ID,
  content key or Action JSON.
- **FR-006**: Pointer placement MUST accept only a supported, visible, current model surface. Empty, unavailable,
  stale or unsupported hits MUST reject without fallback to origin, a nearby mesh or a first available node.
- **FR-007**: Keyboard placement MUST provide a visible screen reticle after `H`; Arrow keys move it, Shift+Arrow
  moves it faster, Enter accepts a valid hit and Escape cancels.
- **FR-008**: Selecting a hotspot MUST open a compact popover with Rename, Reposition, Hide/Show, Lock/Unlock,
  Delete and More. Unfamiliar icons MUST have localized tooltips and accessible names.
- **FR-009**: An unlocked marker MUST support direct drag reposition after a 4 CSS pixel threshold. Preview MUST be
  transient; one valid release creates one update command; cancellation or invalid release restores the exact anchor.
- **FR-010**: Rename MUST use the same adjacent one-line editor. Enter creates one update command and Escape restores
  the exact prior title.
- **FR-011**: Lock MUST block rename, reposition, content/action update and remove before preview or mutation.
  Visibility changes and unlock MUST remain permitted.
- **FR-012**: Studio MUST add a separate Hotspots left-rail view. SceneTree remains entity-only. The view MUST expose
  every hotspot, including hidden and unresolved items, with compact visibility, title and lock states.
- **FR-013**: Canvas and list hotspot selection MUST be bidirectional. Hotspot and entity authoring selections MUST be
  distinct, mutually exclusive transient states.
- **FR-014**: Hotspots list keyboard behavior MUST include Arrow Up/Down, Home/End, Enter, F2 and Delete with roving
  focus and deterministic focus after commit, cancellation and removal.
- **FR-015**: More MUST open a hotspot-specific Inspector. Default content controls precede one collapsed Behavior
  section. The creation workflow MUST NOT open the full Inspector.
- **FR-016**: Content authoring MUST support plain text and trusted host content chosen by display name. The host key
  MUST never be a normal free-text field.
- **FR-017**: Exactly one activation behavior MUST be selected from Show content, Focus this hotspot, Focus existing
  Target and Open HTTPS link. Configuration MUST use dedicated controls and never arbitrary script or JSON.
- **FR-018**: Focus existing Target MUST use a searchable display-name selector. Open link MUST accept only a valid
  absolute HTTPS URL of at most 2,048 characters.
- **FR-019**: Every activation MUST emit a stable hotspot ID and origin through the public Viewer event contract.
  SceneDocument MUST NOT store host routes, callbacks, event payloads, current selection or action results.
- **FR-020**: Edit MUST render placement, selection, title, popover and drag affordances. Run MUST remove all editing
  affordances while retaining visible marker hover, focus, activation and a read-only accessible list path.
- **FR-021**: Every transient authoring operation MUST use one session ID. On Run/source/project/dispose transition,
  Runtime MUST synchronously invalidate its session, release pointer/preview resources and notify Studio. Studio MUST
  synchronously close the matching draft/editor/popover and acknowledge cancellation before Run or the next authority
  becomes interactive.
- **FR-022**: Visible surface markers MUST stay attached to the approved anchor under entity and rigid node transforms.
  Runtime MUST NOT remap by node name, nearest surface, mesh order or first available node.
- **FR-023**: Unresolved anchors MUST produce a stable localized diagnostic and list state. They MUST NOT render or
  activate a fabricated Canvas marker.
- **FR-024**: The current Annotation concept MUST become the persisted hotspot object rather than adding a parallel
  collection. This requirement is approval-gated with the complete SceneDocument 1.4 contract.
- **FR-025**: Existing Annotation records MUST migrate to an explicit opaque legacy anchor with exact identity, title,
  Target, offset and content-key preservation; visible true, locked false and Show content are deterministic additions.
  Migration MUST NOT assign the old offset a coordinate frame or render it as a fabricated marker.
- **FR-026**: SceneDocument migration MUST validate every raw and frozen intermediate version, then current output.
  Invalid intermediate output MUST stop before persistence.
- **FR-027**: IndexedDB initialization MUST rewrite all valid legacy ProjectRecords to canonical current data in one
  transaction or rewrite none. Runtime and Studio MUST NOT retain a frontend-only legacy compatibility path.
- **FR-028**: JSON/ZIP import MUST accept every declared supported legacy/current scene version and return current.
  Export MUST accept and emit current only; the archive container version remains unchanged.
- **FR-029**: Add, update and remove MUST use complete canonical hotspot snapshots, exact stale checks and atomic
  invalid/no-op rejection. Every accepted command, Undo and Redo changes revision exactly once.
- **FR-030**: Deleting an entity subtree MUST atomically remove Surface hotspots anchored to that subtree and opaque
  legacy annotations whose Targets are deleted. Entity duplication MUST NOT copy hotspots.
- **FR-031**: Current validation, Add and Reposition MUST NOT impose a product hard count cap. Runtime MUST resolve and
  render every valid visible Surface anchor without truncating by count; existing file/archive input-size safety limits
  remain independent. Performance acceptance MUST include at least 200 simultaneously visible hotspots.
- **FR-032**: New placement MUST exclude skinned meshes, meshes with morph targets, instanced meshes and batched meshes.
  Supporting them requires a separately approved anchor contract.
- **FR-033**: Bilingual labels, Help, tooltips, errors, live-region messages and accessible names MUST have exact
  English/Chinese key parity; title/content remain authored user text and are not auto-translated.

### Non-Functional Requirements

- **NFR-001**: In representative usability testing, at least 90% of solution engineers MUST create and title their
  first hotspot without assistance.
- **NFR-002**: Median Add -> surface click -> title -> Enter completion MUST be at most 12 seconds; median reposition
  completion MUST be at most 5 seconds.
- **NFR-003**: During active placement or reposition, pointer-to-preview latency p95 MUST be at most 50ms. Preview MUST
  track the pointer without easing and surface raycasts MUST not run while authoring interaction is idle.
- **NFR-004**: With 200 visible hotspots on the deterministic acceptance fixture at fixed 1440x900 DPR1 in recorded
  hardware Chromium, warmed full CPU frame work MUST remain at most 16.7ms p95 and the 200-versus-zero p95 delta MUST
  remain at most 2ms. GPU timer p95 MUST remain at most 16.7ms when supported. Presented 60Hz RAF interval p95 MUST
  remain at most 17.5ms with zero intervals above 25ms. Projection/occlusion, DOM/marker update and marker picking MUST
  each remain at most 2ms p95. Production acceptance MUST rerun the calibrated protocol through production modules.
- **NFR-005**: Hover/focus feedback MUST complete in about 100ms, popover enter in about 160ms and exit in about
  100ms. Drag preview has no easing. No error uses shake or decorative motion.
- **NFR-006**: `prefers-reduced-motion` MUST remove translations, pulses and settle motion while retaining immediate
  state, focus and error feedback.
- **NFR-007**: Every canceled, rejected, stale or superseded operation MUST preserve authoritative document bytes,
  revision, history and redo exactly and release transient listeners, RAF work, pointer capture and render resources.
- **NFR-008**: Core create, select, rename, reposition, focus, hide, lock, delete and activate flows MUST be keyboard
  operable with visible focus and non-color-only states. Status changes MUST use concise localized live regions.
- **NFR-009**: At 1280x720 and 1440x900 in both languages and themes, toolbar, marker editor, popover, Hotspots list
  and Inspector MUST not overlap or clip each other and MUST preserve the existing minimum Canvas workspace.
- **NFR-010**: Plain text and titles MUST render as text, never HTML. Link execution MUST require direct user
  activation and MUST reject non-HTTPS schemes before persistence and again before execution.

## Key Entities

- **Hotspot / Annotation**: Persisted authored item with stable identity, title, authoring visibility/lock state,
  explicit anchor, trusted content and one declarative activation behavior.
- **Surface Anchor**: Asset-bound point and normal associated with one Asset entity, exact asset bytes and one glTF
  node. It is authored from Runtime hit evidence but contains no transient raycast or selection state.
- **Legacy Anchor**: Opaque preserved legacy Target reference and `localOffset` with no asserted coordinate frame; it
  is list-manageable until explicit Reposition replaces it with a Surface anchor.
- **Hotspot Draft**: Transient placement/title state. It never enters SceneDocument, history, autosave or exports.
- **Activation Behavior**: Closed, validated declaration interpreted by Runtime after a direct user activation.
- **Hotspot Authoring Subject**: Transient Studio selection distinct from SceneEntity selection.

## Assumptions And Exclusions

- Studio remains a desktop authoring application with minimum supported width 1280px.
- The public Runtime remains framework-neutral; React does not own surface raycasting or persisted semantics.
- Host content keys come from a trusted host-injected catalog. Studio does not invent, normalize or execute them.
- Scene Targets remain separately authored semantic objects. Clicking a mesh never creates or guesses one.
- Rich text/HTML, arbitrary scripts, host route commands, multiple-action chains, conditions, action sequencing,
  analytics payloads, device control and network requests other than a direct HTTPS navigation are excluded.
- Triangle/barycentric skin attachment, morph targets, InstancedMesh instance identity, clustering, leader lines,
  bulk edit, mobile Studio authoring and collaborative editing are excluded.
- Feature 008 will demonstrate published host integration. Feature 007 proves the same contract in Studio Run and the
  framework-neutral Viewer API without adding a second product frontend.

## Success Criteria

### Measurable Outcomes

- **SC-001**: At least 90% of representative first-time users complete create-and-title without assistance.
- **SC-002**: Median first create-and-title is at most 12 seconds and median reposition is at most 5 seconds.
- **SC-003**: Every accepted add, rename, reposition, hide/show, lock/unlock, content/action update and delete produces
  exactly one Undo step; every cancellation produces zero persistent changes.
- **SC-004**: Pointer-to-preview latency p95 is at most 50ms during active surface interaction.
- **SC-005**: A 200-visible-hotspot acceptance scene meets the calibrated render budget and retains one stable Canvas
  across add/update/remove, Undo/Redo and Edit/Run.
- **SC-006**: All primary authoring and Run activation flows pass pointer, keyboard-only, reduced-motion and bilingual
  browser evidence without technical fields or inaccessible Canvas-only actions.
- **SC-007**: Every supported legacy document migrates deterministically to current data; injected invalid input or
  storage failure leaves every ProjectRecord unchanged.
- **SC-008**: Asset/node loss produces an explicit unavailable state with zero heuristic remaps in contract, unit and
  browser tests.
- **SC-009**: Independent Critical review passes goal alignment, interaction timing, anchor/data/save contracts,
  module boundaries, accessibility, performance evidence and evolution toward Feature 008.

## Approval Sequence

The user approved the complete direction below on 2026-07-17, including no product hotspot count cap and a 200-visible
performance baseline. This closes direction gate CHK030 and permits design calibration and implementation planning:

1. Upgrade Annotation in place and adopt SceneDocument 1.4 rather than create a parallel Hotspot collection.
2. Adopt exact asset-hash/node-local Surface anchors plus opaque legacy anchors; exclude
   skinned/morph/instanced/batched surfaces and prohibit heuristic remapping.
3. Persist title, visible, locked, content and exactly one closed declarative activation behavior per hotspot.
4. Use the four-action set, plain-text/trusted-host content model, no product count cap, a 200-visible performance
   baseline and the HTTPS-only link rule.
5. Apply the deterministic legacy migration, all-record IndexedDB rewrite, current-only export and rewritten-record
   export-revision reset described in the contract.
6. Add complete-snapshot add/update/remove commands, locked exceptions, delete cascades and no-copy-on-duplicate
   semantics.

The detailed approved contract is in [data-model.md](data-model.md) and
[contracts/scene-document-1.4.md](contracts/scene-document-1.4.md). Calibration completed on 2026-07-18 and is recorded
in [technical-design.md](technical-design.md), [plan.md](plan.md), [tasks.md](tasks.md) and [review.md](review.md). The
user explicitly approved the calibrated complete contract on 2026-07-18. SceneDocument 1.3 remains authoritative until
the approved migration is implemented and accepted.
