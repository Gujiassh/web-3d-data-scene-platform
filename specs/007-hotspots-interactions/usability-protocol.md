# Hotspot Usability Acceptance Protocol

**Status**: Owner-waived on 2026-07-19; representative-user results were not collected

**Minimum participants**: Five solution engineers who have not used this hotspot feature

## Owner Waiver

The project owner confirmed on 2026-07-19 that five representative participants cannot be supplied and explicitly
approved replacing T044 execution with an Owner Waiver. No participant row below is treated as completed and no
first-attempt rate or task-time result is claimed.

The waiver permits Feature 007 administrative closure and Feature 008 work to begin. It does not prove NFR-001,
NFR-002, SC-001 or SC-002, and it does not permit a release or marketing claim about first-use usability. Feature 009
must retain external target-developer testing as the release-stage evidence for this residual risk.

## Setup

- Use the accepted production build at 1440x900 with a mouse and keyboard.
- Reset to the same project and camera before each participant.
- Start in Edit with no selected entity or hotspot and no open dialog.
- Record the screen and visible timer. Do not explain controls, shortcuts or expected UI.
- A participant may read tooltips and Help. Any spoken instruction from the moderator counts as assistance.

## Moderator Script

Read only the task text. Start timing when the task is read and stop when its observable result is complete.

1. Add a hotspot to the specified machine part and name it `Infeed check`.
2. Move that hotspot to the other visible machine part.
3. Hide the hotspot, find it again, and show it.
4. Lock the hotspot and verify that moving it is unavailable.
5. Configure Show content with `Inspection ready`, enter Run, and activate the hotspot.

## Record

Create one row per participant. Use seconds with one decimal place. `First attempt` is `yes` only when every task is
completed without moderator assistance or a reset. `Technical field sought` includes looking for coordinates, node or
entity IDs, asset hashes, normals, content keys or Action JSON.

| Participant | Representative role | First attempt | Create + title (s) | Reposition (s) | Misclicks | Cancellations | Assisted | Technical field sought | Evidence |
| ----------- | ------------------- | ------------- | ------------------ | -------------- | --------- | ------------- | -------- | ---------------------- | -------- |
| P01         |                     |               |                    |                |           |               |          |                        |          |
| P02         |                     |               |                    |                |           |               |          |                        |          |
| P03         |                     |               |                    |                |           |               |          |                        |          |
| P04         |                     |               |                    |                |           |               |          |                        |          |
| P05         |                     |               |                    |                |           |               |          |                        |          |

## Acceptance

- At least 90% unassisted first-attempt completion. With five participants, all five must pass because four of five is
  only 80%.
- Median create-and-title time is at most 12 seconds.
- Median reposition time is at most 5 seconds.
- Record every failed task, assistance event and technical-field search; do not replace participants or discard runs.

T044 is closed by the Owner Waiver above. This empty table is retained to make the missing evidence explicit and to
support a future real run without rewriting the protocol.
