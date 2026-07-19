# Hotspot Usability Acceptance Protocol

**Status**: Ready for representative-user execution; results not yet collected

**Minimum participants**: Five solution engineers who have not used this hotspot feature

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

T044 remains open until this table contains five real runs with linked recordings or observer notes and the calculated
results are written into `review.md`.
