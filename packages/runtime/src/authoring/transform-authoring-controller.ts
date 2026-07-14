import type { Transform } from "@web3d/document";
import type { Camera, Object3D, Scene } from "three";
import { TransformControls } from "three/addons/controls/TransformControls.js";

import type { AuthoringTool, AuthoringViewerEvent } from "../types";
import type { RuntimeEntity, RuntimeGeneration } from "../viewer/runtime-generation";

type TransformEvent = Extract<
  AuthoringViewerEvent,
  { type: "transform-preview" | "transform-commit" }
>;

export interface TransformAuthoringControllerOptions {
  readonly camera: Camera;
  readonly surface: HTMLElement;
  readonly scene: Scene;
  readonly orbitControls: { enabled: boolean };
  readonly initialTool: AuthoringTool;
  readonly emit: (event: TransformEvent) => void;
  readonly requestRender: () => void;
}

export type TransformAuthoringControllerFactory = (
  options: TransformAuthoringControllerOptions,
) => TransformAuthoringController;

const EMPTY_ENTITIES: ReadonlyMap<string, RuntimeEntity> = new Map();

export class TransformAuthoringController {
  readonly #controls: TransformControls;
  readonly #helper: Object3D;
  readonly #orbitControls: { enabled: boolean };
  readonly #emit: (event: TransformEvent) => void;
  readonly #requestRender: () => void;

  #entities: ReadonlyMap<string, RuntimeEntity> = EMPTY_ENTITIES;
  #selectedEntityId: string | null = null;
  #activeTool: AuthoringTool;
  #dragBefore: Transform | null = null;
  #draggingEntityId: string | null = null;

  constructor(options: TransformAuthoringControllerOptions) {
    this.#orbitControls = options.orbitControls;
    this.#emit = options.emit;
    this.#requestRender = options.requestRender;
    this.#activeTool = options.initialTool;
    this.#controls = new TransformControls(options.camera, options.surface);
    this.#helper = this.#controls.getHelper();
    this.#controls.addEventListener("change", this.#requestRender);
    this.#controls.addEventListener("dragging-changed", this.#handleDraggingChanged as never);
    this.#controls.addEventListener("mouseDown", this.#handleMouseDown as never);
    this.#controls.addEventListener("mouseUp", this.#handleMouseUp as never);
    this.#controls.addEventListener("objectChange", this.#handleObjectChange as never);
    options.scene.add(this.#helper);
  }

  sync(generation: RuntimeGeneration | null, selectedEntityId: string | null): void {
    this.#cancelDrag(true);
    this.#controls.detach();
    this.#entities = generation?.entities ?? EMPTY_ENTITIES;
    this.#selectedEntityId = selectedEntityId;
    this.#attachSelectedEntity();
  }

  setTool(tool: AuthoringTool): void {
    if (this.#activeTool === tool) return;
    this.#activeTool = tool;
    this.#controls.detach();
    this.#cancelDrag(true);
    this.#attachSelectedEntity();
  }

  getTool(): AuthoringTool {
    return this.#activeTool;
  }

  dispose(): void {
    this.#cancelDrag(true);
    this.#orbitControls.enabled = true;
    this.#controls.removeEventListener("change", this.#requestRender);
    this.#controls.removeEventListener("dragging-changed", this.#handleDraggingChanged as never);
    this.#controls.removeEventListener("mouseDown", this.#handleMouseDown as never);
    this.#controls.removeEventListener("mouseUp", this.#handleMouseUp as never);
    this.#controls.removeEventListener("objectChange", this.#handleObjectChange as never);
    this.#controls.detach();
    this.#helper.removeFromParent();
    this.#controls.dispose();
  }

  #attachSelectedEntity(): void {
    if (this.#activeTool === "select" || this.#selectedEntityId === null) return;
    const runtimeEntity = this.#entities.get(this.#selectedEntityId);
    if (runtimeEntity === undefined || !isTransformable(runtimeEntity)) return;
    this.#controls.setMode(this.#activeTool);
    this.#controls.attach(runtimeEntity.object);
  }

  #cancelDrag(revert: boolean): void {
    const runtimeEntity =
      this.#draggingEntityId === null ? undefined : this.#entities.get(this.#draggingEntityId);
    if (revert && runtimeEntity !== undefined && this.#dragBefore !== null) {
      applyTransform(runtimeEntity.object, this.#dragBefore);
      this.#requestRender();
    }
    this.#dragBefore = null;
    this.#draggingEntityId = null;
    this.#orbitControls.enabled = true;
  }

  readonly #handleDraggingChanged = (event: Event): void => {
    this.#orbitControls.enabled = !(event as { value?: boolean }).value;
  };

  readonly #handleMouseDown = (): void => {
    const entityId = this.#selectedEntityId;
    if (entityId === null) return;
    const runtimeEntity = this.#entities.get(entityId);
    if (runtimeEntity === undefined || !isTransformable(runtimeEntity)) return;
    this.#draggingEntityId = entityId;
    this.#dragBefore = readTransform(runtimeEntity.object);
  };

  readonly #handleObjectChange = (): void => {
    const entityId = this.#draggingEntityId;
    if (entityId === null) return;
    const runtimeEntity = this.#entities.get(entityId);
    if (runtimeEntity === undefined || this.#controls.object !== runtimeEntity.object) return;
    this.#emit({
      type: "transform-preview",
      entityId,
      transform: readTransform(runtimeEntity.object),
    });
  };

  readonly #handleMouseUp = (): void => {
    const entityId = this.#draggingEntityId;
    const before = this.#dragBefore;
    this.#cancelDrag(false);
    if (entityId === null || before === null) return;
    const runtimeEntity = this.#entities.get(entityId);
    if (runtimeEntity === undefined) return;
    const after = readTransform(runtimeEntity.object);
    if (!sameTransform(before, after)) {
      this.#emit({ type: "transform-commit", entityId, before, after });
    }
  };
}

function isTransformable(entity: RuntimeEntity): boolean {
  return entity.entity.visible && !entity.entity.locked;
}

function readTransform(object: Object3D): Transform {
  return {
    position: [object.position.x, object.position.y, object.position.z],
    rotation: [object.quaternion.x, object.quaternion.y, object.quaternion.z, object.quaternion.w],
    scale: [object.scale.x, object.scale.y, object.scale.z],
  };
}

function applyTransform(object: Object3D, transform: Transform): void {
  object.position.fromArray(transform.position);
  object.quaternion.fromArray(transform.rotation);
  object.scale.fromArray(transform.scale);
  object.updateMatrix();
  object.updateMatrixWorld(true);
}

function sameTransform(left: Transform, right: Transform): boolean {
  return (
    left.position.every((value, index) => value === right.position[index]) &&
    left.rotation.every((value, index) => value === right.rotation[index]) &&
    left.scale.every((value, index) => value === right.scale[index])
  );
}
