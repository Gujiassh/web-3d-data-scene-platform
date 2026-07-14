import type { AdapterContext, ConnectionEnvelope, DataAdapter, DataEnvelope } from "../types";

export interface MockScenarioStep {
  atMs: number;
  envelope: DataEnvelope;
  fault?: string;
}

export interface MockAdapterOptions {
  steps: readonly MockScenarioStep[];
  speed?: number;
}

export class MockAdapter implements DataAdapter {
  readonly sourceId: string;
  readonly #steps: readonly MockScenarioStep[];
  readonly #listeners = new Set<(envelope: DataEnvelope) => void>();
  readonly #timers = new Set<ReturnType<typeof setTimeout>>();
  #speed: number;
  #started = false;
  #paused = false;
  #fault: string | null = null;
  #context: AdapterContext | null = null;
  #connection: ConnectionEnvelope | null = null;
  #snapshot: DataEnvelope | null = null;

  constructor(sourceId: string, options: MockAdapterOptions) {
    this.sourceId = sourceId;
    this.#steps = [...options.steps].sort((left, right) => left.atMs - right.atMs);
    this.#speed = options.speed ?? 1;
  }

  async start(context: AdapterContext): Promise<void> {
    if (this.#started) return;
    this.#started = true;
    this.#context = context;
    this.#connection = null;
    this.#snapshot = null;
    this.#emit({ kind: "connection", sourceId: this.sourceId, status: "connecting" });
    this.#schedule();
  }

  subscribe(listener: (envelope: DataEnvelope) => void): () => void {
    this.#listeners.add(listener);
    if (this.#started) {
      if (this.#connection !== null) listener(this.#connection);
      if (this.#snapshot !== null) listener(this.#snapshot);
    }
    return () => this.#listeners.delete(listener);
  }

  async stop(): Promise<void> {
    if (!this.#started && this.#timers.size === 0) return;
    this.#started = false;
    for (const timer of this.#timers) clearTimeout(timer);
    this.#timers.clear();
    this.#context = null;
  }

  pause(): void {
    this.#paused = true;
  }

  resume(): void {
    this.#paused = false;
  }

  setSpeed(speed: number): void {
    if (!Number.isFinite(speed) || speed <= 0)
      throw new RangeError("MockAdapter speed must be positive");
    this.#speed = speed;
  }

  injectFault(name: string | null): void {
    this.#fault = name;
  }

  #schedule(): void {
    const signal = this.#context?.signal;
    if (signal === undefined) return;
    for (const step of this.#steps) {
      const timer = setTimeout(() => {
        this.#timers.delete(timer);
        if (!this.#started || signal.aborted || this.#paused) return;
        if (step.fault !== undefined && step.fault !== this.#fault) return;
        this.#emit(step.envelope);
      }, step.atMs / this.#speed);
      this.#timers.add(timer);
    }
  }

  #emit(envelope: DataEnvelope): void {
    if (envelope.sourceId !== this.sourceId) {
      this.#context?.emitDiagnostic({
        code: "ADAPTER_SOURCE_MISMATCH",
        severity: "error",
        source: "adapter",
        message: `Mock envelope source ${envelope.sourceId} does not match ${this.sourceId}`,
        sourceId: this.sourceId,
      });
      return;
    }
    if (envelope.kind === "connection") this.#connection = envelope;
    if (envelope.kind === "snapshot") this.#snapshot = envelope;
    for (const listener of this.#listeners) listener(envelope);
  }
}
