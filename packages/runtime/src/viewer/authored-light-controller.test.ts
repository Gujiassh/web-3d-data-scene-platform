import type { LightEntity } from "@web3d/document";
import { BufferGeometry, Group, LineSegments, Material, Mesh, PointLight, SpotLight } from "three";
import { describe, expect, it, vi } from "vitest";

import { AuthoredLightController } from "./authored-light-controller";
import type { RuntimeEntity } from "./runtime-generation";

describe("AuthoredLightController", () => {
  it("maps authored Point and Spot values directly without shadows", () => {
    const root = new Group();
    const entities = new Map<string, RuntimeEntity>();
    const controller = new AuthoredLightController(root, entities, vi.fn());
    const point = pointLight("point-a", 25, null);
    const spot = spotLight("spot-a", 10, 12);

    controller.stage([point, spot]).commit("run");

    const pointObject = entities.get(point.id)?.object;
    const spotObject = entities.get(spot.id)?.object;
    const pointThree = childOfType(pointObject, PointLight);
    const spotThree = childOfType(spotObject, SpotLight);
    expect(pointObject?.position.toArray()).toEqual([1, 2, 3]);
    expect(pointThree).toMatchObject({ intensity: 25, distance: 0, decay: 2, castShadow: false });
    expect(pointThree?.color.getHexString().toUpperCase()).toBe("AABBCC");
    expect(spotThree).toMatchObject({
      intensity: 10,
      distance: 12,
      decay: 2,
      castShadow: false,
      angle: Math.PI / 4,
      penumbra: 1 / 3,
    });
    expect(spotThree?.target.parent).toBe(spotObject);
    expect(spotThree?.target.position.toArray()).toEqual([0, 0, -1]);
    expect(root.getObjectsByProperty("userData.web3dLightAuthoringSurface", true)).toHaveLength(0);

    controller.dispose();
  });

  it("keeps helpers and pick proxies Edit-only and maps their objects to the entity", () => {
    const root = new Group();
    const entities = new Map<string, RuntimeEntity>();
    const controller = new AuthoredLightController(root, entities, vi.fn());
    const point = pointLight("point-a", 0, null);
    const spot = spotLight("spot-a", 1000, null);
    controller.stage([point, spot]).commit("edit");

    const authoringSurfaces = lightAuthoringSurfaces(root);
    expect(authoringSurfaces).toHaveLength(2);
    expect(authoringSurfaces.flatMap((surface) => surface.children)).toEqual(
      expect.arrayContaining([expect.any(LineSegments), expect.any(Mesh)]),
    );
    const proxy = authoringSurfaces[0]?.children.find((object) => object instanceof Mesh);
    expect(proxy).toBeDefined();
    expect(controller.entityForObject(proxy!)).toBe("point-a");

    controller.setAuthoringMode("run");
    expect(lightAuthoringSurfaces(root)).toHaveLength(0);
    controller.setAuthoringMode("edit");
    expect(lightAuthoringSurfaces(root)).toHaveLength(2);

    const pointThree = childOfType(entities.get(point.id)?.object, PointLight);
    const spotThree = childOfType(entities.get(spot.id)?.object, SpotLight);
    expect(pointThree?.intensity).toBe(0);
    expect(spotThree?.intensity).toBe(1000);
    expect(spotThree?.distance).toBe(0);
    controller.dispose();
  });

  it("publishes staged resources with the latest authoring mode authority", () => {
    const root = new Group();
    const entities = new Map<string, RuntimeEntity>();
    const controller = new AuthoredLightController(root, entities, vi.fn());
    const point = pointLight("point-a", 25, null);
    controller.setAuthoringMode("edit");
    const staged = controller.stage([point]);

    controller.setAuthoringMode("run");
    staged.commit("run");

    expect(lightAuthoringSurfaces(root)).toHaveLength(0);
    controller.dispose();
  });

  it("stages off-state, atomically replaces entity resources, and disposes both generations", () => {
    const root = new Group();
    const entities = new Map<string, RuntimeEntity>();
    const requestRender = vi.fn();
    const geometryDispose = vi.spyOn(BufferGeometry.prototype, "dispose");
    const materialDispose = vi.spyOn(Material.prototype, "dispose");
    const controller = new AuthoredLightController(root, entities, requestRender);
    const first = pointLight("point-a", 25, null);
    controller.stage([first]).commit("edit");
    const firstObject = entities.get(first.id)?.object;

    const replacement = spotLight("spot-a", 10, 8);
    const staged = controller.stage([replacement]);
    expect(entities.get(first.id)?.object).toBe(firstObject);
    expect(root.getObjectByName("spot-a")).toBeUndefined();

    staged.commit("edit");
    expect(entities.has(first.id)).toBe(false);
    expect(entities.get(replacement.id)?.object).toBe(root.getObjectByName(replacement.id));
    expect(firstObject?.parent).toBeNull();
    expect(geometryDispose).toHaveBeenCalled();
    expect(materialDispose).toHaveBeenCalled();

    const disposedBeforeController = geometryDispose.mock.calls.length;
    controller.dispose();
    expect(geometryDispose.mock.calls.length).toBeGreaterThan(disposedBeforeController);
    const disposedAfterController = geometryDispose.mock.calls.length;
    controller.dispose();
    expect(geometryDispose).toHaveBeenCalledTimes(disposedAfterController);
    expect(requestRender).toHaveBeenCalledTimes(3);
    geometryDispose.mockRestore();
    materialDispose.mockRestore();
  });

  it("disposes an abandoned stage without changing current authority", () => {
    const root = new Group();
    const entities = new Map<string, RuntimeEntity>();
    const controller = new AuthoredLightController(root, entities, vi.fn());
    const current = pointLight("point-a", 25, null);
    controller.stage([current]).commit("run");
    const currentObject = entities.get(current.id)?.object;
    const geometryDispose = vi.spyOn(BufferGeometry.prototype, "dispose");

    const staged = controller.stage([spotLight("spot-a", 10, 9)]);
    staged.dispose();

    expect(entities.get(current.id)?.object).toBe(currentObject);
    expect(root.getObjectByName("spot-a")).toBeUndefined();
    expect(geometryDispose).toHaveBeenCalled();
    controller.dispose();
    geometryDispose.mockRestore();
  });
});

function lightAuthoringSurfaces(root: Group) {
  const surfaces: Group[] = [];
  root.traverse((object) => {
    if (object instanceof Group && object.userData["web3dLightAuthoringSurface"] === true) {
      surfaces.push(object);
    }
  });
  return surfaces;
}

function childOfType<T extends object>(
  root: { readonly children: readonly object[] } | undefined,
  Constructor: abstract new (...args: never[]) => T,
): T | undefined {
  return root?.children.find((child): child is T => child instanceof Constructor);
}

function pointLight(id: string, intensity: number, range: number | null): LightEntity {
  return {
    ...lightBase(id),
    light: { kind: "point", color: "#AABBCC", intensity, range },
  };
}

function spotLight(id: string, intensity: number, range: number | null): LightEntity {
  return {
    ...lightBase(id),
    light: {
      kind: "spot",
      color: "#FFFFFF",
      intensity,
      range,
      angleRadians: Math.PI / 4,
      penumbra: 1 / 3,
    },
  };
}

function lightBase(id: string): Omit<LightEntity, "light"> {
  return {
    id,
    type: "light",
    parentId: null,
    name: id,
    visible: true,
    locked: false,
    transform: {
      position: [1, 2, 3],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
    },
    metadata: {},
  };
}
