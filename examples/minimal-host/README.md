# Minimal Published-Scene Host

This framework-neutral example loads one exploded `.web3d.zip` bundle through `@web3d/publish`,
then gives the verified document and AssetResolver to `@web3d/runtime`. It owns the mock adapter,
selection UI and trusted-content values; it does not import Studio.

```bash
pnpm --filter @web3d/minimal-host generate:fixture
pnpm --filter @web3d/minimal-host dev
pnpm --filter @web3d/minimal-host build
```

The source GLB is the repository's deterministic CC0 M0 factory fixture. Generated output lives in
`public/published/`, with a byte-identical ZIP and deterministic report beside it.
