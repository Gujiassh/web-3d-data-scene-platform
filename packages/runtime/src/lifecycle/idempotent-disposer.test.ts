import { describe, expect, it, vi } from "vitest";

import { IdempotentDisposer } from "./idempotent-disposer";

describe("IdempotentDisposer", () => {
  it("runs cleanup in reverse order exactly once", async () => {
    const calls: string[] = [];
    const disposer = new IdempotentDisposer();
    disposer.add(() => {
      calls.push("first");
    });
    disposer.add(() => {
      calls.push("second");
    });

    await Promise.all([disposer.dispose(), disposer.dispose()]);

    expect(calls).toEqual(["second", "first"]);
  });

  it("runs tasks added after disposal without reopening the disposer", async () => {
    const task = vi.fn();
    const disposer = new IdempotentDisposer();
    await disposer.dispose();
    disposer.add(task);
    await Promise.resolve();

    expect(task).toHaveBeenCalledOnce();
    expect(disposer.disposed).toBe(true);
  });
});
