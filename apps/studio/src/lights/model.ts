import { Quaternion as ThreeQuaternion, Vector3 } from "three";

import type {
  AddLightEntityCommand,
  LightEntity,
  SceneDocument,
  Transform,
  UpdateLightEntityCommand,
  Vec3,
} from "@web3d/document";
import type { AuthoringTool } from "@web3d/runtime";

export const MAX_AUTHORED_LIGHTS = 8;
export const POINT_LIGHT_DEFAULT_INTENSITY = 25;
export const SPOT_LIGHT_DEFAULT_INTENSITY = 10;
export const LIGHT_INTENSITY_MAX = 1000;
export const LIGHT_INTENSITY_SLIDER_MAX = 100;

const IDENTITY_ROTATION = [0, 0, 0, 1] as const;
const IDENTITY_SCALE = [1, 1, 1] as const;
const LOCAL_FORWARD = new Vector3(0, 0, -1);

export type StudioLightKind = LightEntity["light"]["kind"];
export type LightCreationFrame = Readonly<{ position: Vec3; target: Vec3 }>;

export function countAuthoredLights(document: SceneDocument | null): number {
  return document?.entities.filter(isLightEntity).length ?? 0;
}

export function isLightEntity(entity: SceneDocument["entities"][number]): entity is LightEntity {
  return entity.type === "light";
}

export function buildAddLightCommand(
  document: SceneDocument,
  kind: StudioLightKind,
  frame: LightCreationFrame,
  entityId: string,
): AddLightEntityCommand {
  return {
    type: "add-light-entity",
    after: createLightEntity(document, kind, frame, entityId),
  };
}

export function buildDuplicateLightCommand(
  document: SceneDocument,
  source: LightEntity,
  entityId: string,
): AddLightEntityCommand {
  const position = source.transform.position.map(
    (value, index) => value + (index === 0 ? 1 : 0),
  ) as [number, number, number];
  return {
    type: "add-light-entity",
    after: {
      ...source,
      id: entityId,
      name: nextLightName(document, source.light.kind),
      parentId: null,
      locked: false,
      transform: {
        position,
        rotation:
          source.light.kind === "point" ? IDENTITY_ROTATION : [...source.transform.rotation],
        scale: IDENTITY_SCALE,
      },
      light: { ...source.light },
      metadata: { ...source.metadata },
    },
  };
}

export function buildUpdateLightCommand(
  before: LightEntity,
  after: LightEntity,
): UpdateLightEntityCommand {
  return { type: "update-light-entity", before, after };
}

export function lightSupportsTool(light: LightEntity, tool: AuthoringTool): boolean {
  if (tool === "select" || tool === "translate") return true;
  return tool === "rotate" && light.light.kind === "spot";
}

export function sameLightEntity(left: LightEntity, right: LightEntity): boolean {
  return (
    left.id === right.id &&
    left.type === right.type &&
    left.parentId === right.parentId &&
    left.name === right.name &&
    left.visible === right.visible &&
    left.locked === right.locked &&
    sameTransform(left.transform, right.transform) &&
    sameLightProperties(left.light, right.light) &&
    sameMetadata(left.metadata, right.metadata)
  );
}

function createLightEntity(
  document: SceneDocument,
  kind: StudioLightKind,
  frame: LightCreationFrame,
  entityId: string,
): LightEntity {
  const transform: Transform = {
    position: [...frame.position],
    rotation: kind === "point" ? IDENTITY_ROTATION : rotationToward(frame.position, frame.target),
    scale: IDENTITY_SCALE,
  };
  const common = {
    id: entityId,
    type: "light" as const,
    parentId: null,
    name: nextLightName(document, kind),
    visible: true,
    locked: false,
    transform,
    metadata: {},
  };
  return kind === "point"
    ? {
        ...common,
        light: { kind, color: "#FFFFFF", intensity: POINT_LIGHT_DEFAULT_INTENSITY, range: null },
      }
    : {
        ...common,
        light: {
          kind,
          color: "#FFFFFF",
          intensity: SPOT_LIGHT_DEFAULT_INTENSITY,
          range: null,
          angleRadians: Math.PI / 4,
          penumbra: 1 / 3,
        },
      };
}

function nextLightName(document: SceneDocument, kind: StudioLightKind): string {
  const base = kind === "point" ? "Point light" : "Spot light";
  const names = new Set(document.entities.map((entity) => entity.name));
  let suffix = 1;
  while (names.has(`${base} ${suffix}`)) suffix += 1;
  return `${base} ${suffix}`;
}

function rotationToward(position: Vec3, target: Vec3): Transform["rotation"] {
  const direction = new Vector3(...target).sub(new Vector3(...position));
  if (!direction.toArray().every(Number.isFinite) || direction.lengthSq() === 0) {
    throw new TypeError("Light creation frame must define a finite non-zero direction.");
  }
  const quaternion = new ThreeQuaternion().setFromUnitVectors(LOCAL_FORWARD, direction.normalize());
  return cleanQuaternion(quaternion.toArray());
}

function cleanQuaternion(value: readonly [number, number, number, number]): Transform["rotation"] {
  return value.map((component) => (Math.abs(component) <= 1e-15 ? 0 : component)) as [
    number,
    number,
    number,
    number,
  ];
}

function sameTransform(left: Transform, right: Transform): boolean {
  return (
    left.position.every((value, index) => value === right.position[index]) &&
    left.rotation.every((value, index) => value === right.rotation[index]) &&
    left.scale.every((value, index) => value === right.scale[index])
  );
}

function sameLightProperties(left: LightEntity["light"], right: LightEntity["light"]): boolean {
  if (
    left.kind !== right.kind ||
    left.color !== right.color ||
    left.intensity !== right.intensity ||
    left.range !== right.range
  ) {
    return false;
  }
  return (
    left.kind === "point" ||
    (right.kind === "spot" &&
      left.angleRadians === right.angleRadians &&
      left.penumbra === right.penumbra)
  );
}

function sameMetadata(left: LightEntity["metadata"], right: LightEntity["metadata"]): boolean {
  const leftEntries = Object.entries(left);
  const rightEntries = Object.entries(right);
  return (
    leftEntries.length === rightEntries.length &&
    leftEntries.every(([key, value]) => right[key] === value)
  );
}
