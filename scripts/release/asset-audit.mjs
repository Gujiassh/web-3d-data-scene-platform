import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { validateBytes, version as validatorVersion } from "gltf-validator";

const execFileAsync = promisify(execFile);
const inventoryPath = path.resolve(import.meta.dirname, "tracked-assets.json");

export async function auditRepositoryAssets(root) {
  const inventory = JSON.parse(await readFile(inventoryPath, "utf8"));
  assert(inventory.schemaVersion === "1.0.0", "Asset inventory schemaVersion must be 1.0.0.");

  const tracked = await trackedModelFiles(root);
  assertInventoryCoverage(
    inventory.assets.map((asset) => asset.path),
    tracked,
  );

  const assets = [];
  for (const record of inventory.assets) {
    const bytes = await readFile(path.join(root, record.path));
    const licenseBytes = await readFile(path.join(root, record.licensePath));
    assertAssetRecord(record, bytes, licenseBytes);
    const validation = await validateBytes(new Uint8Array(bytes), {
      format: path.extname(record.path).slice(1),
      maxIssues: 0,
      uri: record.path,
      writeTimestamp: false,
    });
    assertValidatorReport(record.path, validation);
    assets.push({
      path: record.path,
      byteLength: bytes.byteLength,
      sha256: sha256(bytes),
      licenseId: record.licenseId,
      validatorErrors: validation.issues.numErrors,
      validatorWarnings: validation.issues.numWarnings,
    });
  }

  assertRepositoryBudgets(inventory, assets);
  const fonts = await auditFontLicenses(root, inventory.fonts);
  return {
    schemaVersion: "1.0.0",
    validator: `Khronos glTF Validator ${validatorVersion()}`,
    assets,
    fonts,
    totals: {
      trackedFiles: assets.length,
      uniqueHashes: new Set(assets.map((asset) => asset.sha256)).size,
      trackedBytes: assets.reduce((sum, asset) => sum + asset.byteLength, 0),
      uniqueBytes: uniqueByteLength(assets),
    },
  };
}

export function assertInventoryCoverage(inventoryPaths, trackedPaths) {
  const inventory = [...inventoryPaths].sort();
  const tracked = [...trackedPaths].sort();
  assert(
    JSON.stringify(inventory) === JSON.stringify(tracked),
    `Tracked model inventory mismatch: expected=${JSON.stringify(inventory)} actual=${JSON.stringify(tracked)}`,
  );
}

export function assertAssetRecord(record, bytes, licenseBytes) {
  assert(bytes.byteLength === record.byteLength, `${record.path} byteLength changed.`);
  assert(bytes.byteLength <= record.maxByteLength, `${record.path} exceeds its byte budget.`);
  assert(sha256(bytes) === record.sha256, `${record.path} SHA-256 changed.`);
  assert(record.licenseId === "CC0-1.0", `${record.path} has an unsupported license ID.`);
  assert(sha256(licenseBytes) === record.licenseSha256, `${record.path} license bytes changed.`);
}

export function assertRepositoryBudgets(inventory, assets) {
  const trackedBytes = assets.reduce((sum, asset) => sum + asset.byteLength, 0);
  const uniqueBytes = uniqueByteLength(assets);
  assert(
    trackedBytes <= inventory.repositoryMaxTrackedBytes,
    `Tracked model bytes ${trackedBytes} exceed ${inventory.repositoryMaxTrackedBytes}.`,
  );
  assert(
    uniqueBytes <= inventory.repositoryMaxUniqueBytes,
    `Unique model bytes ${uniqueBytes} exceed ${inventory.repositoryMaxUniqueBytes}.`,
  );
}

function assertValidatorReport(assetPath, report) {
  assert(report.issues.truncated === false, `${assetPath} validator report was truncated.`);
  assert(report.issues.numErrors === 0, `${assetPath} has Khronos validation errors.`);
  assert(report.issues.numWarnings === 0, `${assetPath} has Khronos validation warnings.`);
}

async function auditFontLicenses(root, fonts) {
  const notice = await readFile(path.join(root, "THIRD_PARTY_NOTICES.md"), "utf8");
  return Promise.all(
    fonts.map(async (font) => {
      const packageRoot = path.join(root, font.installedRoot);
      const manifest = JSON.parse(await readFile(path.join(packageRoot, "package.json"), "utf8"));
      const installedLicense = await readFile(path.join(packageRoot, "LICENSE"));
      const distributedLicense = await readFile(path.join(root, font.distributedLicensePath));
      assert(
        manifest.name === font.package &&
          manifest.version === font.version &&
          manifest.license === font.licenseId,
        `${font.package} installed metadata changed.`,
      );
      assert(sha256(installedLicense) === font.licenseSha256, `${font.package} license changed.`);
      assert(
        Buffer.compare(installedLicense, distributedLicense) === 0,
        `${font.package} distributed license does not match the installed package.`,
      );
      assert(
        notice.includes(`${font.package}@${font.version}`) && notice.includes(font.licenseId),
        `${font.package} is missing from THIRD_PARTY_NOTICES.md.`,
      );
      return {
        package: font.package,
        version: font.version,
        licenseId: font.licenseId,
        licenseSha256: font.licenseSha256,
      };
    }),
  );
}

async function trackedModelFiles(root) {
  const { stdout } = await execFileAsync(
    "git",
    ["ls-files", "-z", "--", "*.glb", "*.gltf", "*.bin"],
    { cwd: root, encoding: "utf8" },
  );
  return stdout.split("\0").filter(Boolean).sort();
}

function uniqueByteLength(assets) {
  return [...new Map(assets.map((asset) => [asset.sha256, asset.byteLength])).values()].reduce(
    (sum, byteLength) => sum + byteLength,
    0,
  );
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
