import { resolve } from "node:path";

import { createServer } from "vite";

import {
  DEFAULT_ARCHIVE_URL,
  generateSmartHomeStarter,
  LOCAL_VALIDATION_ROOT,
} from "./generator.mjs";

const repoRoot = resolve(import.meta.dirname, "../..");
const args = parseArgs(process.argv.slice(2));
const mode = args.mode ?? "local-validation";
const outputDirectory =
  args.output ??
  (mode === "public"
    ? resolve(repoRoot, "apps/studio/public/starter")
    : resolve(LOCAL_VALIDATION_ROOT, "web3d-smart-home-starter"));
const server = await createServer({
  root: repoRoot,
  appType: "custom",
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true },
});

try {
  const documentApi = await server.ssrLoadModule("/packages/document/src/index.ts");
  const result = await generateSmartHomeStarter({
    sourceRoot: args.source ?? "/mnt/e/data/model/smart_home_90sqm",
    outputDirectory,
    archiveUrl: args.archiveUrl ?? DEFAULT_ARCHIVE_URL,
    mode,
    licenseRecordPath: args.licenseRecord,
    exportSceneArchive: documentApi.exportSceneArchive,
    importSceneArchive: documentApi.importSceneArchive,
  });
  process.stdout.write(
    [
      "smart-home-starter",
      "status=generated",
      `mode=${mode}`,
      `license=${result.report.licenseGate.status}`,
      `assets=${result.report.assetCount}`,
      `instances=${result.report.instanceCount}`,
      `archiveBytes=${result.descriptor.archiveByteLength}`,
      `archiveSha256=${result.descriptor.archiveSha256}`,
      `output=${outputDirectory}`,
    ].join(" ") + "\n",
  );
} finally {
  await server.close();
}

function parseArgs(values) {
  const output = {};
  for (let index = 0; index < values.length; index += 1) {
    const flag = values[index];
    const value = values[index + 1];
    if (!flag?.startsWith("--") || value === undefined || value.startsWith("--")) {
      throw new Error(`Expected --name value, received ${flag ?? "end of input"}.`);
    }
    const key = flag.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    if (!["source", "output", "mode", "licenseRecord", "archiveUrl"].includes(key)) {
      throw new Error(`Unknown argument ${flag}.`);
    }
    output[key] = value;
    index += 1;
  }
  return output;
}
