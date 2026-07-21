import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export default async function feature009GlobalSetup(): Promise<void> {
  await execFileAsync("pnpm", ["--filter", "@web3d/minimal-host", "build"], {
    cwd: path.resolve(import.meta.dirname, "../.."),
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
}
