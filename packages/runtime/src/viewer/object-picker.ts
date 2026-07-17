import { Raycaster, Vector2, type Camera, type Object3D } from "three";

interface PickOptions<Id extends string> {
  readonly camera: Camera;
  readonly clientX: number;
  readonly clientY: number;
  readonly root: Object3D;
  readonly surface: {
    getBoundingClientRect(): DOMRect | { left: number; top: number; width: number; height: number };
  };
  readonly resolveId: (object: Object3D) => Id | undefined;
}

export class ObjectPicker<Id extends string> {
  readonly #raycaster = new Raycaster();
  readonly #pointer = new Vector2();

  pick(options: PickOptions<Id>): Id | null {
    const bounds = options.surface.getBoundingClientRect();
    this.#pointer.set(
      ((options.clientX - bounds.left) / bounds.width) * 2 - 1,
      -((options.clientY - bounds.top) / bounds.height) * 2 + 1,
    );
    this.#raycaster.setFromCamera(this.#pointer, options.camera);
    for (const hit of this.#raycaster.intersectObject(options.root, true)) {
      const id = options.resolveId(hit.object);
      if (id !== undefined) return id;
    }
    return null;
  }

  static isClick(
    start: { x: number; y: number } | null,
    end: { x: number; y: number },
    tolerance = 4,
  ): boolean {
    return start !== null && Math.hypot(end.x - start.x, end.y - start.y) <= tolerance;
  }
}
