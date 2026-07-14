import type { AutosaveClock, RepositoryClock } from "./types";

export const systemRepositoryClock: RepositoryClock = {
  now: () => new Date(),
};

export const systemAutosaveClock: AutosaveClock = {
  setTimeout: (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
  clearTimeout: (handle) => globalThis.clearTimeout(handle),
};
