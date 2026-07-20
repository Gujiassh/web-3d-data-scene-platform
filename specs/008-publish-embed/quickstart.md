# Publish And Embed Quickstart

**Status**: Executable Feature 008 path; external 15-minute result pending T045

## Clean Checkout

```bash
corepack pnpm install --frozen-lockfile
pnpm --filter @web3d/minimal-host generate:fixture
pnpm --filter @web3d/minimal-host build
pnpm --filter @web3d/minimal-host preview
```

Open `http://127.0.0.1:4191`. The first screen is the actual framework-neutral Runtime host, not a landing page or a
second Studio.

For source development, run `pnpm --filter @web3d/minimal-host dev`. Root `pnpm dev` continues to start Studio only.

## Responsibilities

1. **Author**: create and save the SceneDocument in Studio; resolve every Surface hotspot.
2. **Publish**: use Studio Publish to validate current Runtime evidence and download one `.web3d.zip`.
3. **Deploy**: extract the ZIP without renaming files and serve that directory at a stable base URL.
4. **Host**: call `loadPublishedScene`, create declared adapters, map trusted-content keys locally and pass the verified
   document/AssetResolver to Runtime or React.

The example fixture generator performs steps 2-3 deterministically against the repository's CC0 factory GLB. It writes:

```text
examples/minimal-host/public/
├── fixture-report.json
├── published-factory.web3d.zip
└── published/
    ├── publish-manifest.json
    ├── scene.json
    └── assets/<sha256>.glb
```

`fixture-report.json` binds the source asset, every exploded file and ZIP by SHA-256 without using a timestamp.

## Host Integration

```ts
const published = await loadPublishedScene({
  baseUrl: new URL("./published/", document.baseURI),
  signal,
});
const adapters = createAdaptersFromHostConfiguration(published.manifest.requirements.dataSources);
const viewer = createSceneViewer(container, {
  assetResolver: published.assetResolver,
  adapters,
  onEvent(event) {
    if (event.type === "hotspot-host-content-request") {
      renderTrustedContent(hostContentByKey[event.key]);
    }
  },
});
await viewer.load(published.document);
```

- The base URL denotes a directory and must resolve `publish-manifest.json` beneath it.
- Do not put credentials in the base URL; the loader rejects credential-bearing URLs.
- Build adapters from host configuration. Do not infer endpoints or credentials from SceneDocument options.
- Missing adapter requirements or trusted-content keys are integration errors, not reasons to guess or fetch arbitrary
  host values.

React hosts pass the same `published.document`, `published.assetResolver` and adapter map to `SceneViewer`.

## Static Hosting

Serve bundle files as ordinary paths. Do not route missing `/published/*` requests to an SPA fallback.

| Extension / file        | Required `Content-Type`                       |
| ----------------------- | --------------------------------------------- |
| `publish-manifest.json` | `application/json; charset=utf-8`             |
| `scene.json`            | `application/json; charset=utf-8`             |
| `.glb`                  | `model/gltf-binary`                           |
| `.gltf`                 | `model/gltf+json`                             |
| `.js`                   | `text/javascript` or `application/javascript` |
| `.css`                  | `text/css`                                    |
| `.woff` / `.woff2`      | `font/woff` / `font/woff2`                    |

Recommended cache policy:

- hashed JS/CSS/font files and `assets/<sha256>.*`: `public, max-age=31536000, immutable`;
- `index.html`, `publish-manifest.json` and `scene.json`: revalidate or `no-cache`;
- publish a new directory or atomically replace manifest/scene/assets together; never update only one bound file.

Send this CSP as an HTTP response header:

```text
default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' blob: data:; connect-src 'self' wss:; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'self'
```

No `unsafe-eval`, inline executable script or runtime schema compilation is required. A meta CSP can protect static HTML
when headers are unavailable, but `frame-ancestors` is effective only in the response header.

## Verification

```bash
pnpm --filter @web3d/minimal-host test
pnpm --filter @web3d/minimal-host typecheck
pnpm --filter @web3d/minimal-host build
```

The build gate regenerates the fixture twice, checks byte identity, verifies ZIP/exploded parity, loads the production
fixture through `loadPublishedScene`, rechecks the resolved GLB and scans emitted JS for `eval`/`new Function`.

The external 15-minute acceptance starts after dependencies are installed and ends when the participant has loaded the
fixture, focused a target, observed both selection origins and opened mapped trusted content. Record actual start/end
times, participant context and blockers under T045; do not infer a timing result from this document or automated tests.
