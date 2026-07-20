import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { extname, relative, resolve, sep } from "node:path";

import { unzipSync } from "fflate";
import { createServer } from "vite";

const packageRoot = resolve(import.meta.dirname, "..");
const repoRoot = resolve(packageRoot, "../..");
const distRoot = resolve(packageRoot, "dist");
const publishedRoot = resolve(distRoot, "published");
const html = await readFile(resolve(distRoot, "index.html"), "utf8");
const fixtureReport = JSON.parse(await readFile(resolve(distRoot, "fixture-report.json"), "utf8"));
const scriptFiles = (await filesUnder(resolve(distRoot, "assets"))).filter(
  (path) => extname(path) === ".js",
);

assert.match(html, /http-equiv="Content-Security-Policy"/u);
assert.doesNotMatch(html, /unsafe-eval|unsafe-inline/u);
for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/giu)) {
  assert.match(match[1] ?? "", /\bsrc=/u, "Production HTML contains an inline executable script.");
  assert.equal((match[2] ?? "").trim(), "", "Production HTML contains inline script content.");
}

for (const scriptPath of scriptFiles) {
  const script = await readFile(scriptPath, "utf8");
  assert.doesNotMatch(script, /\beval\s*\(/u, `${relative(distRoot, scriptPath)} uses eval().`);
  assert.doesNotMatch(
    script,
    /\bnew\s+Function\s*\(/u,
    `${relative(distRoot, scriptPath)} uses new Function().`,
  );
}

const zipBytes = new Uint8Array(await readFile(resolve(distRoot, fixtureReport.zip.path)));
assert.equal(sha256(zipBytes), fixtureReport.zip.sha256);
const zipFiles = unzipSync(zipBytes);
const explodedFiles = await relativeFiles(publishedRoot);
assert.deepEqual(Object.keys(zipFiles).sort(), explodedFiles);
for (const path of explodedFiles) {
  assert.deepEqual(zipFiles[path], new Uint8Array(await readFile(resolve(publishedRoot, path))));
}

const server = await createServer({
  root: repoRoot,
  appType: "custom",
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true },
});

try {
  const { loadPublishedScene } = await server.ssrLoadModule("/packages/publish/src/index.ts");
  const loaded = await loadPublishedScene({
    baseUrl: "https://published.example.test/published/",
    fetch: fixtureFetch,
  });
  assert.equal(loaded.document.id, "published-factory-scene");
  assert.equal(loaded.document.revision, 4);
  assert.deepEqual(loaded.manifest.requirements, {
    dataSources: [{ sourceId: "factory-telemetry", adapter: "mock" }],
    trustedContentKeys: ["inspection-card"],
  });
  const asset = loaded.document.assets[0];
  assert.ok(asset);
  const resolved = await loaded.assetResolver.resolve(
    asset,
    new globalThis.AbortController().signal,
  );
  assert.ok(resolved instanceof globalThis.Blob);
  assert.equal(sha256(new Uint8Array(await resolved.arrayBuffer())), asset.sha256);
} finally {
  await server.close();
}

process.stdout.write(
  `minimal-host-verify status=pass publishedFiles=${explodedFiles.length} scripts=${scriptFiles.length} noEval=true loaderRoundTrip=true\n`,
);

async function fixtureFetch(input, init) {
  init?.signal?.throwIfAborted();
  const url = new URL(input instanceof globalThis.Request ? input.url : input);
  const prefix = "/published/";
  if (!url.pathname.startsWith(prefix)) {
    return new globalThis.Response(null, { status: 404 });
  }
  const path = decodeURIComponent(url.pathname.slice(prefix.length));
  if (path.length === 0 || path.includes("..") || path.includes("\\")) {
    return new globalThis.Response(null, { status: 404 });
  }
  try {
    const bytes = await readFile(resolve(publishedRoot, ...path.split("/")));
    return new globalThis.Response(bytes, {
      status: 200,
      headers: { "Content-Type": mediaType(path) },
    });
  } catch {
    return new globalThis.Response(null, { status: 404 });
  }
}

function mediaType(path) {
  if (path.endsWith(".json")) return "application/json";
  if (path.endsWith(".glb")) return "model/gltf-binary";
  throw new Error(`Unsupported fixture media type for ${path}.`);
}

async function relativeFiles(root) {
  return (await filesUnder(root)).map((path) => relative(root, path).split(sep).join("/")).sort();
}

async function filesUnder(root) {
  const files = [];
  await walk(root);
  return files.sort();

  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile()) files.push(path);
    }
  }
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}
