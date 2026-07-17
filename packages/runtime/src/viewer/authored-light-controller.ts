import type { LightEntity } from "@web3d/document";
import {
  ConeGeometry,
  EdgesGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  PointLight,
  SphereGeometry,
  SpotLight,
  type Object3D,
} from "three";

import { disposeObject3D } from "../assets/dispose-object";
import type { AuthoringMode } from "../types";
import type { RuntimeEntity } from "./runtime-generation";

interface AuthoredLightResource {
  readonly entity: LightEntity;
  readonly object: Object3D;
  readonly authoringSurface: Group;
}

export interface StagedAuthoredLights {
  commit(mode: AuthoringMode): void;
  dispose(): void;
}

export interface AuthoredLightRuntime {
  stage(lights: readonly LightEntity[]): StagedAuthoredLights;
  setAuthoringMode(mode: AuthoringMode): void;
  entityForObject(object: Object3D): string | undefined;
  dispose(): void;
}

export class AuthoredLightController implements AuthoredLightRuntime {
  readonly #root: Object3D;
  readonly #runtimeEntities: Map<string, RuntimeEntity>;
  readonly #requestRender: () => void;

  #authoringMode: AuthoringMode = "run";
  #resources = new Map<string, AuthoredLightResource>();
  #objectEntities = new WeakMap<Object3D, string>();
  #disposed = false;

  constructor(
    root: Object3D,
    runtimeEntities: Map<string, RuntimeEntity>,
    requestRender: () => void,
  ) {
    this.#root = root;
    this.#runtimeEntities = runtimeEntities;
    this.#requestRender = requestRender;
  }

  stage(lights: readonly LightEntity[]): StagedAuthoredLights {
    this.#ensureActive();
    const stagedResources = new Map<string, AuthoredLightResource>();
    try {
      lights.forEach((entity) => stagedResources.set(entity.id, createLightResource(entity)));
    } catch (error) {
      stagedResources.forEach(disposeLightResource);
      throw error;
    }

    let state: "staged" | "committed" | "disposed" = "staged";
    return {
      commit: (mode) => {
        if (state !== "staged") return;
        this.#ensureActive();
        state = "committed";
        this.#publish(stagedResources, mode);
      },
      dispose: () => {
        if (state !== "staged") return;
        state = "disposed";
        stagedResources.forEach(disposeLightResource);
      },
    };
  }

  setAuthoringMode(mode: AuthoringMode): void {
    this.#ensureActive();
    if (this.#authoringMode === mode) return;
    this.#authoringMode = mode;
    this.#resources.forEach((resource) => setResourceAuthoringMode(resource, mode));
    this.#requestRender();
  }

  entityForObject(object: Object3D): string | undefined {
    let current: Object3D | null = object;
    while (current !== null) {
      const entityId = this.#objectEntities.get(current);
      if (entityId !== undefined) return entityId;
      current = current.parent;
    }
    return undefined;
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#resources.forEach((resource) => {
      this.#runtimeEntities.delete(resource.entity.id);
      disposeLightResource(resource);
    });
    this.#resources.clear();
    this.#objectEntities = new WeakMap();
    this.#requestRender();
  }

  #publish(resources: Map<string, AuthoredLightResource>, mode: AuthoringMode): void {
    const previous = this.#resources;
    previous.forEach((resource) => {
      this.#runtimeEntities.delete(resource.entity.id);
      resource.object.removeFromParent();
    });

    this.#authoringMode = mode;
    resources.forEach((resource) => {
      setResourceAuthoringMode(resource, mode);
      this.#root.add(resource.object);
      this.#runtimeEntities.set(resource.entity.id, {
        entity: resource.entity,
        object: resource.object,
      });
    });
    this.#resources = resources;
    this.#objectEntities = indexResourceObjects(resources);
    previous.forEach(disposeLightResource);
    this.#requestRender();
  }

  #ensureActive(): void {
    if (this.#disposed) throw new Error("AuthoredLightController has already been disposed.");
  }
}

function createLightResource(entity: LightEntity): AuthoredLightResource {
  const object = new Group();
  object.name = entity.id;
  object.position.fromArray(entity.transform.position);
  object.quaternion.fromArray(entity.transform.rotation);
  object.scale.fromArray(entity.transform.scale);
  object.visible = entity.visible;

  if (entity.light.kind === "point") {
    const light = new PointLight(
      entity.light.color,
      entity.light.intensity,
      entity.light.range ?? 0,
      2,
    );
    light.castShadow = false;
    light.name = `authored-point:${entity.id}`;
    object.add(light);
  } else {
    const light = new SpotLight(
      entity.light.color,
      entity.light.intensity,
      entity.light.range ?? 0,
      entity.light.angleRadians,
      entity.light.penumbra,
      2,
    );
    light.castShadow = false;
    light.name = `authored-spot:${entity.id}`;
    light.target.name = `authored-spot-target:${entity.id}`;
    light.target.position.set(0, 0, -1);
    object.add(light, light.target);
  }

  const resource = {
    entity,
    object,
    authoringSurface: createAuthoringSurface(entity),
  };
  object.updateMatrix();
  object.updateMatrixWorld(true);
  return resource;
}

function createAuthoringSurface(entity: LightEntity): Group {
  const surface = new Group();
  surface.name = `light-authoring:${entity.id}`;
  surface.userData["web3dLightAuthoringSurface"] = true;

  const sourceGeometry =
    entity.light.kind === "point" ? new SphereGeometry(0.22, 12, 8) : createSpotGeometry();
  const helperGeometry = new EdgesGeometry(sourceGeometry);
  sourceGeometry.dispose();
  const helper = new LineSegments(
    helperGeometry,
    new LineBasicMaterial({ color: entity.light.color, depthTest: false }),
  );
  helper.name = `light-helper:${entity.id}`;
  helper.userData["web3dLightHelper"] = true;

  const proxyGeometry =
    entity.light.kind === "point" ? new SphereGeometry(0.32, 12, 8) : createSpotGeometry(1.35);
  const proxy = new Mesh(
    proxyGeometry,
    new MeshBasicMaterial({
      color: entity.light.color,
      colorWrite: false,
      depthWrite: false,
      opacity: 0,
      transparent: true,
    }),
  );
  proxy.name = `light-pick-proxy:${entity.id}`;
  proxy.userData["web3dLightPickProxy"] = true;
  surface.add(helper, proxy);
  return surface;
}

function createSpotGeometry(scale = 1): ConeGeometry {
  const geometry = new ConeGeometry(0.28 * scale, 0.7 * scale, 12, 1, true);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, 0, -0.35 * scale);
  return geometry;
}

function setResourceAuthoringMode(resource: AuthoredLightResource, mode: AuthoringMode): void {
  if (mode === "edit") {
    if (resource.authoringSurface.parent !== resource.object) {
      resource.object.add(resource.authoringSurface);
    }
    return;
  }
  resource.authoringSurface.removeFromParent();
}

function indexResourceObjects(
  resources: ReadonlyMap<string, AuthoredLightResource>,
): WeakMap<Object3D, string> {
  const index = new WeakMap<Object3D, string>();
  resources.forEach((resource, entityId) => {
    resource.object.traverse((object) => index.set(object, entityId));
    resource.authoringSurface.traverse((object) => index.set(object, entityId));
  });
  return index;
}

function disposeLightResource(resource: AuthoredLightResource): void {
  resource.authoringSurface.removeFromParent();
  disposeObject3D(resource.authoringSurface);
  resource.object.removeFromParent();
  resource.object.clear();
}
