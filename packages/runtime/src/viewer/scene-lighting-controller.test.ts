import type { SceneLighting } from "@web3d/document";
import { DirectionalLight, HemisphereLight, Scene, Vector3 } from "three";
import { describe, expect, it, vi } from "vitest";

import { SceneLightingController } from "./scene-lighting-controller";

describe("SceneLightingController", () => {
  it("creates exactly one fill and key light and disposes the complete rig", () => {
    const scene = new Scene();
    const controller = new SceneLightingController(scene, vi.fn());

    expect(scene.children.filter((object) => object instanceof HemisphereLight)).toHaveLength(1);
    expect(scene.children.filter((object) => object instanceof DirectionalLight)).toHaveLength(1);
    const key = findKey(scene);
    expect(key.target.parent).toBe(scene);

    controller.dispose();
    expect(scene.children.filter((object) => object instanceof HemisphereLight)).toHaveLength(0);
    expect(scene.children.filter((object) => object instanceof DirectionalLight)).toHaveLength(0);
    expect(key.target.parent).toBeNull();
    controller.dispose();
  });

  it("reconciles authored and preview values without replacing Three objects", () => {
    const scene = new Scene();
    const requestRender = vi.fn();
    const controller = new SceneLightingController(scene, requestRender);
    const fill = findFill(scene);
    const key = findKey(scene);

    controller.setAuthored(lighting("#FFFFFF", "#65706A", 1.8, "#FFFFFF", 2.2, [5, 10, 7]));
    expect(fill.color.getHexString()).toBe("ffffff");
    expect(fill.groundColor.getHexString()).toBe("65706a");
    expect(fill.intensity).toBe(1.8);
    expect(key.color.getHexString()).toBe("ffffff");
    expect(key.intensity).toBe(2.2);
    expectVector(key.position.clone().normalize(), new Vector3(5, 10, 7).normalize());
    expect(key.target.position.toArray()).toEqual([0, 0, 0]);

    controller.setPreview(lighting("#DDE7E3", "#3D4743", 0.9, "#FFF1D6", 3, [-4, 8, 2]));
    expect(findFill(scene)).toBe(fill);
    expect(findKey(scene)).toBe(key);
    expect(fill.color.getHexString()).toBe("dde7e3");
    expect(key.color.getHexString()).toBe("fff1d6");
    expectVector(key.position.clone().normalize(), new Vector3(-4, 8, 2).normalize());

    controller.setAuthored(lighting("#FFFFFF", "#84918B", 2, "#FFF4E5", 1.2, [1, 1, 1]));
    expect(fill.color.getHexString()).toBe("dde7e3");
    expect(requestRender).toHaveBeenCalledTimes(2);
    controller.setPreview(null);
    expect(fill.groundColor.getHexString()).toBe("84918b");
    expect(key.intensity).toBe(1.2);
    expectVector(key.position.clone().normalize(), new Vector3(1, 1, 1).normalize());
    expect(requestRender).toHaveBeenCalledTimes(3);
  });

  it("normalizes direction and rejects invalid preview atomically", () => {
    const scene = new Scene();
    const requestRender = vi.fn();
    const controller = new SceneLightingController(scene, requestRender);
    const authored = lighting("#FFFFFF", "#65706A", 1.8, "#FFFFFF", 2.2, [5, 10, 7]);
    controller.setAuthored(authored);
    const fill = findFill(scene);
    const key = findKey(scene);
    const before = {
      fill: fill.color.getHex(),
      ground: fill.groundColor.getHex(),
      fillIntensity: fill.intensity,
      key: key.color.getHex(),
      keyIntensity: key.intensity,
      position: key.position.clone(),
    };

    expect(() =>
      controller.setPreview({
        ...authored,
        key: { ...authored.key, color: "bad", directionToLight: [0, 0, 0] },
      }),
    ).toThrow(TypeError);
    expect(fill.color.getHex()).toBe(before.fill);
    expect(fill.groundColor.getHex()).toBe(before.ground);
    expect(fill.intensity).toBe(before.fillIntensity);
    expect(key.color.getHex()).toBe(before.key);
    expect(key.intensity).toBe(before.keyIntensity);
    expect(key.position.equals(before.position)).toBe(true);
    expect(requestRender).toHaveBeenCalledOnce();
  });
});

function findFill(scene: Scene): HemisphereLight {
  const light = scene.children.find((object) => object instanceof HemisphereLight);
  if (!(light instanceof HemisphereLight)) throw new Error("Fill light not found.");
  return light;
}

function findKey(scene: Scene): DirectionalLight {
  const light = scene.children.find((object) => object instanceof DirectionalLight);
  if (!(light instanceof DirectionalLight)) throw new Error("Key light not found.");
  return light;
}

function lighting(
  skyColor: string,
  groundColor: string,
  fillIntensity: number,
  keyColor: string,
  keyIntensity: number,
  directionToLight: [number, number, number],
): SceneLighting {
  return {
    fill: { skyColor, groundColor, intensity: fillIntensity },
    key: { color: keyColor, intensity: keyIntensity, directionToLight },
  };
}

function expectVector(actual: Vector3, expected: Vector3): void {
  expect(actual.x).toBeCloseTo(expected.x, 12);
  expect(actual.y).toBeCloseTo(expected.y, 12);
  expect(actual.z).toBeCloseTo(expected.z, 12);
}
