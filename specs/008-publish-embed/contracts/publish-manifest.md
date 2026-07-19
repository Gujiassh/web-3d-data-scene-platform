# Publish Manifest 1.0 Contract

**File**: `publish-manifest.json`

**Machine-readable schema**: `publish-manifest.schema.json`

**Encoding**: canonical UTF-8 JSON plus one trailing LF

## Shape

```ts
interface PublishManifest {
  publishVersion: "1.0.0";
  sceneSchemaVersion: "1.4.0";
  documentId: string;
  revision: number;
  entry: "scene.json";
  files: PublishFile[];
  requirements: {
    dataSources: Array<{ sourceId: string; adapter: "mock" | "websocket" }>;
    trustedContentKeys: string[];
  };
}

interface PublishFile {
  path: string;
  sha256: string;
  byteLength: number;
  mediaType: "application/json" | "model/gltf-binary" | "model/gltf+json";
}
```

## Invariants

- Only the exact properties above are accepted at every object level.
- `files` contains exactly `scene.json` and every content-addressed asset used by the document.
- `publish-manifest.json` does not list itself.
- Paths use `/`, are relative, contain no empty/`.`/`..` segment and follow the existing archive safety limits.
- Files sort by path; data source requirements sort by `sourceId`; trusted-content keys sort by code point and are unique.
- `documentId` and `revision` exactly equal parsed `scene.json`.
- The scene file hash and every asset file hash/length/media type must match before activation.
- `requirements` declares integration needs only. It never contains adapter configuration, URLs, credentials, payloads or
  trusted-content values.
- Unknown publish/schema versions and unknown properties reject.

## Static Layout

```text
published-scene/
├── publish-manifest.json
├── scene.json
└── assets/
    └── <sha256>.<glb|gltf>
```

The deterministic ZIP contains this exact layout. Deployment consists only of extracting the ZIP without renaming files
and serving the directory with correct MIME types.
