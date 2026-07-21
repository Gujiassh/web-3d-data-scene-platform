import { describe, expect, it, vi } from "vitest";

import type { ProjectRecord, StudioProjectRepository, StudioProjectSnapshot } from "../project";
import { createNewStudioProject } from "../session/new-project";

import { initializeRepository } from "./initialize-repository";

describe("initializeRepository", () => {
  it("opens an existing project without loading or saving a starter", async () => {
    const existing = snapshot("existing");
    const repository = fakeRepository({ recent: [existing.record], opened: existing });
    const loadStarter = vi.fn();

    const result = await initializeRepository({
      repository,
      signal: new AbortController().signal,
      loadStarter,
    });

    expect(result.current).toBe(existing);
    expect(loadStarter).not.toHaveBeenCalled();
    expect(repository.save).not.toHaveBeenCalled();
  });

  it("persists a complete starter only after loading succeeds", async () => {
    const starter = snapshot("starter");
    const repository = fakeRepository({ recent: [], saved: starter });

    const result = await initializeRepository({
      repository,
      signal: new AbortController().signal,
      loadStarter: vi.fn(async () => starter),
    });

    expect(repository.save).toHaveBeenCalledTimes(1);
    expect(repository.save).toHaveBeenCalledWith(starter);
    expect(result.current).toBe(starter);
  });

  it("does not persist anything when loading fails or is cancelled", async () => {
    const repository = fakeRepository({ recent: [] });
    const failure = new Error("archive invalid");
    await expect(
      initializeRepository({
        repository,
        signal: new AbortController().signal,
        loadStarter: vi.fn(async () => {
          throw failure;
        }),
      }),
    ).rejects.toBe(failure);
    expect(repository.save).not.toHaveBeenCalled();

    const controller = new AbortController();
    controller.abort(new DOMException("cancelled", "AbortError"));
    await expect(
      initializeRepository({
        repository,
        signal: controller.signal,
        loadStarter: vi.fn(async () => snapshot("never-saved")),
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(repository.save).not.toHaveBeenCalled();
  });

  it("opens the winner when another tab saves while the starter loads", async () => {
    const winner = snapshot("winner");
    const starter = snapshot("starter");
    const repository = fakeRepository({ recent: [], opened: winner });
    vi.mocked(repository.listRecent)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([winner.record])
      .mockResolvedValueOnce([winner.record]);

    const result = await initializeRepository({
      repository,
      signal: new AbortController().signal,
      loadStarter: vi.fn(async () => starter),
    });

    expect(result.current).toBe(winner);
    expect(repository.open).toHaveBeenCalledWith("winner");
    expect(repository.save).not.toHaveBeenCalled();
  });

  it("serializes two clean tabs through one initialization authority", async () => {
    const starter = snapshot("starter");
    let recent: readonly ProjectRecord[] = [];
    const repository = fakeRepository({ recent: [] });
    vi.mocked(repository.listRecent).mockImplementation(async () => recent);
    vi.mocked(repository.save).mockImplementation(async (value) => {
      recent = [value.record];
      return value;
    });
    vi.mocked(repository.open).mockImplementation(async () => starter);
    let barrier = Promise.resolve();
    const withAuthority = async (
      operation: () => Promise<Awaited<ReturnType<typeof initializeRepository>>>,
    ) => {
      const result = barrier.then(operation);
      barrier = result.then(() => undefined);
      return result;
    };
    const firstLoader = vi.fn(async () => starter);
    const secondLoader = vi.fn(async () => starter);

    const [first, second] = await Promise.all([
      initializeRepository({
        repository,
        signal: new AbortController().signal,
        loadStarter: firstLoader,
        withAuthority,
      }),
      initializeRepository({
        repository,
        signal: new AbortController().signal,
        loadStarter: secondLoader,
        withAuthority,
      }),
    ]);

    expect(first.current.record.id).toBe("starter");
    expect(second.current.record.id).toBe("starter");
    expect(repository.save).toHaveBeenCalledTimes(1);
    expect(firstLoader).toHaveBeenCalledTimes(1);
    expect(secondLoader).not.toHaveBeenCalled();
  });
});

function fakeRepository(options: {
  readonly recent: readonly ProjectRecord[];
  readonly opened?: StudioProjectSnapshot;
  readonly saved?: StudioProjectSnapshot;
}): StudioProjectRepository {
  return {
    save: vi.fn(async (value) => options.saved ?? value),
    open: vi.fn(async () => options.opened ?? snapshot("opened")),
    listRecent: vi.fn(async () => options.recent),
    delete: vi.fn(async () => undefined),
    resolveAsset: vi.fn(async () => new Blob()),
    close: vi.fn(async () => undefined),
  };
}

function snapshot(id: string): StudioProjectSnapshot {
  return createNewStudioProject({
    id,
    name: id,
    createdAt: "2026-07-20T08:00:00.000Z",
  });
}
