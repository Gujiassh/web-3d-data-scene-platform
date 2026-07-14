import { systemAutosaveClock } from "./clock";
import type { AutosaveClock, AutosaveState, StudioProjectSnapshot } from "./types";

export interface AutosaveControllerOptions {
  readonly delayMs?: number;
  readonly clock?: AutosaveClock;
  readonly save: (snapshot: StudioProjectSnapshot) => Promise<void>;
  readonly onStateChange?: (state: AutosaveState) => void;
}

export interface AutosaveController {
  schedule(snapshot: StudioProjectSnapshot): void;
  flush(snapshot?: StudioProjectSnapshot): Promise<void>;
  close(): Promise<void>;
}

export function createAutosaveController(options: AutosaveControllerOptions): AutosaveController {
  const delayMs = options.delayMs ?? 500;
  const clock = options.clock ?? systemAutosaveClock;
  let closed = false;
  let closing = false;
  let closePromise: Promise<void> | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pendingSnapshot: StudioProjectSnapshot | null = null;
  let failedSnapshot: StudioProjectSnapshot | null = null;
  let running: Promise<void> | null = null;

  return {
    schedule(snapshot) {
      if (closed || closing) return;
      pendingSnapshot = snapshot;
      failedSnapshot = null;
      if (timer) {
        clock.clearTimeout(timer);
      }
      timer = clock.setTimeout(() => {
        timer = null;
        void flushPending().catch(() => undefined);
      }, delayMs);
    },
    async flush(snapshot) {
      if (closed || closing) return;
      if (snapshot) {
        pendingSnapshot = snapshot;
      }
      failedSnapshot = null;
      if (timer) {
        clock.clearTimeout(timer);
        timer = null;
      }
      await flushPending();
    },
    close() {
      closePromise ??= closeController();
      return closePromise;
    },
  };

  async function flushPending(): Promise<void> {
    while (!closed) {
      const active = running ?? startRun();
      if (!active) return;
      await active;
    }
  }

  async function closeController(): Promise<void> {
    closing = true;
    if (timer) {
      clock.clearTimeout(timer);
      timer = null;
    }
    try {
      if (pendingSnapshot !== failedSnapshot) await flushPending();
    } catch {
      // A final background save failure must not make repository cleanup fail.
    } finally {
      closed = true;
      pendingSnapshot = null;
    }
    const active = running;
    if (active) {
      try {
        await active;
      } catch {
        // The final save error has already been reported through onStateChange.
      }
    }
  }

  function startRun(): Promise<void> | null {
    if (closed || !pendingSnapshot) return null;

    const active = drainPending();
    running = active;
    const clearRunning = () => {
      if (running === active) {
        running = null;
      }
    };
    void active.then(clearRunning, clearRunning);
    return active;
  }

  async function drainPending(): Promise<void> {
    while (!closed && pendingSnapshot) {
      const snapshot = pendingSnapshot;
      pendingSnapshot = null;
      emit({ status: "saving", revision: snapshot.document.revision });
      try {
        await options.save(snapshot);
        if (failedSnapshot === snapshot) failedSnapshot = null;
        if (!closed) {
          emit({ status: "saved", revision: snapshot.document.revision });
        }
      } catch (error) {
        if (!closed) {
          pendingSnapshot ??= snapshot;
          failedSnapshot = snapshot;
          emit({
            status: "failed",
            revision: snapshot.document.revision,
            message: error instanceof Error ? error.message : String(error),
          });
        }
        throw error;
      }
    }
  }

  function emit(state: AutosaveState): void {
    options.onStateChange?.(state);
  }
}
