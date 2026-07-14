export type DisposeTask = () => void | Promise<void>;

export class IdempotentDisposer {
  readonly #tasks: DisposeTask[] = [];
  #disposePromise: Promise<void> | null = null;

  add(task: DisposeTask): () => void {
    if (this.#disposePromise !== null) {
      void Promise.resolve().then(task);
      return () => undefined;
    }
    this.#tasks.push(task);
    let active = true;
    return () => {
      if (!active || this.#disposePromise !== null) return;
      active = false;
      const index = this.#tasks.indexOf(task);
      if (index >= 0) this.#tasks.splice(index, 1);
    };
  }

  dispose(): Promise<void> {
    if (this.#disposePromise !== null) return this.#disposePromise;
    this.#disposePromise = this.#run();
    return this.#disposePromise;
  }

  get disposed(): boolean {
    return this.#disposePromise !== null;
  }

  async #run(): Promise<void> {
    const errors: unknown[] = [];
    for (const task of this.#tasks.splice(0).reverse()) {
      try {
        await task();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length > 0) throw new AggregateError(errors, "One or more dispose tasks failed");
  }
}

export class AnimationFrameSlot {
  #frame: number | null = null;

  request(callback: FrameRequestCallback): void {
    if (this.#frame !== null) return;
    this.#frame = requestAnimationFrame((time) => {
      this.#frame = null;
      callback(time);
    });
  }

  cancel(): void {
    if (this.#frame === null) return;
    cancelAnimationFrame(this.#frame);
    this.#frame = null;
  }

  get pending(): boolean {
    return this.#frame !== null;
  }
}
