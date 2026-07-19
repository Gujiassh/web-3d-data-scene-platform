# Interaction Design: Canvas-First Hotspot Authoring

**Status**: UX direction approved 2026-07-17; calibrated implementation approved 2026-07-18
**Method**: Direct manipulation, progressive disclosure and purposeful feedback
**Primary user**: A solution engineer preparing an interactive 3D scene

## Design Intent

Hotspot authoring should feel like placing a pin, not configuring a database record. The primary path contains four
actions: choose Add, click the surface, type a title, press Enter. All geometric evidence is captured by Runtime and all
persisted mutation occurs through one document command after confirmation.

The UI deliberately separates three jobs:

- **Canvas**: place, select and reposition spatial items.
- **Compact popover**: perform frequent actions in context.
- **List and Inspector**: find difficult items and configure less frequent content/behavior.

No creation wizard, modal, permanent tutorial copy, nested-card form or technical anchor editor is permitted.

## Workspace Placement

### Toolbar

- Add one pin icon to the existing authoring-tool group.
- Accessible name and tooltip are `Add hotspot (H)` / `添加热点 (H)`.
- The button uses `aria-pressed` while placement is active.
- It is disabled in Run, while Runtime is not ready or when another non-cancelable operation owns the pointer. Hotspot
  count never disables Add. The tooltip includes the localized reason.
- `H` is the exact unmodified canonical shortcut and is gated by the existing input, modal, drag and mode rules.

### Left Rail

- Add `Hotspots / 热点` as a peer of Scene and Assets.
- Do not insert hotspots into SceneTree because they are not SceneEntity hierarchy members.
- Each row is one compact line with visibility icon, title, lock state and overflow action.
- The row is a row/slot, not another card inside the panel.
- Rows sort by locale-aware title with stable ID tie-breaker. Manual ordering is not offered in the first release.

### Inspector

- EntityInspector remains entity-only.
- HotspotInspector appears only for a selected hotspot or after explicit `More`.
- The creation flow does not open or focus Inspector.
- Default section: Title, Content, Focus/Reposition and Delete.
- Collapsed `Behavior / 交互行为` section: one action selector and only the control required by that action.
- Anchor diagnostics appear only for an unresolved item and use display names plus a repair action. Raw IDs, hashes,
  positions and normals stay in developer diagnostics, not the normal Inspector.

## State Model

```text
idle
  -> placing-new
       -> titling-new -> selected        (Enter, one add command)
       -> idle                            (Escape/cancel, no mutation)
  -> selected
       -> renaming -> selected            (Enter, one update command)
       -> repositioning -> selected       (drop, one update command)
       -> selected                        (hide/lock/update, one command)
       -> idle/next-selection             (delete, one remove command)
  -> run
```

Only one of `placing-new`, `titling-new`, `renaming` or `repositioning` can exist. Popover open state, hover, focus,
selection, reticle and every state above are transient. Run is not an authoring state and cannot execute commands.

### State Transition Table

| State         | Visible affordance                 | Primary input              | Commit                  | Cancellation                        |
| ------------- | ---------------------------------- | -------------------------- | ----------------------- | ----------------------------------- |
| Idle          | Normal Canvas/tools                | H or Add                   | None                    | None                                |
| Placing new   | Ghost pin or invalid reticle       | Click or reticle Enter     | No; creates title draft | Escape/Add again/tool switch        |
| Titling new   | Draft pin + one-line editor        | Type, Enter                | One complete add        | Escape removes draft                |
| Selected      | Marker highlight + compact popover | Icon action or list action | Per command             | Escape closes popover first         |
| Renaming      | Adjacent one-line editor           | Type, Enter                | One complete update     | Escape restores old title           |
| Repositioning | Live pin + subdued origin          | Drag or place click        | One complete update     | Escape/invalid drop restores origin |
| Run           | Runtime marker, no edit visuals    | Activate                   | No document command     | Escape closes content/focus surface |

## Create Flow

1. The author invokes Add or `H`.
2. Any hotspot popover closes; entity selection may remain until a valid surface is chosen.
3. Canvas receives focus. Pointer motion over a supported surface displays a ghost pin aligned to the hit normal.
4. Empty or unsupported space shows an invalid cursor/reticle. No toast is emitted for ordinary movement.
5. A primary click below the existing drag threshold freezes one transient anchor candidate.
6. Hotspot selection replaces entity selection only at this point; neither selection persists.
7. A one-line editor appears beside the draft marker. It flips above/below and left/right to stay inside the Canvas.
8. A deterministic localized suggested title is selected so typing replaces it immediately.
9. Adjacent Confirm and Cancel icon buttons provide pointer-accessible completion with localized accessible names.
10. Enter or Confirm validates and commits one complete snapshot. Empty/whitespace title remains with an inline error.
11. Escape or Cancel discards the draft. Ordinary editor focus loss neither commits nor discards it.
12. Successful Canvas commit closes the editor, selects the marker and focuses its colocated DOM accessibility proxy so
    focus remains in spatial context. A list-initiated commit keeps focus in the list.

Placement is always single-shot. The author deliberately invokes Add again to create another hotspot.

## Select And Popover Flow

- Clicking a marker selects it without moving the camera.
- The compact popover contains the title and six icon actions: Rename, Reposition, Hide/Show, Lock/Unlock, Delete,
  More.
- The selected marker, popover and selected list row share one authoring subject ID.
- Clicking a SceneEntity clears hotspot selection; clicking a hotspot clears entity selection.
- Outside click closes the popover but preserves selection. Escape closes the popover and returns focus to the marker's
  DOM proxy or initiating list row; a second Escape may use the existing clear-selection behavior.
- `More` transfers focus to the Hotspot Inspector heading/first control. Closing Inspector returns focus to the
  initiating marker or row when it still exists.

## Rename Flow

- Rename from the marker, popover, list F2 or Inspector opens the same adjacent one-line editor.
- The existing title is selected on explicit Rename. Typing while a row is focused does not implicitly rename.
- Enter commits one complete update snapshot.
- Confirm invokes the same update. Escape, Cancel, project/source change or Run restores the exact prior title without
  revision/history change. Ordinary focus loss does not submit or discard the draft.
- Command rejection keeps the authoritative title, preserves context and announces one concise localized error.

## Reposition Flow

### Direct Drag

- An unlocked selected marker can be dragged after 4 CSS pixels of movement.
- Before threshold, the gesture remains a click and may open the popover.
- The original marker remains as a subdued non-interactive reference.
- Preview tracks only current valid supported surface hits and has no easing.
- Pointer release on a valid current hit commits one update command.
- Pointer release on invalid space restores the origin and announces `Choose a supported model surface`.

### Explicit Reposition

- Popover, list and Inspector Reposition enter the same single-shot surface mode without requiring drag.
- Pointer click or keyboard reticle Enter commits one update.
- Escape restores the original anchor and returns focus to the initiating control.

### Authority Loss

Pointer cancel, lost capture, browser visibility loss, source revision change, project switch, asset replacement,
Runtime load/dispose, WebGL context loss or Run transition synchronously invalidates the hit, restores the authoritative
anchor and releases all transient resources.

Each transient operation has a monotonically allocated session ID. Runtime owns raycast/pointer/preview resources and
emits one synchronous cancellation notification for the active ID. Studio owns DOM editor/popover/draft state, closes
only that matching session and acknowledges cancellation. The mode/source/project controller does not expose Run or a
new authority as interactive until both Runtime cancellation and Studio acknowledgement complete. Late callbacks for a
canceled ID are ignored.

## Content And Behavior

### Content

The content control is a segmented choice:

- **Text**: one plain-text multiline editor, maximum 2,000 characters.
- **Host content**: one searchable trusted catalog selector showing display labels, never raw keys.

The title remains independently editable and is always visible in a Show content surface. Empty plain text is valid;
Show content then presents the title only.

### Behavior

The Behavior section presents one menu/radio set. It does not show a graph, chain builder or JSON editor.

| Behavior           | Additional visible control              | Run result                                         |
| ------------------ | --------------------------------------- | -------------------------------------------------- |
| Show content       | None beyond Content                     | Open accessible content surface for title/content  |
| Focus this hotspot | None                                    | Animate camera to the resolved anchor              |
| Focus object       | Searchable Target display-name selector | Animate camera to the existing Target              |
| Open link          | URL input with HTTPS validation         | Open after direct activation and emit result event |

Every successful or recoverable failed activation emits the hotspot ID and activation origin. The host may respond to
that event, but host routes, callback names and arbitrary payloads are never authorable or persisted.

## Hotspots List

- Use roving `tabindex` with Arrow Up/Down and Home/End.
- Enter selects/opens the hotspot. F2 renames. Delete removes only when unlocked and after the existing destructive
  confirmation convention, if one is present at implementation time.
- Space on the visibility control toggles visibility without selecting a hidden Canvas proxy.
- Explicit Focus moves the camera. Merely selecting a row never moves it.
- Hidden and unresolved hotspots remain present. Their row state is announced through icon plus localized text/label.
- Hidden hotspots are omitted from the Run list, matching their absent Run marker and activation surface.
- After removal, focus moves to the next row, then previous row, then Add hotspot when the list becomes empty.
- Exact-overlap or occluded markers remain independently reachable from the list; the first version does not cluster.

## Keyboard Placement And Reposition

- `H` enters placement and shows a reticle centered in the Canvas.
- Arrow keys move the reticle by 8 CSS pixels; Shift+Arrow moves it by 32 CSS pixels.
- Enter accepts the current valid hit. Escape cancels.
- During reposition, the same reticle begins at the marker's projected screen position when visible, otherwise Canvas
  center.
- The reticle is constrained to the Canvas and visibly differentiates valid and invalid hits without color alone.
- Orbit/pan keyboard behavior is suspended only while the reticle owns the corresponding keys.
- Undo/Redo are disabled only while an uncommitted draft/preview is active, preventing accidental changes to older
  history. They resume immediately after commit/cancel.

## Run Interaction

- Run shows only persisted visible, resolved markers. It has no ghost, selection ring, drag cursor, editor, popover
  edit actions or hit surface for authoring.
- Every visible WebGL marker has a colocated, visually transparent but focus-visible DOM button proxy in one overlay
  layer. Proxy position follows the marker projection, uses the marker title as accessible name and is hidden when the
  marker is occluded/unresolved/hidden. Pointer activation may hit the WebGL proxy; keyboard Enter/Space acts on the DOM
  proxy. Both call the same behavior once.
- DOM marker proxies use a roving focus order matching the Hotspots list's title/ID order. Arrow keys move between
  visible proxies; exact-overlap proxies remain separate focus stops even when pointer picking chooses the nearest
  marker. Escape/popover close returns to the initiating proxy.
- Show content opens an accessible dismissible surface; Escape closes it and returns focus to the marker/list row.
- Focus actions retain focus on the initiating control while the camera moves.
- Open link requires direct user activation. A blocked browser action is reported without retry loops or document
  mutation.
- An unresolved visible item is not rendered on Canvas and is disabled in the Run list with a localized reason. It
  remains locally saveable/exportable with a diagnostic; Feature 008 decides publish readiness.
- Marker/DOM-proxy occlusion uses visible opaque depth-writing geometry. Transparent/transmissive materials,
  `depthWrite=false`, zero opacity and invisible material state do not hide a marker in V1.

## Feedback And Motion

| Feedback                     |      Duration | Motion                                     |
| ---------------------------- | ------------: | ------------------------------------------ |
| Marker hover/focus/selection |         100ms | Color/outline/scale emphasis, max 2% scale |
| Draft placement confirmation |         160ms | Opacity plus one bounded ring              |
| Popover enter                |         160ms | Opacity plus at most 4px translation       |
| Popover exit                 |         100ms | Opacity only or reverse translation        |
| Visibility/lock confirmation |     100-120ms | State crossfade                            |
| Drag preview                 |           0ms | Direct pointer tracking                    |
| Valid drop settle            | at most 120ms | Bounded opacity/outline settle             |

Use ease-out for entry and ease-in for exit. Do not use spring overshoot, shaking, bouncing, decorative loops or motion
that changes layout. Under `prefers-reduced-motion`, remove translation, rings, scale and settle animations; preserve
immediate outline, icon, text and focus changes.

## Error And Status Language

Ordinary hover misses are silent. A user attempt produces one short localized reason:

- `Choose a model surface` / `请选择模型表面`
- `This surface cannot host a hotspot` / `此表面暂不支持热点`
- `The model changed. Place the hotspot again` / `模型已变更，请重新放置热点`
- `This hotspot is locked` / `此热点已锁定`
- `This hotspot is unavailable` / `此热点当前不可用`
- `Enter a title` / `请输入标题`
- `Enter a valid HTTPS link` / `请输入有效的 HTTPS 链接`

Errors use icon plus text and `aria-live="polite"` except destructive command failures, which use assertive status only
when user action cannot continue. Do not expose internal IDs or stack details.

## Interaction Oracles

1. Add -> hit -> title -> Enter is the only first-create critical path; Inspector is absent from it.
2. Every preview and editor can be canceled with byte-identical document/history/redo.
3. Every committed user intent maps to exactly one command and one Undo step.
4. Pointer and keyboard paths use the same Runtime hit validation and command builder.
5. No DOM control labeled Position, Normal, Asset hash, Node ID, Entity ID, Target ID, Content key or Action JSON exists
   in the default Studio surface.
6. Run cannot reach a mutation command and Edit helpers are removed before Run activation becomes possible.
7. Focus never disappears after commit, cancellation, deletion, popover close, Inspector close or mode transition.
8. Reduced-motion evidence contains no translated/pulsing markers while preserving every state change.
9. WebGL markers have real DOM button proxies; keyboard evidence never claims focus on a Three.js object.

## Usability Protocol

Test at least five representative solution engineers who have not used the feature. Give only these tasks, without
explaining controls:

1. Add a hotspot to a specified machine part and name it.
2. Move it to another visible part.
3. Hide it, find it again and show it.
4. Lock it and verify movement is unavailable.
5. Configure one behavior and activate it in Run.

Record first-attempt completion, time to complete, misclick/cancellation count and whether a technical field was sought.
Pass requires at least 90% unassisted first-attempt completion, median create-and-title at most 12 seconds and median
reposition at most 5 seconds.

Feature 007 did not execute this protocol. On 2026-07-19 the project owner approved an Owner Waiver because five
representative participants cannot be supplied. The targets remain unproven and carry into Feature 009 external
target-developer testing; the waiver must not be presented as usability evidence.
