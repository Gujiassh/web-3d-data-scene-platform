import { BoxHelper, Color, type Material, type Object3D, type Scene } from "three";

const PRIMARY_COLOR = new Color("#2D6CDF");
const SECONDARY_COLOR = new Color("#697A83");

export interface SelectionOverlayEntry {
  readonly object: Object3D;
  readonly primary: boolean;
}

export class SelectionOverlay {
  readonly #scene: Scene;
  #helpers: BoxHelper[] = [];

  constructor(scene: Scene) {
    this.#scene = scene;
  }

  set(object: Object3D | null): void {
    this.setMany(object === null ? [] : [{ object, primary: true }]);
  }

  setMany(entries: readonly SelectionOverlayEntry[]): void {
    this.clear();
    this.#helpers = entries.map(({ object, primary }) => {
      const helper = new BoxHelper(object, primary ? PRIMARY_COLOR : SECONDARY_COLOR);
      this.#scene.add(helper);
      return helper;
    });
  }

  update(): void {
    this.#helpers.forEach((helper) => helper.update());
  }

  clear(): void {
    this.#helpers.forEach((helper) => {
      helper.removeFromParent();
      helper.geometry.dispose();
      const material = helper.material;
      if (Array.isArray(material)) material.forEach((value: Material) => value.dispose());
      else material.dispose();
    });
    this.#helpers = [];
  }

  dispose(): void {
    this.clear();
  }
}
