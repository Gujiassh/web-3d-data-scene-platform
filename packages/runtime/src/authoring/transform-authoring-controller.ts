import type { Transform } from "@web3d/document";
import type { Camera, Object3D, Scene } from "three";
import { TransformControls } from "three/addons/controls/TransformControls.js";

import type { AuthoringTool, AuthoringTransformSettings, AuthoringViewerEvent } from "../types";
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
  #transformSettings: AuthoringTransformSettings = DEFAULT_TRANSFORM_SETTINGS;
  #dragBefore: Transform | null = null;
  #draggingEntityId: string | null = null;
  #dragInvalid = false;

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

  sync(
    generation: RuntimeGeneration | null,
    _selectedEntityIds: readonly string[],
    primaryEntityId: string | null,
  ): void {
    this.#cancelDrag(true);
    this.#controls.detach();
    this.#entities = generation?.entities ?? EMPTY_ENTITIES;
    this.#selectedEntityId = primaryEntityId;
    this.#attachSelectedEntity();
  }

  setTransformSettings(settings: AuthoringTransformSettings): void {
    const next = validateTransformSettings(settings);
    if (sameTransformSettings(this.#transformSettings, next)) return;
    this.#transformSettings = next;
    this.#controls.setTranslationSnap(next.translationSnap);
    this.#controls.setRotationSnap(next.rotationSnapRadians);
    this.#controls.setScaleSnap(next.scaleSnap);
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

  isDragging(): boolean {
    return this.#draggingEntityId !== null;
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
    this.#dragInvalid = false;
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
    this.#dragInvalid = false;
  };

  readonly #handleObjectChange = (): void => {
    const entityId = this.#draggingEntityId;
    if (entityId === null) return;
    const runtimeEntity = this.#entities.get(entityId);
    if (runtimeEntity === undefined || this.#controls.object !== runtimeEntity.object) return;
    const transform = readTransform(runtimeEntity.object);
    if (this.#activeTool === "scale" && (this.#dragInvalid || !hasValidScale(transform))) {
      this.#dragInvalid = true;
      if (this.#dragBefore !== null) applyTransform(runtimeEntity.object, this.#dragBefore);
      this.#requestRender();
      return;
    }
    this.#emit({
      type: "transform-preview",
      entityId,
      transform,
    });
  };

  readonly #handleMouseUp = (): void => {
    const entityId = this.#draggingEntityId;
    const before = this.#dragBefore;
    const invalid = this.#dragInvalid;
    if (invalid) {
      this.#cancelDrag(true);
      return;
    }
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

const DEFAULT_TRANSFORM_SETTINGS: AuthoringTransformSettings = Object.freeze({
  translationSnap: null,
  rotationSnapRadians: null,
  scaleSnap: null,
});

function validateTransformSettings(
  settings: AuthoringTransformSettings,
): AuthoringTransformSettings {
  if (
    settings === null ||
    typeof settings !== "object" ||
    !validSnap(settings.translationSnap) ||
    !validSnap(settings.rotationSnapRadians) ||
    !validSnap(settings.scaleSnap)
  ) {
    throw new TypeError("Transform snap values must be null or finite numbers greater than zero.");
  }
  return Object.freeze({
    translationSnap: settings.translationSnap,
    rotationSnapRadians: settings.rotationSnapRadians,
    scaleSnap: settings.scaleSnap,
  });
}

function validSnap(value: number | null): boolean {
  return value === null || (Number.isFinite(value) && value > 0);
}

function sameTransformSettings(
  left: AuthoringTransformSettings,
  right: AuthoringTransformSettings,
): boolean {
  return (
    left.translationSnap === right.translationSnap &&
    left.rotationSnapRadians === right.rotationSnapRadians &&
    left.scaleSnap === right.scaleSnap
  );
}

function isTransformable(entity: RuntimeEntity): boolean {
  return !entity.entity.locked && isEffectivelyVisible(entity.object);
}

function isEffectivelyVisible(object: Object3D): boolean {
  let current: Object3D | null = object;
  while (current !== null) {
    if (!current.visible) return false;
    current = current.parent;
  }
  return true;
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

function hasValidScale(transform: Transform): boolean {
  return transform.scale.every((value) => Number.isFinite(value) && value > 0);
}

function sameTransform(left: Transform, right: Transform): boolean {
  return (
    left.position.every((value, index) => value === right.position[index]) &&
    left.rotation.every((value, index) => value === right.rotation[index]) &&
    left.scale.every((value, index) => value === right.scale[index])
  );
}
