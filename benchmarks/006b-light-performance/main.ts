import {
  parseSceneDocument,
  type LightEntity,
  type SceneDocument,
} from "../../packages/document/src/index";
import {
  createSceneViewer,
  type PerformanceSample,
  type SceneViewer,
  type ViewerEvent,
} from "../../packages/runtime/src/index";

const container = requireElement("#app");

interface FixtureDefinition {
  readonly id: "006-overhead" | "006b-pbr";
  readonly scenePath: string;
  readonly assetPath: string;
}

interface StateResult {
  readonly state: "zero" | "point-25" | "spot-10" | "mixed-8";
  readonly compileTransition: PerformanceSample;
  readonly warmupCount: number;
  readonly measuredCount: number;
  readonly medianMs: number;
  readonly p95Ms: number;
  readonly maxMs: number;
  readonly drawCalls: number;
  readonly triangles: number;
}

interface FixtureResult {
  readonly fixture: FixtureDefinition["id"];
  readonly states: readonly StateResult[];
  readonly canvas: {
    readonly width: number;
    readonly height: number;
    readonly distinctColors: number;
  };
}

class PerformanceEvents {
  readonly #samples: PerformanceSample[] = [];
  readonly #waiting: Array<{
    readonly after: number;
    readonly resolve: (sample: PerformanceSample) => void;
  }> = [];

  get count(): number {
    return this.#samples.length;
  }

  accept(event: ViewerEvent): void {
    if (event.type !== "performance") return;
    this.#samples.push(event.sample);
    for (let index = this.#waiting.length - 1; index >= 0; index -= 1) {
      const waiter = this.#waiting[index];
      if (waiter === undefined || this.#samples.length <= waiter.after) continue;
      this.#waiting.splice(index, 1);
      waiter.resolve(this.#samples[waiter.after]!);
    }
  }

  nextAfter(after: number): Promise<PerformanceSample> {
    const sample = this.#samples[after];
    if (sample !== undefined) return Promise.resolve(sample);
    return new Promise((resolve) => this.#waiting.push({ after, resolve }));
  }
}

const fixtures: readonly FixtureDefinition[] = [
  {
    id: "006-overhead",
    scenePath: "/tests/fixtures/006-layout/layout.scene.json",
    assetPath: "/tests/fixtures/m0-factory/public/m0-factory-cell.glb",
  },
  {
    id: "006b-pbr",
    scenePath:
      "/tests/fixtures/006b-light-performance-pbr/public/006b-light-performance-pbr.scene.json",
    assetPath: "/tests/fixtures/006b-light-performance-pbr/public/006b-light-performance-pbr.glb",
  },
];

async function runFixture(definition: FixtureDefinition): Promise<FixtureResult> {
  const [sceneText, assetResponse] = await Promise.all([
    fetch(definition.scenePath)
      .then(requireOk)
      .then((response) => response.text()),
    fetch(definition.assetPath).then(requireOk),
  ]);
  const parsed = parseSceneDocument(sceneText);
  if (!parsed.ok)
    throw new Error(`Fixture ${definition.id} is invalid: ${parsed.diagnostics[0]?.message}`);
  const base = parsed.value;
  const assetBlob = new Blob([await assetResponse.arrayBuffer()], { type: "model/gltf-binary" });
  const events = new PerformanceEvents();
  const viewer = createSceneViewer(container, {
    assetResolver: { resolve: () => Promise.resolve(assetBlob) },
    pixelRatio: 1,
    reducedMotion: true,
    onEvent: (event) => events.accept(event),
  });

  try {
    const states: StateResult[] = [];
    for (const [index, state] of stateDocuments(base).entries()) {
      const beforeTransition = events.count;
      await viewer.load({ ...state.document, revision: base.revision + index + 1 });
      const compileTransition = await events.nextAfter(beforeTransition);
      await settleAnimationFrames();
      const warmup = await serialSamples(viewer, events, 30);
      const measured = await serialSamples(viewer, events, 300);
      void warmup;
      states.push(summarize(state.name, compileTransition, measured));
    }
    const canvas = container.querySelector<HTMLCanvasElement>('canvas[data-web3d-viewer="true"]');
    if (canvas === null) throw new Error(`Fixture ${definition.id} did not render a Canvas.`);
    const canvasEvidence = canvasMetrics(canvas);
    (
      globalThis as typeof globalThis & { last006bLightPerformanceCanvas?: string }
    ).last006bLightPerformanceCanvas = canvas.toDataURL("image/png");
    return { fixture: definition.id, states, canvas: canvasEvidence };
  } finally {
    await viewer.dispose();
  }
}

function canvasMetrics(canvas: HTMLCanvasElement): FixtureResult["canvas"] {
  const sample = document.createElement("canvas");
  sample.width = 96;
  sample.height = 96;
  const context = sample.getContext("2d", { willReadFrequently: true });
  if (context === null) throw new Error("Canvas pixel evidence is unavailable.");
  context.drawImage(canvas, 0, 0, sample.width, sample.height);
  const pixels = context.getImageData(0, 0, sample.width, sample.height).data;
  const colors = new Set<string>();
  for (let index = 0; index < pixels.length; index += 4) {
    colors.add(
      `${(pixels[index] ?? 0) >> 4}:${(pixels[index + 1] ?? 0) >> 4}:${
        (pixels[index + 2] ?? 0) >> 4
      }:${(pixels[index + 3] ?? 0) >> 4}`,
    );
  }
  return { width: canvas.width, height: canvas.height, distinctColors: colors.size };
}

function stateDocuments(base: SceneDocument) {
  const withoutLights = base.entities.filter((entity) => entity.type !== "light");
  return [
    { name: "zero" as const, document: { ...base, entities: withoutLights } },
    {
      name: "point-25" as const,
      document: { ...base, entities: [...withoutLights, pointLight("perf-point", [0, 3, 0])] },
    },
    {
      name: "spot-10" as const,
      document: { ...base, entities: [...withoutLights, spotLight("perf-spot", [0, 4, 2])] },
    },
    {
      name: "mixed-8" as const,
      document: {
        ...base,
        entities: [
          ...withoutLights,
          pointLight("perf-point-1", [-3, 3, -2]),
          pointLight("perf-point-2", [3, 3, -2]),
          pointLight("perf-point-3", [-3, 3, 2]),
          pointLight("perf-point-4", [3, 3, 2]),
          spotLight("perf-spot-1", [-4, 4, 0]),
          spotLight("perf-spot-2", [4, 4, 0]),
          spotLight("perf-spot-3", [0, 4, -4]),
          spotLight("perf-spot-4", [0, 4, 4]),
        ],
      },
    },
  ];
}

async function serialSamples(
  viewer: SceneViewer,
  events: PerformanceEvents,
  count: number,
): Promise<readonly PerformanceSample[]> {
  const samples: PerformanceSample[] = [];
  for (let index = 0; index < count; index += 1) {
    const beforeRequest = events.count;
    viewer.resize();
    samples.push(await events.nextAfter(beforeRequest));
  }
  return samples;
}

function settleAnimationFrames(): Promise<void> {
  return new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );
}

function summarize(
  state: StateResult["state"],
  compileTransition: PerformanceSample,
  samples: readonly PerformanceSample[],
): StateResult {
  const durations = samples.map((sample) => sample.renderDurationMs).sort((a, b) => a - b);
  const last = samples.at(-1);
  if (last === undefined) throw new Error("Measured sample set is empty.");
  return {
    state,
    compileTransition,
    warmupCount: 30,
    measuredCount: samples.length,
    medianMs: percentile(durations, 0.5),
    p95Ms: percentile(durations, 0.95),
    maxMs: durations.at(-1) ?? 0,
    drawCalls: last.drawCalls,
    triangles: last.triangles,
  };
}

function percentile(sorted: readonly number[], value: number): number {
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * value) - 1)] ?? 0;
}

function pointLight(id: string, position: LightEntity["transform"]["position"]): LightEntity {
  return {
    ...lightBase(id, position),
    light: { kind: "point", color: "#FFFFFF", intensity: 25, range: null },
  };
}

function spotLight(id: string, position: LightEntity["transform"]["position"]): LightEntity {
  return {
    ...lightBase(id, position),
    light: {
      kind: "spot",
      color: "#FFFFFF",
      intensity: 10,
      range: null,
      angleRadians: Math.PI / 4,
      penumbra: 1 / 3,
    },
  };
}

function lightBase(
  id: string,
  position: LightEntity["transform"]["position"],
): Omit<LightEntity, "light"> {
  return {
    id,
    type: "light",
    parentId: null,
    name: id,
    visible: true,
    locked: false,
    transform: { position, rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
    metadata: {},
  };
}

function requireOk(response: Response): Response {
  if (!response.ok) throw new Error(`Fixture request failed: ${response.status} ${response.url}`);
  return response;
}

function requireElement(selector: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(selector);
  if (element === null) throw new Error("Performance harness container is missing.");
  return element;
}

Object.assign(globalThis, {
  run006bLightPerformance: async () => {
    const results: FixtureResult[] = [];
    for (const fixture of fixtures) results.push(await runFixture(fixture));
    return results;
  },
});
