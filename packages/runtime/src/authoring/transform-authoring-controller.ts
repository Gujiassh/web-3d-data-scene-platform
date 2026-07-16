import type { Transform } from "@web3d/document";
import { PerspectiveCamera, Vector3, type Camera, type Object3D, type Scene } from "three";
import { TransformControls } from "three/addons/controls/TransformControls.js";

import type {
  AuthoringTool,
  AuthoringTransformSettings,
  AuthoringViewerEvent,
  EntitySpatialSnapshot,
  EntityWorldBounds,
} from "../types";
import type { RuntimeEntity, RuntimeGeneration } from "../viewer/runtime-generation";
import { SmartAlignGuideOverlay } from "./smart-align/guide-overlay";
import {
  activeSmartAlignAxes,
  boundsCenter,
  buildSmartAlignReferenceIndex,
  findSmartAlignCandidate,
  smartAlignThreshold,
  snapWorldPositionToStep,
  type SmartAlignAxis,
  type SmartAlignCandidate,
  type SmartAlignReferenceIndex,
} from "./smart-align/oracle";

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
  readonly getSpatialSnapshots: () => readonly EntitySpatialSnapshot[];
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
  readonly #camera: Camera;
  readonly #surface: HTMLElement;
  readonly #getSpatialSnapshots: () => readonly EntitySpatialSnapshot[];
  readonly #guideOverlay: SmartAlignGuideOverlay;

  #entities: ReadonlyMap<string, RuntimeEntity> = EMPTY_ENTITIES;
  #selectedEntityId: string | null = null;
  #selectedEntityIds: readonly string[] = [];
  #activeTool: AuthoringTool;
  #transformSettings: AuthoringTransformSettings = DEFAULT_TRANSFORM_SETTINGS;
  #smartAlignEnabled = true;
  #smartAlignDrag: SmartAlignDrag | null = null;
  #altPressed = false;
  #snapBypassed = false;
  #dragBefore: Transform | null = null;
  #draggingEntityId: string | null = null;
  #dragInvalid = false;

  constructor(options: TransformAuthoringControllerOptions) {
    this.#orbitControls = options.orbitControls;
    this.#emit = options.emit;
    this.#requestRender = options.requestRender;
    this.#activeTool = options.initialTool;
    this.#camera = options.camera;
    this.#surface = options.surface;
    this.#getSpatialSnapshots = options.getSpatialSnapshots;
    this.#controls = new TransformControls(options.camera, options.surface);
    this.#helper = this.#controls.getHelper();
    this.#guideOverlay = new SmartAlignGuideOverlay(options.scene, options.requestRender);
    this.#controls.addEventListener("change", this.#requestRender);
    this.#controls.addEventListener("dragging-changed", this.#handleDraggingChanged as never);
    this.#controls.addEventListener("mouseDown", this.#handleMouseDown as never);
    this.#controls.addEventListener("mouseUp", this.#handleMouseUp as never);
    this.#controls.addEventListener("objectChange", this.#handleObjectChange as never);
    options.scene.add(this.#helper);
    const view = options.surface.ownerDocument?.defaultView ?? globalThis.window;
    view?.addEventListener("keydown", this.#handleModifierChange);
    view?.addEventListener("keyup", this.#handleModifierChange);
    view?.addEventListener("blur", this.#handleWindowBlur);
  }

  sync(
    generation: RuntimeGeneration | null,
    selectedEntityIds: readonly string[],
    primaryEntityId: string | null,
  ): void {
    this.#cancelDrag(true);
    this.#controls.detach();
    this.#entities = generation?.entities ?? EMPTY_ENTITIES;
    this.#selectedEntityIds = [...selectedEntityIds];
    this.#selectedEntityId = primaryEntityId;
    this.#attachSelectedEntity();
  }

  setTransformSettings(settings: AuthoringTransformSettings): void {
    const next = validateTransformSettings(settings);
    if (sameTransformSettings(this.#transformSettings, next)) return;
    this.#transformSettings = next;
    if (this.#smartAlignDrag === null) this.#controls.setTranslationSnap(next.translationSnap);
    this.#controls.setRotationSnap(next.rotationSnapRadians);
    this.#controls.setScaleSnap(next.scaleSnap);
  }

  setSmartAlignEnabled(enabled: boolean): void {
    if (this.#smartAlignEnabled === enabled) return;
    this.#smartAlignEnabled = enabled;
    if (!enabled) this.#guideOverlay.clear();
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
    const view = this.#surface.ownerDocument?.defaultView ?? globalThis.window;
    view?.removeEventListener("keydown", this.#handleModifierChange);
    view?.removeEventListener("keyup", this.#handleModifierChange);
    view?.removeEventListener("blur", this.#handleWindowBlur);
    this.#controls.detach();
    this.#helper.removeFromParent();
    this.#guideOverlay.dispose();
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
    this.#smartAlignDrag = null;
    this.#snapBypassed = false;
    this.#guideOverlay.clear();
    this.#controls.setTranslationSnap(this.#transformSettings.translationSnap);
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
    if (this.#activeTool === "translate") {
      this.#snapBypassed = this.#altPressed;
      this.#controls.setTranslationSnap(null);
      this.#smartAlignDrag = this.#createSmartAlignDrag(entityId);
    }
  };

  readonly #handleObjectChange = (): void => {
    const entityId = this.#draggingEntityId;
    if (entityId === null) return;
    const runtimeEntity = this.#entities.get(entityId);
    if (runtimeEntity === undefined || this.#controls.object !== runtimeEntity.object) return;
    if (this.#activeTool === "translate") this.#applyTranslationSnap(runtimeEntity.object);
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

  readonly #handleModifierChange = (event: KeyboardEvent): void => {
    this.#altPressed = event.altKey;
    if (this.#draggingEntityId === null || this.#snapBypassed === this.#altPressed) return;
    this.#snapBypassed = this.#altPressed;
    if (this.#snapBypassed) this.#guideOverlay.clear();
  };

  readonly #handleWindowBlur = (): void => {
    this.#altPressed = false;
    this.#snapBypassed = false;
  };

  #createSmartAlignDrag(entityId: string): SmartAlignDrag | null {
    const axes = activeSmartAlignAxes(this.#controls.axis);
    if (axes.length === 0) return null;
    let snapshots: readonly EntitySpatialSnapshot[];
    try {
      snapshots = this.#getSpatialSnapshots();
    } catch {
      return { axes, index: null, movingBounds: null, movingWorldPivot: null };
    }
    const moving = snapshots.find((snapshot) => snapshot.entityId === entityId);
    return {
      axes,
      index:
        this.#smartAlignEnabled && moving?.worldBounds !== null && moving !== undefined
          ? buildSmartAlignReferenceIndex(snapshots, entityId, this.#selectedEntityIds)
          : null,
      movingBounds: moving?.worldBounds ?? null,
      movingWorldPivot: moving?.worldPivot ?? null,
    };
  }

  #applyTranslationSnap(object: Object3D): void {
    const drag = this.#smartAlignDrag;
    if (drag === null || this.#snapBypassed) {
      this.#guideOverlay.clear();
      return;
    }
    object.updateMatrixWorld(true);
    const worldPosition = object.getWorldPosition(new Vector3());
    const rawWorldPosition = [worldPosition.x, worldPosition.y, worldPosition.z] as const;
    const movingBounds = translatedBounds(
      drag.movingBounds,
      drag.movingWorldPivot,
      rawWorldPosition,
    );
    const smartCandidates: SmartAlignCandidate[] = [];
    const snapped = [...rawWorldPosition] as [number, number, number];
    const fixed = snapWorldPositionToStep(
      rawWorldPosition,
      drag.axes,
      this.#transformSettings.translationSnap,
    );

    let threshold: number | null = null;
    if (movingBounds !== null && this.#camera instanceof PerspectiveCamera) {
      this.#camera.updateMatrixWorld(true);
      const center = new Vector3(...boundsCenter(movingBounds)).applyMatrix4(
        this.#camera.matrixWorldInverse,
      );
      threshold = smartAlignThreshold(
        -center.z,
        this.#camera.fov,
        Math.max(1, this.#surface.clientHeight),
      );
    }

    for (const axis of drag.axes) {
      const index = axisIndex(axis);
      const candidate =
        this.#smartAlignEnabled &&
        drag.index !== null &&
        movingBounds !== null &&
        threshold !== null
          ? findSmartAlignCandidate(drag.index, movingBounds, axis, threshold)
          : null;
      if (candidate === null) snapped[index] = fixed[index];
      else {
        snapped[index] += candidate.delta;
        smartCandidates.push(candidate);
      }
    }
    setWorldPosition(object, snapped);
    this.#guideOverlay.update(
      smartCandidates.map((candidate) =>
        guideCandidateAtFinalPosition(candidate, rawWorldPosition, snapped),
      ),
    );
  }
}

interface SmartAlignDrag {
  readonly axes: readonly SmartAlignAxis[];
  readonly index: SmartAlignReferenceIndex | null;
  readonly movingBounds: EntityWorldBounds | null;
  readonly movingWorldPivot: readonly [number, number, number] | null;
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

function translatedBounds(
  bounds: EntityWorldBounds | null,
  baselinePivot: readonly [number, number, number] | null,
  worldPosition: readonly [number, number, number],
): EntityWorldBounds | null {
  if (bounds === null || baselinePivot === null) return null;
  const delta = worldPosition.map((value, index) => value - baselinePivot[index]!) as [
    number,
    number,
    number,
  ];
  return {
    min: bounds.min.map((value, index) => value + delta[index]!) as [number, number, number],
    max: bounds.max.map((value, index) => value + delta[index]!) as [number, number, number],
  };
}

function setWorldPosition(
  object: Object3D,
  worldPosition: readonly [number, number, number],
): void {
  const local = new Vector3(...worldPosition);
  object.parent?.worldToLocal(local);
  object.position.copy(local);
  object.updateMatrix();
  object.updateMatrixWorld(true);
}

function axisIndex(axis: SmartAlignAxis): 0 | 1 | 2 {
  return axis === "x" ? 0 : axis === "y" ? 1 : 2;
}

function guideCandidateAtFinalPosition(
  candidate: SmartAlignCandidate,
  rawWorldPosition: readonly [number, number, number],
  snappedWorldPosition: readonly [number, number, number],
): SmartAlignCandidate {
  const activeIndex = axisIndex(candidate.axis);
  return {
    ...candidate,
    guideStart: candidate.guideStart.map((value, index) =>
      index === activeIndex
        ? value
        : value + snappedWorldPosition[index]! - rawWorldPosition[index]!,
    ) as [number, number, number],
  };
}
