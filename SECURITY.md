# Security Policy

## Reporting

Report suspected vulnerabilities through GitHub's private security advisory flow for this repository. Do not open a public
issue containing exploit details, private scene data, credentials or unredacted customer assets.

Include the affected commit/version, environment, reproduction, expected/actual result and a bounded impact assessment.
Maintainers will acknowledge a complete report, reproduce it, coordinate a fix and publish disclosure details after users
have a reasonable update window.

## Supported Versions

The project is currently a release candidate. Security fixes target the latest `main` and newest release-candidate tag;
older snapshots are not maintained.

## Security Boundaries

Scene JSON, ZIP archives, glTF assets, adapter envelopes, trusted host content and publish bundles are untrusted inputs.
Validation includes schema/semantics, content hashes, byte/file limits, path normalization, stream ordering, URL policy and
host content allowlists. A passing validator does not authorize asset redistribution or make external HTML trusted.
