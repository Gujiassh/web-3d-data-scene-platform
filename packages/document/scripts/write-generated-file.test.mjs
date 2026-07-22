import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { writeGeneratedFile } from "./write-generated-file.mjs";

const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe("writeGeneratedFile", () => {
  it("does not touch an unchanged generated file", async () => {
    const target = await temporaryTarget();
    expect(await writeGeneratedFile(target, "export default 1;\n")).toBe(true);
    const before = await stat(target, { bigint: true });

    expect(await writeGeneratedFile(target, "export default 1;\n")).toBe(false);

    const after = await stat(target, { bigint: true });
    expect(after.ino).toBe(before.ino);
    expect(after.mtimeNs).toBe(before.mtimeNs);
    expect(await readFile(target, "utf8")).toBe("export default 1;\n");
  });

  it("atomically replaces a changed generated file", async () => {
    const target = await temporaryTarget();
    await writeGeneratedFile(target, "old validator\n");
    const before = await stat(target, { bigint: true });

    expect(await writeGeneratedFile(target, "export default validate;\n")).toBe(true);

    const after = await stat(target, { bigint: true });
    expect(after.ino).not.toBe(before.ino);
    expect(await readFile(target, "utf8")).toBe("export default validate;\n");
    expect(await readdir(path.dirname(target))).toEqual([path.basename(target)]);
  });

  it("preserves the old file and cleans the temporary file when replacement fails", async () => {
    const target = await temporaryTarget();
    await writeGeneratedFile(target, "old validator\n");

    await expect(
      writeGeneratedFile(target, "new validator\n", {
        renameFile: async () => {
          throw new Error("simulated rename failure");
        },
      }),
    ).rejects.toThrow("simulated rename failure");

    expect(await readFile(target, "utf8")).toBe("old validator\n");
    expect(await readdir(path.dirname(target))).toEqual([path.basename(target)]);
  });
});

async function temporaryTarget() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "sceneweave-generated-file-"));
  temporaryDirectories.push(directory);
  return path.join(directory, "validator.js");
}
