import {
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  type Scene,
} from "three";

import type { SmartAlignAxis, SmartAlignCandidate } from "./oracle";

const AXIS_COLORS: Readonly<Record<SmartAlignAxis, number>> = {
  x: 0xe5484d,
  y: 0x2f9e68,
  z: 0x3977d5,
};
const MARK_SIZE = 0.12;

export class SmartAlignGuideOverlay {
  readonly #group = new Group();
  readonly #lines = new Map<SmartAlignAxis, LineSegments>();
  readonly #requestRender: () => void;
  #disposed = false;

  constructor(scene: Scene, requestRender: () => void) {
    this.#requestRender = requestRender;
    this.#group.name = "smart-align-guides";
    this.#group.renderOrder = 1_000;
    this.#group.visible = false;
    scene.add(this.#group);
    for (const axis of ["x", "y", "z"] as const) {
      const material = new LineBasicMaterial({
        color: AXIS_COLORS[axis],
        depthTest: false,
        depthWrite: false,
        transparent: true,
        opacity: 0.95,
      });
      const line = new LineSegments(new BufferGeometry(), material);
      line.name = `smart-align-guide-${axis}`;
      line.visible = false;
      line.frustumCulled = false;
      this.#lines.set(axis, line);
      this.#group.add(line);
    }
  }

  update(candidates: readonly SmartAlignCandidate[]): void {
    this.#ensureActive();
    const byAxis = new Map(candidates.map((candidate) => [candidate.axis, candidate]));
    let visible = false;
    for (const [axis, line] of this.#lines) {
      const candidate = byAxis.get(axis);
      line.visible = candidate !== undefined;
      if (candidate === undefined) {
        if (line.geometry.getAttribute("position") !== undefined) resetGeometry(line);
        continue;
      }
      visible = true;
      line.geometry.dispose();
      line.geometry = geometryFor(candidate);
    }
    this.#group.visible = visible;
    this.#requestRender();
  }

  clear(): void {
    if (this.#disposed || !this.#group.visible) return;
    this.#group.visible = false;
    for (const line of this.#lines.values()) {
      line.visible = false;
      if (line.geometry.getAttribute("position") !== undefined) resetGeometry(line);
    }
    this.#requestRender();
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#group.removeFromParent();
    for (const line of this.#lines.values()) {
      line.geometry.dispose();
      const material = line.material;
      if (Array.isArray(material)) material.forEach((value) => value.dispose());
      else material.dispose();
    }
    this.#lines.clear();
  }

  #ensureActive(): void {
    if (this.#disposed) throw new Error("Smart Align guide overlay is disposed.");
  }
}

function resetGeometry(line: LineSegments): void {
  line.geometry.dispose();
  line.geometry = new BufferGeometry();
}

function geometryFor(candidate: SmartAlignCandidate): BufferGeometry {
  const start = candidate.guideStart;
  const end = candidate.guideEnd;
  const tickAxis = candidate.axis === "y" ? 0 : 1;
  const startA = [...start] as [number, number, number];
  const startB = [...start] as [number, number, number];
  const endA = [...end] as [number, number, number];
  const endB = [...end] as [number, number, number];
  startA[tickAxis] -= MARK_SIZE;
  startB[tickAxis] += MARK_SIZE;
  endA[tickAxis] -= MARK_SIZE;
  endB[tickAxis] += MARK_SIZE;
  const positions = [...start, ...end, ...startA, ...startB, ...endA, ...endB];
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  return geometry;
}
