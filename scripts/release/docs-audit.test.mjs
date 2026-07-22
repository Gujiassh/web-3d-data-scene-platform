import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { auditReleaseDocs, localMarkdownTargets } from "./docs-audit.mjs";

describe("release documentation audit", () => {
  it("resolves every required local documentation link", async () => {
    const result = await auditReleaseDocs(path.resolve(import.meta.dirname, "../.."));
    expect(result.files).toBeGreaterThanOrEqual(12);
    expect(result.localLinks).toBeGreaterThan(20);
  });

  it("ignores external links and retains decoded repository targets", () => {
    expect(
      localMarkdownTargets(
        "[local](docs/file.md#section) [spaced](<docs/My%20File.md>) [web](https://example.com) [anchor](#top)",
      ),
    ).toEqual(["docs/file.md", "docs/My File.md"]);
  });

  it("keeps SceneWeave discoverable without reviving the generic project name", async () => {
    const root = path.resolve(import.meta.dirname, "../..");
    const readme = await readFile(path.join(root, "README.md"), "utf8");
    const rootManifest = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));

    expect(readme).toMatch(/^# SceneWeave$/mu);
    expect(readme).toMatch(/open-source, self-hosted 3D scene editor and runtime/iu);
    expect(readme).toContain("data-driven Three.js experiences");
    expect(readme).toContain("digital twins");
    expect(readme).toContain("IoT visualization");
    expect(readme).toContain("artifacts/e2e/publish-parity-studio-run-1440x900.png");
    expect(readme).toContain("https://github.com/Gujiassh/sceneweave.git");
    expect(readme).not.toContain("Web 3D Data Scene Platform");
    expect(rootManifest).toMatchObject({
      name: "sceneweave",
      description:
        "Open-source, self-hosted editor and runtime for data-driven Three.js scenes, digital twins, IoT visualization, and embeddable WebGL viewers.",
      repository: { url: "git+https://github.com/Gujiassh/sceneweave.git" },
      homepage: "https://github.com/Gujiassh/sceneweave#readme",
      bugs: { url: "https://github.com/Gujiassh/sceneweave/issues" },
    });
    expect(rootManifest.keywords).toEqual(
      expect.arrayContaining([
        "threejs",
        "webgl",
        "react",
        "typescript",
        "scene-editor",
        "digital-twin",
        "iot",
        "data-visualization",
        "gltf",
        "self-hosted",
        "open-source",
      ]),
    );
  });
});
