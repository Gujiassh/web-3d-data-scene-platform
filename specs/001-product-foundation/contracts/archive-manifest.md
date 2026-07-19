# Archive Manifest Contract

> Status: MVP v1 design
> Machine-readable schema: `archive-manifest.schema.json`

## Purpose

The manifest describes a standard ZIP export without making the ZIP itself a private binary
format. It identifies the SceneDocument entry and provides a size, media type and SHA-256 digest
for every scene or asset file in the archive.

## Required Layout

```text
project-name.scene.zip
├── manifest.json
├── scene.json
└── assets/
    └── <sha256>.glb
```

`manifest.json` does not list itself. `entry` is `scene.json`; all asset paths are relative and
must resolve inside the archive root.

## Path Rules

- Paths use `/`, never platform-specific separators.
- Absolute paths, empty segments, `.` and `..` segments are rejected.
- Symlinks, hard links and device entries are rejected.
- Every path is unique after exact UTF-8 decoding; Unicode normalization collisions are rejected.
- Extraction enforces file-count, per-file and total expanded-size limits before allocation.

## Integrity

- Viewer hashes each listed file before activating the archive.
- Missing, extra or mismatched files are blocking errors in MVP.
- `sceneSchemaVersion` must match the migration-preceding version declared by raw `scene.json`.
- Import accepts raw SceneDocument 1.0.0, 1.1.0, 1.2.0, 1.3.0 and 1.4.0 payloads and returns current
  1.4.0. Export accepts and writes only current SceneDocument 1.4.0 while `archiveVersion` remains
  1.0.0.
- Asset hashes in SceneDocument must match the corresponding manifest file digest.
- `createdAt` is informational and is not used for ordering project revisions.

## Excluded Data

The archive cannot contain endpoint URLs, authentication material, live telemetry, Studio session
state, alarm history or host application data.
