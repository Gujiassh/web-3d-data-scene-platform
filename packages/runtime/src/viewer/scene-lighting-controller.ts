import type { SceneLighting } from "@web3d/document";
import { DirectionalLight, HemisphereLight, Vector3, type Scene } from "three";

const COLOR_PATTERN = /^#[A-Fa-f0-9]{6}$/u;
const LIGHT_SOURCE_DISTANCE = 10;

export class SceneLightingController {
  readonly #scene: Scene;
  readonly #requestRender: () => void;
  readonly #fill = new HemisphereLight(0xffffff, 0x000000, 0);
  readonly #key = new DirectionalLight(0xffffff, 0);

  #authored: SceneLighting | null = null;
  #preview: SceneLighting | null = null;
  #applied: SceneLighting | null = null;
  #disposed = false;

  constructor(scene: Scene, requestRender: () => void) {
    this.#scene = scene;
    this.#requestRender = requestRender;
    this.#key.target.position.set(0, 0, 0);
    this.#scene.add(this.#fill, this.#key, this.#key.target);
  }

  setAuthored(lighting: SceneLighting): void {
    this.#ensureActive();
    this.#authored = normalizeLighting(lighting);
    this.#reconcile();
  }

  setPreview(lighting: SceneLighting | null): void {
    this.#ensureActive();
    const next = lighting === null ? null : normalizeLighting(lighting);
    this.#preview = next;
    this.#reconcile();
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#fill.removeFromParent();
    this.#key.removeFromParent();
    this.#key.target.removeFromParent();
    this.#authored = null;
    this.#preview = null;
    this.#applied = null;
  }

  #reconcile(): void {
    const next = this.#preview ?? this.#authored;
    if (next === null || sameLighting(next, this.#applied)) return;

    this.#fill.color.set(next.fill.skyColor);
    this.#fill.groundColor.set(next.fill.groundColor);
    this.#fill.intensity = next.fill.intensity;
    this.#key.color.set(next.key.color);
    this.#key.intensity = next.key.intensity;
    this.#key.position.fromArray(next.key.directionToLight).multiplyScalar(LIGHT_SOURCE_DISTANCE);
    this.#key.target.position.set(0, 0, 0);
    this.#key.target.updateMatrixWorld(true);
    this.#applied = next;
    this.#requestRender();
  }

  #ensureActive(): void {
    if (this.#disposed) throw new Error("SceneLightingController has been disposed.");
  }
}

function normalizeLighting(lighting: SceneLighting): SceneLighting {
  const skyColor = normalizeColor(lighting.fill.skyColor, "fill skyColor");
  const groundColor = normalizeColor(lighting.fill.groundColor, "fill groundColor");
  const fillIntensity = normalizeIntensity(lighting.fill.intensity, "fill intensity");
  const keyColor = normalizeColor(lighting.key.color, "key color");
  const keyIntensity = normalizeIntensity(lighting.key.intensity, "key intensity");
  const [x, y, z] = lighting.key.directionToLight;
  if (![x, y, z].every(Number.isFinite)) {
    throw new TypeError("Scene lighting directionToLight must contain three finite numbers.");
  }
  const direction = new Vector3(x, y, z);
  if (direction.lengthSq() === 0) {
    throw new TypeError("Scene lighting directionToLight must be non-zero.");
  }
  direction.normalize();
  return {
    fill: { skyColor, groundColor, intensity: fillIntensity },
    key: {
      color: keyColor,
      intensity: keyIntensity,
      directionToLight: [direction.x, direction.y, direction.z],
    },
  };
}

function normalizeColor(color: string, label: string): string {
  if (!COLOR_PATTERN.test(color)) {
    throw new TypeError(`Scene lighting ${label} must use the #RRGGBB format.`);
  }
  return color.toUpperCase();
}

function normalizeIntensity(intensity: number, label: string): number {
  if (!Number.isFinite(intensity) || intensity < 0 || intensity > 5) {
    throw new TypeError(`Scene lighting ${label} must be finite and between 0 and 5.`);
  }
  return intensity;
}

function sameLighting(left: SceneLighting, right: SceneLighting | null): boolean {
  if (right === null) return false;
  return (
    left.fill.skyColor === right.fill.skyColor &&
    left.fill.groundColor === right.fill.groundColor &&
    left.fill.intensity === right.fill.intensity &&
    left.key.color === right.key.color &&
    left.key.intensity === right.key.intensity &&
    left.key.directionToLight.every(
      (component, index) => component === right.key.directionToLight[index],
    )
  );
}
