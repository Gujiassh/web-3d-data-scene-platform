export interface RendererProbe {
  readonly active: number;
  readonly disposed: number;
  readonly drawCalls: number;
  readonly triangles: number;
  readonly geometries: number;
  readonly textures: number;
}

export interface CapturedCanvasFrame {
  readonly sequence: number;
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8ClampedArray;
  readonly dataUrl: string;
}

export interface OwnedResourceProbe {
  readonly raf: number;
  readonly resizeObservers: number;
  readonly listeners: number;
  readonly intervals: number;
  readonly adapterConnections: number;
  readonly renderers: number;
}

export interface BenchmarkInstrumentation {
  readonly renderer: () => RendererProbe;
  readonly owned: () => OwnedResourceProbe;
  readonly nextFrame: () => Promise<number>;
  readonly adapterStarted: () => void;
  readonly adapterStopped: () => void;
  readonly startCanvasCapture: () => void;
  readonly stopCanvasCapture: () => void;
  readonly canvasFrame: () => CapturedCanvasFrame | null;
  restore(): void;
}

interface InstrumentedRenderer {
  readonly domElement: HTMLCanvasElement;
  readonly info: {
    readonly render: { readonly calls: number; readonly triangles: number };
    readonly memory: { readonly geometries: number; readonly textures: number };
  };
}

export function installBenchmarkInstrumentation(): BenchmarkInstrumentation {
  const nativeRaf = globalThis.requestAnimationFrame.bind(globalThis);
  const nativeCancelRaf = globalThis.cancelAnimationFrame.bind(globalThis);
  const nativeSetInterval = globalThis.setInterval.bind(globalThis);
  const nativeClearInterval = globalThis.clearInterval.bind(globalThis);
  const NativeResizeObserver = globalThis.ResizeObserver;
  const nativeAddEventListener = EventTarget.prototype.addEventListener;
  const nativeRemoveEventListener = EventTarget.prototype.removeEventListener;

  const pendingRaf = new Set<number>();
  const intervals = new Set<number>();
  const resizeObservers = new Set<ResizeObserver>();
  const listenerKeys = new Map<EventTarget, Map<string, number>>();
  const renderers = new Set<InstrumentedRenderer>();
  let disposedRenderers = 0;
  let adapterConnections = 0;
  let lastRendererInfo = { drawCalls: 0, triangles: 0, geometries: 0, textures: 0 };
  let captureCanvas = false;
  let canvasSequence = 0;
  let lastCanvasFrame: CapturedCanvasFrame | null = null;

  globalThis.requestAnimationFrame = (callback): number => {
    let id = 0;
    id = nativeRaf((time) => {
      pendingRaf.delete(id);
      callback(time);
    });
    pendingRaf.add(id);
    return id;
  };
  globalThis.cancelAnimationFrame = (id): void => {
    pendingRaf.delete(id);
    nativeCancelRaf(id);
  };
  globalThis.setInterval = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
    const id = nativeSetInterval(handler, timeout, ...args);
    intervals.add(id);
    return id;
  }) as typeof globalThis.setInterval;
  globalThis.clearInterval = ((id?: number) => {
    if (id !== undefined) intervals.delete(id);
    nativeClearInterval(id);
  }) as typeof globalThis.clearInterval;

  class InstrumentedResizeObserver extends NativeResizeObserver {
    constructor(callback: ResizeObserverCallback) {
      super(callback);
      resizeObservers.add(this);
    }

    override disconnect(): void {
      resizeObservers.delete(this);
      super.disconnect();
    }
  }
  globalThis.ResizeObserver = InstrumentedResizeObserver;

  EventTarget.prototype.addEventListener = function (type, listener, options): void {
    if (isRuntimeSurface(this) && listener !== null) {
      const key = listenerKey(type, listener, options);
      const targetKeys = listenerKeys.get(this) ?? new Map<string, number>();
      targetKeys.set(key, (targetKeys.get(key) ?? 0) + 1);
      listenerKeys.set(this, targetKeys);
    }
    nativeAddEventListener.call(this, type, listener, options);
  };
  EventTarget.prototype.removeEventListener = function (type, listener, options): void {
    if (isRuntimeSurface(this) && listener !== null) {
      const key = listenerKey(type, listener, options);
      const targetKeys = listenerKeys.get(this);
      const count = targetKeys?.get(key) ?? 0;
      if (count <= 1) targetKeys?.delete(key);
      else targetKeys?.set(key, count - 1);
      if (targetKeys?.size === 0) listenerKeys.delete(this);
    }
    nativeRemoveEventListener.call(this, type, listener, options);
  };

  const rendererHook = {
    onRender(renderer: InstrumentedRenderer): void {
      renderers.add(renderer);
      lastRendererInfo = {
        drawCalls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        geometries: renderer.info.memory.geometries,
        textures: renderer.info.memory.textures,
      };
      if (captureCanvas) {
        canvasSequence += 1;
        lastCanvasFrame = captureRendererCanvas(renderer.domElement, canvasSequence);
      }
    },
    onDispose(renderer: InstrumentedRenderer): void {
      renderers.delete(renderer);
      disposedRenderers += 1;
    },
  };
  (
    globalThis as typeof globalThis & {
      __WEB3D_BENCHMARK_RENDERER_HOOK__?: typeof rendererHook;
    }
  ).__WEB3D_BENCHMARK_RENDERER_HOOK__ = rendererHook;

  return {
    renderer() {
      return {
        active: renderers.size,
        disposed: disposedRenderers,
        ...lastRendererInfo,
      };
    },
    owned() {
      return {
        raf: pendingRaf.size,
        resizeObservers: resizeObservers.size,
        listeners: [...listenerKeys.values()].reduce(
          (total, target) => total + [...target.values()].reduce((sum, count) => sum + count, 0),
          0,
        ),
        intervals: intervals.size,
        adapterConnections,
        renderers: renderers.size,
      };
    },
    nextFrame() {
      return new Promise((resolve) => nativeRaf(resolve));
    },
    adapterStarted() {
      adapterConnections += 1;
    },
    adapterStopped() {
      adapterConnections = Math.max(0, adapterConnections - 1);
    },
    startCanvasCapture() {
      captureCanvas = true;
    },
    stopCanvasCapture() {
      captureCanvas = false;
    },
    canvasFrame() {
      return lastCanvasFrame;
    },
    restore() {
      globalThis.requestAnimationFrame = nativeRaf;
      globalThis.cancelAnimationFrame = nativeCancelRaf;
      globalThis.setInterval = nativeSetInterval;
      globalThis.clearInterval = nativeClearInterval;
      globalThis.ResizeObserver = NativeResizeObserver;
      EventTarget.prototype.addEventListener = nativeAddEventListener;
      EventTarget.prototype.removeEventListener = nativeRemoveEventListener;
      delete (
        globalThis as typeof globalThis & {
          __WEB3D_BENCHMARK_RENDERER_HOOK__?: typeof rendererHook;
        }
      ).__WEB3D_BENCHMARK_RENDERER_HOOK__;
    },
  };
}

function captureRendererCanvas(canvas: HTMLCanvasElement, sequence: number): CapturedCanvasFrame {
  const sample = document.createElement("canvas");
  sample.width = canvas.width;
  sample.height = canvas.height;
  const context = sample.getContext("2d", { willReadFrequently: true });
  if (context === null) throw new Error("Renderer Canvas capture is unavailable.");
  context.drawImage(canvas, 0, 0);
  return {
    sequence,
    width: sample.width,
    height: sample.height,
    pixels: context.getImageData(0, 0, sample.width, sample.height).data,
    dataUrl: sample.toDataURL("image/png"),
  };
}

function isRuntimeSurface(target: EventTarget): target is HTMLCanvasElement {
  return target instanceof HTMLCanvasElement && target.dataset["web3dViewer"] === "true";
}

function listenerKey(
  type: string,
  listener: EventListenerOrEventListenerObject,
  options?: boolean | AddEventListenerOptions,
): string {
  const capture = typeof options === "boolean" ? options : (options?.capture ?? false);
  return `${type}:${capture ? "capture" : "bubble"}:${objectId(listener)}`;
}

const listenerIds = new WeakMap<object, number>();
let nextListenerId = 1;

function objectId(value: object): number {
  const existing = listenerIds.get(value);
  if (existing !== undefined) return existing;
  const id = nextListenerId;
  nextListenerId += 1;
  listenerIds.set(value, id);
  return id;
}
