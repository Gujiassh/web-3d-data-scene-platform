# Contributing

## Setup

Use Node.js `>=22.12.0` and pnpm `10.33.4`:

```bash
corepack pnpm install --frozen-lockfile
pnpm dev
```

Keep changes within the owning package or application. `@web3d/document` owns persisted meaning; Runtime and Studio must
not add private fields or infer identifiers from names/order. Runtime-only state must remain outside SceneDocument.

## Before A Pull Request

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm verify:docs
pnpm verify:i18n
pnpm verify:assets
pnpm verify:topology
pnpm verify:design
pnpm verify:packages
pnpm verify:smart-home
```

Run relevant Playwright projects when a user flow changes. Add unit tests for code changes and update the owning SSoT/spec
documents with requirements, decisions and exact verification evidence. Do not commit generated smart-home bytes or claim
external-user, Safari, reference-hardware or registry evidence from controller automation.

## Changes

- Keep commits coherent and use English commit messages.
- Preserve public and persisted contracts unless the change is explicitly designed, documented and reviewed as a contract
  revision.
- Add deterministic fixtures with provenance and licenses. Assets without redistribution terms do not enter the repository.
- Report commands, browser/hardware identity, screenshots or raw artifacts appropriate to the change risk.

By participating, you agree to follow [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
