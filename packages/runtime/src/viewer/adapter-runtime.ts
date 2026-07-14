import { diagnostic, diagnosticError } from "../diagnostics";
import type { AdapterContext, DataAdapter, DataEnvelope, Diagnostic } from "../types";

interface ActiveAdapter {
  readonly adapter: DataAdapter;
  readonly controller: AbortController;
  readonly unsubscribe: () => void;
}

interface AdapterRuntimeOptions {
  readonly adapters?: Record<string, DataAdapter>;
  readonly acceptEnvelope: (envelope: DataEnvelope) => void;
  readonly hasSource: (sourceId: string) => boolean;
  readonly isDisposed: () => boolean;
  readonly now: () => number;
  readonly recordDiagnostic: (diagnostic: Diagnostic) => void;
}

export class ViewerAdapterRuntime {
  readonly #configured = new Map<string, DataAdapter>();
  readonly #active = new Map<string, ActiveAdapter>();
  readonly #revisions = new Map<string, number>();
  readonly #acceptEnvelope;
  readonly #hasSource;
  readonly #isDisposed;
  readonly #now;
  readonly #recordDiagnostic;

  #barrier: Promise<void> = Promise.resolve();

  constructor(options: AdapterRuntimeOptions) {
    this.#acceptEnvelope = options.acceptEnvelope;
    this.#hasSource = options.hasSource;
    this.#isDisposed = options.isDisposed;
    this.#now = options.now;
    this.#recordDiagnostic = options.recordDiagnostic;
    for (const [sourceId, adapter] of Object.entries(options.adapters ?? {})) {
      this.#configured.set(sourceId, adapter);
    }
  }

  async applyDocumentAdapters(): Promise<void> {
    await this.#queue(async () => {
      await this.#stopAllActive();
      if (this.#isDisposed()) return;
      for (const [sourceId, adapter] of this.#configured) {
        const revision = this.#revisions.get(sourceId) ?? 0;
        await this.#startAdapter(
          sourceId,
          adapter,
          () =>
            !this.#isDisposed() &&
            this.#hasSource(sourceId) &&
            (this.#revisions.get(sourceId) ?? 0) === revision &&
            this.#configured.get(sourceId) === adapter,
        );
      }
    });
  }

  async setAdapter(sourceId: string, adapter: DataAdapter | null): Promise<void> {
    if (adapter !== null && adapter.sourceId !== sourceId) {
      const value = diagnostic(
        "ADAPTER_SOURCE_MISMATCH",
        "adapter",
        "error",
        `Adapter source ${adapter.sourceId} does not match ${sourceId}.`,
        { sourceId },
      );
      this.#recordDiagnostic(value);
      throw diagnosticError(value);
    }

    const revision = (this.#revisions.get(sourceId) ?? 0) + 1;
    this.#revisions.set(sourceId, revision);
    const stopping = this.#stopAdapter(sourceId);
    await this.#queue(async () => {
      if (this.#isDisposed()) return;
      await stopping;
      if (this.#isDisposed() || this.#revisions.get(sourceId) !== revision) return;
      if (adapter === null) {
        this.#configured.delete(sourceId);
        return;
      }
      this.#configured.set(sourceId, adapter);
      if (this.#hasSource(sourceId)) {
        await this.#startAdapter(
          sourceId,
          adapter,
          () =>
            !this.#isDisposed() &&
            this.#hasSource(sourceId) &&
            this.#revisions.get(sourceId) === revision &&
            this.#configured.get(sourceId) === adapter,
        );
      }
    });
  }

  stopAll(): Promise<void> {
    return this.#stopAllActive();
  }

  async #startAdapter(
    sourceId: string,
    adapter: DataAdapter,
    isCurrent: () => boolean,
  ): Promise<void> {
    if (!isCurrent()) return;
    if (adapter.sourceId !== sourceId) {
      this.#recordDiagnostic(
        diagnostic(
          "ADAPTER_SOURCE_MISMATCH",
          "adapter",
          "error",
          `Adapter source ${adapter.sourceId} does not match ${sourceId}.`,
          { sourceId },
        ),
      );
      return;
    }

    await this.#stopAdapter(sourceId);
    if (!isCurrent()) return;
    const controller = new AbortController();
    let unsubscribe: () => void;
    try {
      unsubscribe = adapter.subscribe((envelope) => {
        if (!controller.signal.aborted) this.#acceptEnvelope(envelope);
      });
    } catch {
      this.#recordAdapterFailure(sourceId);
      return;
    }

    this.#active.set(sourceId, { adapter, controller, unsubscribe });
    const context: AdapterContext = {
      signal: controller.signal,
      now: this.#now,
      emitDiagnostic: (value) => this.#recordDiagnostic(value),
    };
    try {
      await abortable(adapter.start(context), controller.signal);
    } catch {
      if (controller.signal.aborted) return;
      this.#recordAdapterFailure(sourceId);
      await this.#stopAdapter(sourceId);
    }
  }

  #recordAdapterFailure(sourceId: string): void {
    const value = diagnostic(
      "DATASOURCE_CONNECTION_FAILED",
      "adapter",
      "error",
      `Adapter ${sourceId} failed to start.`,
      { sourceId },
    );
    this.#recordDiagnostic(value);
    this.#acceptEnvelope({
      kind: "connection",
      sourceId,
      status: "error",
      detailCode: value.code,
    });
  }

  async #stopAdapter(sourceId: string): Promise<void> {
    const active = this.#active.get(sourceId);
    if (active === undefined) return;
    this.#active.delete(sourceId);
    active.controller.abort();
    try {
      active.unsubscribe();
    } catch {
      this.#recordDiagnostic(
        diagnostic(
          "DATASOURCE_CONNECTION_FAILED",
          "adapter",
          "warning",
          `Adapter ${sourceId} failed to unsubscribe cleanly.`,
          { sourceId },
        ),
      );
    }
    try {
      await active.adapter.stop();
    } catch {
      this.#recordDiagnostic(
        diagnostic(
          "DATASOURCE_CONNECTION_FAILED",
          "adapter",
          "warning",
          `Adapter ${sourceId} failed to stop cleanly.`,
          { sourceId },
        ),
      );
    }
  }

  async #stopAllActive(): Promise<void> {
    await Promise.all([...this.#active.keys()].map((sourceId) => this.#stopAdapter(sourceId)));
  }

  #queue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.#barrier.then(operation);
    this.#barrier = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}

function abortError(): DOMException {
  return new DOMException("The operation was aborted.", "AbortError");
}

function abortable<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise<T>((resolve, reject) => {
    const cleanup = (): void => signal.removeEventListener("abort", abort);
    const abort = (): void => {
      cleanup();
      reject(abortError());
    };
    signal.addEventListener("abort", abort, { once: true });
    operation.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error: unknown) => {
        cleanup();
        reject(error);
      },
    );
  });
}
