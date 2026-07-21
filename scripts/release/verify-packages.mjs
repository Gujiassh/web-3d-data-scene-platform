import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(import.meta.dirname, "../..");
const releaseVersion = "0.1.0-rc.1";
const repositoryUrl = "git+https://github.com/Gujiassh/web-3d-data-scene-platform.git";
const requiredFiles = ["dist", "LICENSE", "THIRD_PARTY_NOTICES.md"];
const packageDefinitions = [
  {
    directory: "document",
    name: "@web3d/document",
    dependencies: [],
    notices: [
      {
        installedVersion: "8.20.0",
        license: "MIT",
        licensePath: "packages/document/node_modules/ajv/LICENSE",
        name: "ajv",
        source: "https://github.com/ajv-validator/ajv",
        specifier: "8.20.0",
      },
      {
        installedVersion: "0.8.3",
        license: "MIT",
        licensePath: "packages/document/node_modules/fflate/LICENSE",
        name: "fflate",
        source: "https://github.com/101arrowz/fflate",
        specifier: "0.8.3",
      },
    ],
  },
  {
    directory: "runtime",
    name: "@web3d/runtime",
    dependencies: ["@web3d/document"],
    notices: [
      {
        installedVersion: "0.185.1",
        license: "MIT",
        licensePath: "node_modules/@types/three/LICENSE",
        name: "@types/three",
        source: "https://github.com/DefinitelyTyped/DefinitelyTyped",
        specifier: "0.185.1",
      },
      {
        installedVersion: "0.185.1",
        license: "MIT",
        licensePath: "packages/runtime/node_modules/three/LICENSE",
        name: "three",
        source: "https://github.com/mrdoob/three.js",
        specifier: "0.185.1",
      },
    ],
  },
  {
    directory: "react",
    name: "@web3d/react",
    dependencies: ["@web3d/document", "@web3d/runtime"],
    notices: [
      {
        installedVersion: "19.2.7",
        license: "MIT",
        licensePath: "packages/react/node_modules/react/LICENSE",
        name: "react",
        source: "https://github.com/facebook/react",
        specifier: "^19.2.0",
      },
      {
        installedVersion: "19.2.7",
        license: "MIT",
        licensePath: "packages/react/node_modules/react-dom/LICENSE",
        name: "react-dom",
        source: "https://github.com/facebook/react",
        specifier: "^19.2.0",
      },
    ],
  },
  {
    directory: "publish",
    name: "@web3d/publish",
    dependencies: ["@web3d/document", "@web3d/runtime"],
    notices: [
      {
        installedVersion: "0.8.3",
        license: "MIT",
        licensePath: "packages/publish/node_modules/fflate/LICENSE",
        name: "fflate",
        source: "https://github.com/101arrowz/fflate",
        specifier: "0.8.3",
      },
    ],
  },
];

const temporaryRoot = await mkdtemp(path.join(tmpdir(), "web3d-package-verification-"));

try {
  await buildPackages();
  const first = await packSet("first");
  const second = await packSet("second");

  for (const definition of packageDefinitions) {
    const firstTarball = requiredMapValue(first, definition.name);
    const secondTarball = requiredMapValue(second, definition.name);
    const firstHash = await fileHash(firstTarball);
    const secondHash = await fileHash(secondTarball);
    assert(
      firstHash === secondHash,
      `${definition.name} tarballs are not byte-identical: ${firstHash} != ${secondHash}`,
    );
    await verifyTarball(definition, firstTarball);
    process.stdout.write(
      `package-tarball name=${definition.name} version=${releaseVersion} sha256=${firstHash}\n`,
    );
  }

  await verifyCleanConsumer(first);
  process.stdout.write(
    `package-verification status=PASS packages=${packageDefinitions.length} consumer=framework-neutral,react\n`,
  );
} finally {
  await rm(temporaryRoot, { force: true, recursive: true });
}

async function buildPackages() {
  for (const definition of packageDefinitions) {
    await run("pnpm", ["--filter", definition.name, "build"], repoRoot);
  }
}

async function packSet(label) {
  const outputDirectory = path.join(temporaryRoot, label, "tarballs");
  await mkdir(outputDirectory, { recursive: true });
  const output = new Map();

  for (const definition of packageDefinitions) {
    const stageDirectory = path.join(temporaryRoot, label, "staging", definition.directory);
    await stagePackage(definition, stageDirectory);
    const { stdout } = await run(
      "pnpm",
      ["pack", "--json", "--pack-destination", outputDirectory],
      stageDirectory,
    );
    const result = JSON.parse(stdout);
    assert(
      result.name === definition.name && result.version === releaseVersion,
      `${definition.name} pack identity does not match its manifest.`,
    );
    output.set(
      definition.name,
      path.isAbsolute(result.filename)
        ? result.filename
        : path.join(outputDirectory, result.filename),
    );
  }
  return output;
}

async function stagePackage(definition, stageDirectory) {
  const packageDirectory = path.join(repoRoot, "packages", definition.directory);
  const sourceManifest = JSON.parse(
    await readFile(path.join(packageDirectory, "package.json"), "utf8"),
  );
  verifySourceManifest(definition, sourceManifest);

  await mkdir(stageDirectory, { recursive: true });
  await cp(path.join(packageDirectory, "dist"), path.join(stageDirectory, "dist"), {
    recursive: true,
  });
  await cp(path.join(repoRoot, "LICENSE"), path.join(stageDirectory, "LICENSE"));
  await writeFile(
    path.join(stageDirectory, "THIRD_PARTY_NOTICES.md"),
    await thirdPartyNotices(definition),
    "utf8",
  );
  await writeFile(
    path.join(stageDirectory, "package.json"),
    `${JSON.stringify(packedManifest(sourceManifest), null, 2)}\n`,
    "utf8",
  );
}

function verifySourceManifest(definition, manifest) {
  assert(
    manifest.name === definition.name,
    `${definition.name} source manifest has the wrong name.`,
  );
  assert(
    manifest.version === releaseVersion,
    `${definition.name} must use the frozen ${releaseVersion} release version.`,
  );
  assert(manifest.license === "MIT", `${definition.name} must declare the MIT license.`);
  assert(
    manifest.repository?.url === repositoryUrl,
    `${definition.name} repository URL is invalid.`,
  );
  assert(
    manifest.repository?.directory === `packages/${definition.directory}`,
    `${definition.name} repository directory is invalid.`,
  );
  assert(manifest.engines?.node === ">=22.12.0", `${definition.name} Node engine is invalid.`);
  assert(manifest.sideEffects === false, `${definition.name} must declare sideEffects=false.`);
  assert(
    manifest.types === "./src/index.ts",
    `${definition.name} workspace types must resolve source.`,
  );
  assert(
    manifest.exports?.["."] === "./src/index.ts",
    `${definition.name} workspace export is invalid.`,
  );
  assert(
    JSON.stringify(manifest.files) === JSON.stringify(requiredFiles),
    `${definition.name} files allowlist is invalid.`,
  );
  assert(
    manifest.publishConfig?.types === "./dist/index.d.ts" &&
      manifest.publishConfig?.exports?.["."]?.types === "./dist/index.d.ts" &&
      manifest.publishConfig?.exports?.["."]?.import === "./dist/index.js" &&
      manifest.publishConfig?.exports?.["."]?.default === "./dist/index.js",
    `${definition.name} publishConfig does not expose the dist entry.`,
  );
  verifyThirdPartyCoverage(definition, manifest);
}

function packedManifest(source) {
  const output = {
    ...source,
    types: source.publishConfig.types,
    exports: source.publishConfig.exports,
    dependencies: rewriteWorkspaceDependencies(source.dependencies),
  };
  delete output.private;
  delete output.publishConfig;
  delete output.scripts;
  if (output.dependencies === undefined) delete output.dependencies;
  return output;
}

function rewriteWorkspaceDependencies(dependencies) {
  if (dependencies === undefined) return undefined;
  return Object.fromEntries(
    Object.entries(dependencies).map(([name, version]) => [
      name,
      typeof version === "string" && version.startsWith("workspace:")
        ? requiredPackageVersion(name)
        : version,
    ]),
  );
}

function requiredPackageVersion(name) {
  assert(
    packageDefinitions.some((definition) => definition.name === name),
    `Workspace dependency ${name} is not a public release package.`,
  );
  return releaseVersion;
}

async function verifyTarball(definition, tarball) {
  const { stdout: listingOutput } = await run("tar", ["-tzf", tarball], repoRoot);
  const listing = listingOutput
    .trim()
    .split("\n")
    .filter((entry) => entry.length > 0 && !entry.endsWith("/"))
    .toSorted();
  const expectedDist = (
    await relativeFiles(path.join(repoRoot, "packages", definition.directory, "dist"))
  )
    .map((file) => `package/dist/${file}`)
    .toSorted();
  const expected = [
    "package/LICENSE",
    "package/THIRD_PARTY_NOTICES.md",
    "package/package.json",
    ...expectedDist,
  ].toSorted();

  assert(
    JSON.stringify(listing) === JSON.stringify(expected),
    `${definition.name} tarball content differs from the explicit allowlist.`,
  );
  assert(listing.includes("package/dist/index.js"), `${definition.name} is missing ESM output.`);
  assert(
    listing.includes("package/dist/index.d.ts"),
    `${definition.name} is missing declarations.`,
  );
  assert(
    listing.every(
      (entry) =>
        !entry.includes("node_modules") &&
        !entry.includes("/src/") &&
        !entry.endsWith(".test.d.ts") &&
        !entry.includes("test-fixture") &&
        !entry.includes("hotspot-test-dom"),
    ),
    `${definition.name} tarball contains source, test, or dependency files.`,
  );

  const manifest = JSON.parse(await tarText(tarball, "package/package.json"));
  assert(manifest.private === undefined, `${definition.name} packed manifest is private.`);
  assert(
    manifest.publishConfig === undefined,
    `${definition.name} packed publishConfig was not applied.`,
  );
  assert(
    manifest.scripts === undefined,
    `${definition.name} packed manifest exposes workspace scripts.`,
  );
  assert(
    manifest.types === "./dist/index.d.ts",
    `${definition.name} packed types entry is invalid.`,
  );
  assert(
    manifest.exports?.["."]?.types === "./dist/index.d.ts" &&
      manifest.exports?.["."]?.import === "./dist/index.js" &&
      manifest.exports?.["."]?.default === "./dist/index.js",
    `${definition.name} packed export map is invalid.`,
  );
  assert(
    !JSON.stringify(manifest).includes("workspace:"),
    `${definition.name} retains workspace ranges.`,
  );
  for (const dependency of definition.dependencies) {
    assert(
      manifest.dependencies?.[dependency] === releaseVersion,
      `${definition.name} dependency ${dependency} was not rewritten to ${releaseVersion}.`,
    );
  }

  const sourceLicense = await readFile(path.join(repoRoot, "LICENSE"), "utf8");
  assert(
    (await tarText(tarball, "package/LICENSE")) === sourceLicense,
    `${definition.name} does not contain the repository MIT license bytes.`,
  );
  assert(
    (await tarText(tarball, "package/THIRD_PARTY_NOTICES.md")) ===
      (await thirdPartyNotices(definition)),
    `${definition.name} third-party notice is not deterministic.`,
  );
}

async function verifyCleanConsumer(tarballs) {
  const consumerDirectory = path.join(temporaryRoot, "clean-consumer");
  await mkdir(path.join(consumerDirectory, "src"), { recursive: true });
  const tarballDependency = (name) => `file:${requiredMapValue(tarballs, name)}`;
  const manifest = {
    name: "web3d-clean-consumer",
    version: "1.0.0",
    private: true,
    type: "module",
    scripts: {
      build:
        "tsc --noEmit && vite build --config vite.neutral.config.mjs && vite build --config vite.react.config.mjs",
    },
    dependencies: {
      "@web3d/document": tarballDependency("@web3d/document"),
      "@web3d/publish": tarballDependency("@web3d/publish"),
      "@web3d/react": tarballDependency("@web3d/react"),
      "@web3d/runtime": tarballDependency("@web3d/runtime"),
      react: "19.2.7",
      "react-dom": "19.2.7",
    },
    devDependencies: {
      "@types/react": "19.2.17",
      "@types/react-dom": "19.2.3",
      typescript: "6.0.3",
      vite: "8.1.4",
    },
    pnpm: {
      overrides: Object.fromEntries(
        packageDefinitions.map((definition) => [
          definition.name,
          tarballDependency(definition.name),
        ]),
      ),
    },
  };
  await writeFile(
    path.join(consumerDirectory, "package.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    path.join(consumerDirectory, "tsconfig.json"),
    `${JSON.stringify(
      {
        compilerOptions: {
          exactOptionalPropertyTypes: true,
          jsx: "react-jsx",
          lib: ["ES2023", "DOM", "DOM.Iterable"],
          module: "ESNext",
          moduleResolution: "Bundler",
          noEmit: true,
          skipLibCheck: false,
          strict: true,
          target: "ES2022",
        },
        include: ["src/**/*.ts", "src/**/*.tsx"],
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  await writeFile(
    path.join(consumerDirectory, "src/framework-neutral.ts"),
    `import { parseSceneDocument, type SceneDocument } from "@web3d/document";
import { createPublishBundle } from "@web3d/publish";
import { createSceneViewer } from "@web3d/runtime";

export const frameworkNeutralSurface = {
  createPublishBundle,
  createSceneViewer,
  parseSceneDocument,
};
export type FrameworkNeutralDocument = SceneDocument;
`,
    "utf8",
  );
  await writeFile(
    path.join(consumerDirectory, "src/react.tsx"),
    `import { createElement, type ReactElement } from "react";
import { SceneViewer, type SceneViewerProps } from "@web3d/react";

export function createViewerElement(props: SceneViewerProps): ReactElement {
  return createElement(SceneViewer, props);
}
`,
    "utf8",
  );
  await writeFile(
    path.join(consumerDirectory, "vite.neutral.config.mjs"),
    viteConsumerConfig("src/framework-neutral.ts", "dist-neutral", "framework-neutral"),
    "utf8",
  );
  await writeFile(
    path.join(consumerDirectory, "vite.react.config.mjs"),
    viteConsumerConfig("src/react.tsx", "dist-react", "react"),
    "utf8",
  );

  await run(
    "pnpm",
    ["install", "--offline", "--ignore-scripts", "--frozen-lockfile=false"],
    consumerDirectory,
  );
  await run(
    "node",
    [
      "--input-type=module",
      "--eval",
      'await Promise.all(["@web3d/document", "@web3d/runtime", "@web3d/publish", "@web3d/react"].map((name) => import(name)));',
    ],
    consumerDirectory,
  );
  await run("pnpm", ["run", "build"], consumerDirectory);

  for (const directory of ["dist-neutral", "dist-react"]) {
    const files = await relativeFiles(path.join(consumerDirectory, directory));
    assert(
      files.some((file) => file.endsWith(".js")),
      `${directory} did not emit JavaScript.`,
    );
    for (const file of files.filter((candidate) => candidate.endsWith(".js"))) {
      const content = await readFile(path.join(consumerDirectory, directory, file), "utf8");
      assert(!content.includes(repoRoot), `${directory}/${file} resolved workspace source.`);
    }
  }
}

function viteConsumerConfig(entry, outDir, fileName) {
  return `export default {
  build: {
    emptyOutDir: true,
    lib: { entry: ${JSON.stringify(entry)}, fileName: () => ${JSON.stringify(`${fileName}.js`)}, formats: ["es"] },
    minify: false,
    outDir: ${JSON.stringify(outDir)},
    target: "es2022",
  },
};
`;
}

async function thirdPartyNotices(definition) {
  const sections = await Promise.all(
    definition.notices.map(async (notice) => {
      const packageDirectory = path.dirname(path.join(repoRoot, notice.licensePath));
      const manifest = JSON.parse(
        await readFile(path.join(packageDirectory, "package.json"), "utf8"),
      );
      assert(
        manifest.name === notice.name &&
          manifest.version === notice.installedVersion &&
          manifest.license === notice.license,
        `${definition.name} notice source ${notice.name} does not match installed metadata.`,
      );
      const licenseText = (await readFile(path.join(repoRoot, notice.licensePath), "utf8")).trim();
      return `## ${notice.name}@${notice.specifier}

- Verified installed version: \`${notice.installedVersion}\`
- License: ${notice.license}
- Source: ${notice.source}

\`\`\`text
${licenseText}
\`\`\``;
    }),
  );
  return `# Third-Party Notices

The package JavaScript does not bundle font files. Its declared runtime or peer dependencies include:

${sections.join("\n\n")}

Dependency code remains governed by the license identified above. This notice does not modify those terms.
`;
}

function verifyThirdPartyCoverage(definition, manifest) {
  const declared = { ...manifest.dependencies, ...manifest.peerDependencies };
  for (const [name, specifier] of Object.entries(declared)) {
    if (name.startsWith("@web3d/")) continue;
    assert(
      definition.notices.some((notice) => notice.name === name && notice.specifier === specifier),
      `${definition.name} dependency ${name}@${specifier} lacks an exact third-party notice.`,
    );
  }
}

async function relativeFiles(root, prefix = "") {
  const output = [];
  for (const entry of await readdir(path.join(root, prefix), { withFileTypes: true })) {
    const relative = path.posix.join(prefix.split(path.sep).join(path.posix.sep), entry.name);
    if (entry.isDirectory()) output.push(...(await relativeFiles(root, relative)));
    else if (entry.isFile()) output.push(relative);
  }
  return output;
}

async function tarText(tarball, entry) {
  return (await run("tar", ["-xOzf", tarball, entry], repoRoot)).stdout;
}

async function fileHash(file) {
  return createHash("sha256")
    .update(await readFile(file))
    .digest("hex");
}

async function run(command, args, cwd) {
  try {
    return await execFileAsync(command, args, {
      cwd,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch (error) {
    if (typeof error?.stdout === "string") process.stderr.write(error.stdout);
    if (typeof error?.stderr === "string") process.stderr.write(error.stderr);
    throw error;
  }
}

function requiredMapValue(map, key) {
  const value = map.get(key);
  assert(value !== undefined, `Missing package artifact for ${key}.`);
  return value;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
