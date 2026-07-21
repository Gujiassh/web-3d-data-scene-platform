import path from "node:path";

import { auditRepositoryAssets } from "./asset-audit.mjs";

const report = await auditRepositoryAssets(path.resolve(import.meta.dirname, "../.."));
for (const asset of report.assets) {
  process.stdout.write(
    `asset-audit path=${asset.path} bytes=${asset.byteLength} sha256=${asset.sha256} license=${asset.licenseId} validator_errors=${asset.validatorErrors} validator_warnings=${asset.validatorWarnings}\n`,
  );
}
for (const font of report.fonts) {
  process.stdout.write(
    `font-license package=${font.package} version=${font.version} license=${font.licenseId} sha256=${font.licenseSha256}\n`,
  );
}
process.stdout.write(
  `asset-audit status=PASS validator=${JSON.stringify(report.validator)} tracked=${report.totals.trackedFiles} unique=${report.totals.uniqueHashes} tracked_bytes=${report.totals.trackedBytes} unique_bytes=${report.totals.uniqueBytes}\n`,
);
