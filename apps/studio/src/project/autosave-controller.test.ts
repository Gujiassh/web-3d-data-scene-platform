import { afterEach, describe, expect, it, vi } from "vitest";

import { createAutosaveController, type AutosaveState, type ProjectRecord } from "./index";

import type { SceneDocument } from "@web3d/document";
import type { StudioProjectSnapshot } from "./types";

describe("createAutosaveController", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("debounces autosave and supports explicit flush", async () => {
    vi.useFakeTimers();
    const saves: number[] = [];
    const states: AutosaveState[] = [];
    const controller = createAutosaveController({
      save: async (snapshot) => {
        saves.push(snapshot.document.revision);
      },
      onStateChange: (state) => states.push(state),
    });

    controller.schedule(snapshot(1));
    controller.schedule(snapshot(2));
    await vi.advanceTimersByTimeAsync(499);
    expect(saves).toEqual([]);

    await controller.flush();
    expect(saves).toEqual([2]);
    expect(states).toEqual([
      { status: "saving", revision: 2 },
      { status: "saved", revision: 2 },
    ]);
  });

  it("reports failed saves and recovers on the next flush", async () => {
    vi.useFakeTimers();
    const states: AutosaveState[] = [];
    const failure = new Error("disk full");
    const save = vi
      .fn<(snapshot: StudioProjectSnapshot) => Promise<void>>()
      .mockRejectedValueOnce(failure)
      .mockResolvedValue(undefined);

    const controller = createAutosaveController({
      save,
      onStateChange: (state) => states.push(state),
    });

    await expect(controller.flush(snapshot(3))).rejects.toBe(failure);
    expect(states.at(-1)).toEqual({ status: "failed", revision: 3, message: "disk full" });

    await controller.flush();
    expect(save.mock.calls.map(([value]) => value.document.revision)).toEqual([3, 3]);
    expect(states.slice(-2)).toEqual([
      { status: "saving", revision: 3 },
      { status: "saved", revision: 3 },
    ]);
  });

  it("rejects a flush waiting for an already-running failed save", async () => {
    vi.useFakeTimers();
    const states: AutosaveState[] = [];
    const failure = new Error("write failed");
    let rejectSave!: (reason: Error) => void;
    const save = vi.fn(
      () =>
        new Promise<void>((_, reject) => {
          rejectSave = reject;
        }),
    );
    const controller = createAutosaveController({
      save,
      onStateChange: (state) => states.push(state),
    });

    controller.schedule(snapshot(4));
    await vi.advanceTimersByTimeAsync(500);
    expect(save).toHaveBeenCalledTimes(1);

    const flushResult = expect(controller.flush()).rejects.toBe(failure);
    rejectSave(failure);
    await flushResult;
    expect(states.at(-1)).toEqual({
      status: "failed",
      revision: 4,
      message: "write failed",
    });
    await controller.close();
  });

  it("contains timer-triggered save failures after emitting failed", async () => {
    vi.useFakeTimers();
    const states: AutosaveState[] = [];
    const save = vi
      .fn<(snapshot: StudioProjectSnapshot) => Promise<void>>()
      .mockRejectedValue(new Error("background failed"));
    const controller = createAutosaveController({
      save,
      onStateChange: (state) => states.push(state),
    });

    controller.schedule(snapshot(5));
    await vi.advanceTimersByTimeAsync(500);
    await Promise.resolve();

    expect(states).toEqual([
      { status: "saving", revision: 5 },
      { status: "failed", revision: 5, message: "background failed" },
    ]);
    await controller.close();
  });

  it("closes cleanly while a running save fails", async () => {
    vi.useFakeTimers();
    const failure = new Error("late failure");
    let rejectSave!: (reason: Error) => void;
    const save = vi.fn(
      () =>
        new Promise<void>((_, reject) => {
          rejectSave = reject;
        }),
    );
    const controller = createAutosaveController({ save });

    controller.schedule(snapshot(6));
    await vi.advanceTimersByTimeAsync(500);
    expect(save).toHaveBeenCalledTimes(1);

    const closing = controller.close();
    rejectSave(failure);
    await expect(closing).resolves.toBeUndefined();
    await vi.runAllTimersAsync();
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("flushes one pending snapshot on close and ignores later schedules", async () => {
    vi.useFakeTimers();
    const save = vi
      .fn<(snapshot: StudioProjectSnapshot) => Promise<void>>()
      .mockResolvedValue(undefined);
    const controller = createAutosaveController({ save });

    controller.schedule(snapshot(7));
    await controller.close();
    controller.schedule(snapshot(8));
    await vi.advanceTimersByTimeAsync(1000);

    expect(save.mock.calls.map(([value]) => value.document.revision)).toEqual([7]);
  });
});

function snapshot(revision: number): StudioProjectSnapshot {
  const record: ProjectRecord = {
    id: "project",
    name: "Project",
    createdAt: "2026-07-14T08:00:00.000Z",
    updatedAt: "2026-07-14T08:00:00.000Z",
    lastOpenedAt: "2026-07-14T08:00:00.000Z",
    lastSavedRevision: revision,
    lastExportedRevision: null,
  };

  const document: SceneDocument = {
    schemaVersion: "1.0.0",
    id: "project",
    name: "Project",
    revision,
    assets: [],
    entities: [],
    targets: [],
    dataSources: [],
    bindings: [],
    ruleSets: [],
    annotations: [],
    views: [],
    environment: {
      background: "#ffffff",
      grid: true,
      unit: "m",
      upAxis: "Y",
    },
  };

  return { record, document, assets: [] };
}
