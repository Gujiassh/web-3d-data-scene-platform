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
});
