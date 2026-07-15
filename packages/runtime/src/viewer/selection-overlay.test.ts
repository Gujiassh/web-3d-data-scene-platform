import { BoxGeometry, BoxHelper, Mesh, MeshBasicMaterial, Scene } from "three";
import { describe, expect, it } from "vitest";

import { SelectionOverlay } from "./selection-overlay";

describe("SelectionOverlay", () => {
  it("renders every selected object and distinguishes the primary", () => {
    const scene = new Scene();
    const primary = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial());
    const secondary = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial());
    const overlay = new SelectionOverlay(scene);

    overlay.setMany([
      { object: secondary, primary: false },
      { object: primary, primary: true },
    ]);

    const helpers = scene.children.filter(
      (child): child is BoxHelper => child instanceof BoxHelper,
    );
    expect(helpers).toHaveLength(2);
    expect(helpers.map((helper) => helper.material.color.getHexString())).toEqual([
      "697a83",
      "2d6cdf",
    ]);

    overlay.clear();
    expect(scene.children).toHaveLength(0);
  });
});
