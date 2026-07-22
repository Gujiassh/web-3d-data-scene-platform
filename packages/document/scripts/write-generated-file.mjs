import { open, readFile, rename, rm } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export async function writeGeneratedFile(targetPath, content, options = {}) {
  let existing;
  try {
    existing = await readFile(targetPath, "utf8");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  if (existing === content) return false;

  const temporaryPath = path.join(
    path.dirname(targetPath),
    `.${path.basename(targetPath)}.${process.pid}.${randomUUID()}.tmp`,
  );
  const renameFile = options.renameFile ?? rename;

  try {
    const handle = await open(temporaryPath, "wx");
    try {
      await handle.writeFile(content, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await renameFile(temporaryPath, targetPath);
    return true;
  } finally {
    await rm(temporaryPath, { force: true });
  }
}
