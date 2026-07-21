import type {
  AdapterContext,
  DataAdapter,
  DataEnvelope,
  JsonPrimitive,
  JsonValue,
  PatchEnvelope,
} from "../../packages/runtime/src/index";

import {
  FIXTURE_BINDING_COUNT,
  FIXTURE_PATCH_RATE_HZ,
  FIXTURE_SOURCE_ID,
  fixturePointer,
  initialStatus,
} from "./fixture-contract";

export interface PatchEmission {
  readonly sequence: number;
  readonly emittedAt: number;
  readonly pointer: string;
  readonly value: JsonPrimitive;
  readonly kind: "rate" | "probe";
}

export interface PatchRateAdapterHooks {
  readonly connectionStarted: () => void;
  readonly connectionStopped: () => void;
  readonly onPatch?: (emission: PatchEmission) => void;
}

export interface PatchRateStats {
  readonly configuredHz: number;
  readonly emittedPatches: number;
  readonly activeElapsedMs: number;
  readonly actualHz: number;
  readonly distinctPointers: number;
}

export class PatchRateAdapter implements DataAdapter {
  readonly sourceId = FIXTURE_SOURCE_ID;
  readonly #initialValue: JsonValue;
  readonly #hooks: PatchRateAdapterHooks;
  readonly #listeners = new Set<(envelope: DataEnvelope) => void>();
  readonly #ratePointers = new Set<string>();

  #context: AdapterContext | null = null;
  #timer: ReturnType<typeof setTimeout> | null = null;
  #sequence = 0;
  #ratePatchCount = 0;
  #activeElapsedMs = 0;
  #activeStartedAt: number | null = null;
  #started = false;
  #paused = false;

  constructor(initialValue: JsonValue, hooks: PatchRateAdapterHooks) {
    this.#initialValue = initialValue;
    this.#hooks = hooks;
  }

  async start(context: AdapterContext): Promise<void> {
    if (this.#started) return;
    this.#started = true;
    this.#paused = false;
    this.#context = context;
    this.#activeElapsedMs = 0;
    this.#activeStartedAt = context.now();
    this.#sequence = 1;
    this.#ratePatchCount = 0;
    this.#ratePointers.clear();
    this.#hooks.connectionStarted();
    this.#emit({ kind: "connection", sourceId: this.sourceId, status: "connecting" });
    this.#emit({ kind: "connection", sourceId: this.sourceId, status: "online" });
    this.#emit({
      kind: "snapshot",
      sourceId: this.sourceId,
      streamId: `${this.sourceId}-stream`,
      sequence: this.#sequence,
      quality: "good",
      value: this.#initialValue,
    });
    this.#schedule();
  }

  subscribe(listener: (envelope: DataEnvelope) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  async stop(): Promise<void> {
    if (!this.#started) return;
    this.#captureActiveElapsed();
    this.#started = false;
    this.#paused = false;
    if (this.#timer !== null) clearTimeout(this.#timer);
    this.#timer = null;
    this.#context = null;
    this.#hooks.connectionStopped();
  }

  pause(): void {
    if (!this.#started || this.#paused) return;
    this.#captureActiveElapsed();
    this.#paused = true;
    if (this.#timer !== null) clearTimeout(this.#timer);
    this.#timer = null;
  }

  resume(): void {
    if (!this.#started || !this.#paused) return;
    this.#paused = false;
    this.#activeStartedAt = this.#context?.now() ?? null;
    this.#schedule();
  }

  emitProbe(index: number, value: "probe-hidden" | "ready"): PatchEmission {
    if (!this.#started || this.#context === null) throw new Error("Patch adapter is not running.");
    if (index < 0 || index >= FIXTURE_BINDING_COUNT)
      throw new RangeError("Probe index is invalid.");
    return this.#emitPatch(fixturePointer(index), value, "probe");
  }

  stats(): PatchRateStats {
    const activeElapsedMs = this.#currentActiveElapsed();
    return {
      configuredHz: FIXTURE_PATCH_RATE_HZ,
      emittedPatches: this.#ratePatchCount,
      activeElapsedMs,
      actualHz: activeElapsedMs === 0 ? 0 : this.#ratePatchCount / (activeElapsedMs / 1000),
      distinctPointers: this.#ratePointers.size,
    };
  }

  #schedule(): void {
    if (!this.#started || this.#paused || this.#context === null) return;
    const intervalMs = 1000 / FIXTURE_PATCH_RATE_HZ;
    const tick = (): void => {
      this.#timer = null;
      if (!this.#started || this.#paused || this.#context?.signal.aborted === true) return;
      const expected = Math.floor(this.#currentActiveElapsed() / intervalMs);
      const catchUpLimit = Math.min(expected, this.#ratePatchCount + FIXTURE_PATCH_RATE_HZ);
      while (this.#ratePatchCount < catchUpLimit) {
        const pointerIndex = this.#ratePatchCount % FIXTURE_BINDING_COUNT;
        const pointer = fixturePointer(pointerIndex);
        this.#emitPatch(pointer, initialStatus(pointerIndex), "rate");
        this.#ratePatchCount += 1;
        this.#ratePointers.add(pointer);
      }
      const untilNext = Math.max(
        0,
        (this.#ratePatchCount + 1) * intervalMs - this.#currentActiveElapsed(),
      );
      this.#timer = setTimeout(tick, Math.min(intervalMs, untilNext));
    };
    this.#timer = setTimeout(tick, intervalMs);
  }

  #emitPatch(
    pointer: string,
    value: "alarm" | "probe-hidden" | "ready",
    kind: PatchEmission["kind"],
  ): PatchEmission {
    const context = this.#context;
    if (context === null) throw new Error("Patch adapter context is unavailable.");
    this.#sequence += 1;
    const emittedAt = context.now();
    const envelope: PatchEnvelope = {
      kind: "patch",
      sourceId: this.sourceId,
      streamId: `${this.sourceId}-stream`,
      sequence: this.#sequence,
      quality: "good",
      changes: [{ pointer, value }],
    };
    this.#emit(envelope);
    const emission = { sequence: this.#sequence, emittedAt, pointer, value, kind } as const;
    this.#hooks.onPatch?.(emission);
    return emission;
  }

  #emit(envelope: DataEnvelope): void {
    for (const listener of this.#listeners) listener(envelope);
  }

  #captureActiveElapsed(): void {
    if (this.#activeStartedAt === null || this.#context === null) return;
    this.#activeElapsedMs += this.#context.now() - this.#activeStartedAt;
    this.#activeStartedAt = null;
  }

  #currentActiveElapsed(): number {
    return (
      this.#activeElapsedMs +
      (this.#activeStartedAt === null || this.#context === null
        ? 0
        : this.#context.now() - this.#activeStartedAt)
    );
  }
}
