import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { createServer } from "vite";

const repoRoot = resolve(import.meta.dirname, "../../..");
const outputDirectory = resolve(repoRoot, "apps/studio/public/test-starter");
const archiveFileName = "untitled-project.web3d.zip";
const document = {
  schemaVersion: "1.4.0",
  id: "untitled-project",
  name: "Untitled Scene",
  revision: 0,
  assets: [],
  entities: [],
  targets: [],
  dataSources: [],
  bindings: [],
  ruleSets: [],
  annotations: [],
  views: [],
  environment: {
    backgroundMode: "theme",
    background: "#F4F6F5",
    grid: true,
    unit: "m",
    upAxis: "Y",
    lighting: {
      fill: { skyColor: "#FFFFFF", groundColor: "#65706A", intensity: 1.8 },
      key: {
        color: "#FFFFFF",
        intensity: 2.2,
        directionToLight: [0.37904902178945177, 0.7580980435789035, 0.5306686305052324],
      },
    },
  },
};

const server = await createServer({
  root: repoRoot,
  appType: "custom",
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true },
});

try {
  const documentApi = await server.ssrLoadModule("/packages/document/src/index.ts");
  const validation = documentApi.validateSceneDocument(document);
  if (!validation.ok) {
    throw new Error(`Test starter is invalid: ${validation.diagnostics[0]?.message}`);
  }
  const archive = await documentApi.exportSceneArchive({
    document: validation.value,
    createdAt: "2026-07-20T00:00:00.000Z",
    resolveAssetBytes: new Map(),
  });
  const descriptor = {
    schemaVersion: "1.0.0",
    projectId: document.id,
    archiveUrl: `/test-starter/${archiveFileName}`,
    archiveSha256: createHash("sha256").update(archive).digest("hex"),
    archiveByteLength: archive.byteLength,
  };
  await mkdir(outputDirectory, { recursive: true });
  await Promise.all([
    writeFile(resolve(outputDirectory, archiveFileName), archive),
    writeFile(
      resolve(outputDirectory, "descriptor.json"),
      `${JSON.stringify(descriptor, null, 2)}\n`,
    ),
  ]);
  process.stdout.write(
    `studio-test-starter archiveSha256=${descriptor.archiveSha256} archiveBytes=${descriptor.archiveByteLength}\n`,
  );
} finally {
  await server.close();
}
