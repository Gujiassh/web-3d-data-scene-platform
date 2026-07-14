import { BoxHelper, Color, type Material, type Object3D, type Scene } from "three";

export class SelectionOverlay {
  readonly #scene: Scene;
  #helper: BoxHelper | null = null;

  constructor(scene: Scene) {
    this.#scene = scene;
  }

  set(object: Object3D | null): void {
    this.clear();
    if (object === null) return;
    this.#helper = new BoxHelper(object, new Color("#2D6CDF"));
    this.#scene.add(this.#helper);
  }

  update(): void {
    this.#helper?.update();
  }

  clear(): void {
    if (this.#helper === null) return;
    this.#helper.removeFromParent();
    this.#helper.geometry.dispose();
    const material = this.#helper.material;
    if (Array.isArray(material)) material.forEach((value: Material) => value.dispose());
    else material.dispose();
    this.#helper = null;
  }

  dispose(): void {
    this.clear();
  }
}
