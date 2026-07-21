import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { TextDecoder, TextEncoder } from "node:util";

export const PRESENTATION_SHELL_ASSET_ID = "presentation_shell";
export const PRESENTATION_SHELL_ENTITY_ID = "presentation-shell";
export const PRESENTATION_SHELL_LICENSE_ID = "CC0-1.0";
export const PRESENTATION_SHELL_FLOORPLAN_SHA256 =
  "11acb6ad855f243f62211ef58b9c7b99f64a08ac09bb9a797159d272e41f8f9d";
export const PRESENTATION_SHELL_LICENSE_SHA256 =
  "c8b1fc96934c2409f4fa36624fa2004199194f89ffe6d50a383923f5f79da5d2";
export const PRESENTATION_SHELL_SHA256 =
  "b94f4f6e9457d3da602695257e3bf9dccf4e676afc666143678effaf7d79b8f6";
export const PRESENTATION_SHELL_FLOOR_THICKNESS_M = 0.04;
export const PRESENTATION_SHELL_EXTERIOR_WALL_HEIGHT_M = 0.28;
export const PRESENTATION_SHELL_INTERIOR_WALL_HEIGHT_M = 0.22;
export const PRESENTATION_DEFAULT_HIDDEN_ASSET_IDS = Object.freeze([
  "entrance_door",
  "balcony_sliding_door",
  "interior_door",
  "casement_window",
  "motorized_curtain",
]);

const FLOORPLAN_PATH = "00_specs/floorplan.json";
const LICENSE_PATH = "scripts/smart-home/fixtures/PRESENTATION_SHELL_LICENSE-CC0.txt";
const GENERATOR_PATH = "scripts/smart-home/presentation-shell.mjs";
const ROOM_COLORS = Object.freeze({
  living: "#C8D5CF",
  dining: "#D8D0C2",
  bathroom: "#BCD2D3",
  foyer: "#D4CABB",
  corridor: "#D0D4CF",
  master_bedroom: "#C9CFDA",
  bedroom_2: "#D7CED5",
  kitchen: "#D5D8C5",
});
const EXTERIOR_WALL_COLOR = "#9EA7A2";
const INTERIOR_WALL_COLOR = "#B7BFBA";
const TRIANGLES_PER_BOX = 12;

export async function validatePresentationShellLicense() {
  const licenseBytes = await readFile(
    new URL("./fixtures/PRESENTATION_SHELL_LICENSE-CC0.txt", import.meta.url),
  );
  assertEqual(sha256(licenseBytes), PRESENTATION_SHELL_LICENSE_SHA256, "CC0 license hash");
}

export function buildPresentationShellAsset(floorplanBytes) {
  assertEqual(
    sha256(floorplanBytes),
    PRESENTATION_SHELL_FLOORPLAN_SHA256,
    "owner-source floorplan hash",
  );
  const floorplan = JSON.parse(new TextDecoder().decode(floorplanBytes));
  assertFloorplan(floorplan);
  const roomMaterials = floorplan.rooms.map((room) =>
    material(`Room / ${room.id}`, requireRoomColor(room.id)),
  );
  const materials = [
    ...roomMaterials,
    material("Exterior low walls", EXTERIOR_WALL_COLOR),
    material("Interior low walls", INTERIOR_WALL_COLOR),
  ];
  const exteriorMaterialIndex = floorplan.rooms.length;
  const interiorMaterialIndex = exteriorMaterialIndex + 1;
  const wallLines = new Map(floorplan.wall_lines.map((line) => [line.id, line]));
  const objects = [
    ...floorplan.rooms.map((room, index) => floorObject(room, index)),
    ...floorplan.wall_segments.map((segment) => {
      const line = wallLines.get(segment.wall_line);
      if (line === undefined)
        throw new Error(`Presentation wall line ${segment.wall_line} is missing.`);
      return wallObject(
        segment,
        line,
        line.kind === "exterior" ? exteriorMaterialIndex : interiorMaterialIndex,
      );
    }),
  ];
  const geometry = boxGeometry();
  const gltf = {
    asset: {
      version: "2.0",
      generator: "web-3d-data-scene-platform presentation-shell 1.0.0",
      copyright: "CC0-1.0",
      extras: {
        license: PRESENTATION_SHELL_LICENSE_ID,
        provenance: GENERATOR_PATH,
        sourceFloorplanSha256: PRESENTATION_SHELL_FLOORPLAN_SHA256,
      },
    },
    scene: 0,
    scenes: [{ name: "Presentation Shell", nodes: [0] }],
    nodes: [
      { name: "Presentation Shell", children: objects.map((_, index) => index + 1) },
      ...objects.map((object, index) => ({
        name: object.name,
        mesh: index,
        translation: object.translation,
        scale: object.scale,
        extras: object.extras,
      })),
    ],
    meshes: objects.map((object) => ({
      name: object.name,
      primitives: [
        {
          attributes: { POSITION: 0, NORMAL: 1 },
          indices: 2,
          material: object.material,
          mode: 4,
        },
      ],
    })),
    materials,
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: geometry.vertexCount,
        type: "VEC3",
        min: [-0.5, -0.5, -0.5],
        max: [0.5, 0.5, 0.5],
      },
      { bufferView: 1, componentType: 5126, count: geometry.vertexCount, type: "VEC3" },
      {
        bufferView: 2,
        componentType: 5123,
        count: geometry.indexCount,
        type: "SCALAR",
        min: [0],
        max: [geometry.vertexCount - 1],
      },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: geometry.positions.byteLength, target: 34962 },
      {
        buffer: 0,
        byteOffset: geometry.positions.byteLength,
        byteLength: geometry.normals.byteLength,
        target: 34962,
      },
      {
        buffer: 0,
        byteOffset: geometry.positions.byteLength + geometry.normals.byteLength,
        byteLength: geometry.indices.byteLength,
        target: 34963,
      },
    ],
    buffers: [{ byteLength: geometry.binary.byteLength }],
  };
  const bytes = encodeGlb(gltf, geometry.binary);
  const triangleCount = objects.length * TRIANGLES_PER_BOX;
  const assetSha256 = sha256(bytes);
  assertEqual(assetSha256, PRESENTATION_SHELL_SHA256, "presentation-shell GLB hash");

  return Object.freeze({
    id: PRESENTATION_SHELL_ASSET_ID,
    name: "Presentation Shell",
    sha256: assetSha256,
    byteLength: bytes.byteLength,
    nodeCount: objects.length + 1,
    meshCount: objects.length,
    materialCount: materials.length,
    triangles: triangleCount,
    bytes,
    provenance: Object.freeze({
      generator: GENERATOR_PATH,
      floorplanPath: FLOORPLAN_PATH,
      floorplanSha256: PRESENTATION_SHELL_FLOORPLAN_SHA256,
      licenseId: PRESENTATION_SHELL_LICENSE_ID,
      licensePath: LICENSE_PATH,
      licenseSha256: PRESENTATION_SHELL_LICENSE_SHA256,
      coordinateSystem: "glTF Y-up; floorplan x -> X, floorplan y -> -Z, floorplan z -> Y",
      roomFloorCount: floorplan.rooms.length,
      wallSegmentCount: floorplan.wall_segments.length,
      floorThicknessM: PRESENTATION_SHELL_FLOOR_THICKNESS_M,
      exteriorWallHeightM: PRESENTATION_SHELL_EXTERIOR_WALL_HEIGHT_M,
      interiorWallHeightM: PRESENTATION_SHELL_INTERIOR_WALL_HEIGHT_M,
      renderedTriangleCount: triangleCount,
    }),
  });
}

export function presentationShellReport(asset) {
  return Object.freeze({
    assetId: asset.id,
    entityId: PRESENTATION_SHELL_ENTITY_ID,
    sha256: asset.sha256,
    byteLength: asset.byteLength,
    stats: Object.freeze({
      nodeCount: asset.nodeCount,
      meshCount: asset.meshCount,
      materialCount: asset.materialCount,
      triangleCount: asset.triangles,
    }),
    provenance: asset.provenance,
  });
}

function floorObject(room, materialIndex) {
  const [minX, minY] = room.bounds.min;
  const [maxX, maxY] = room.bounds.max;
  return Object.freeze({
    name: `Floor / ${room.id}`,
    material: materialIndex,
    translation: [(minX + maxX) / 2, -PRESENTATION_SHELL_FLOOR_THICKNESS_M / 2, -(minY + maxY) / 2],
    scale: [maxX - minX, PRESENTATION_SHELL_FLOOR_THICKNESS_M, maxY - minY],
    extras: { role: "room-floor", roomId: room.id },
  });
}

function wallObject(segment, line, materialIndex) {
  const [startX, startY] = segment.start;
  const [endX, endY] = segment.end;
  const alongX = startY === endY;
  if (!alongX && startX !== endX) {
    throw new Error(`Presentation wall segment ${segment.id} must be axis-aligned.`);
  }
  const length = alongX ? Math.abs(endX - startX) : Math.abs(endY - startY);
  if (!(length > 0)) throw new Error(`Presentation wall segment ${segment.id} has zero length.`);
  const height =
    line.kind === "exterior"
      ? PRESENTATION_SHELL_EXTERIOR_WALL_HEIGHT_M
      : PRESENTATION_SHELL_INTERIOR_WALL_HEIGHT_M;
  return Object.freeze({
    name: `Low wall / ${segment.id}`,
    material: materialIndex,
    translation: [(startX + endX) / 2, height / 2, -(startY + endY) / 2],
    scale: alongX ? [length, height, line.thickness] : [line.thickness, height, length],
    extras: { role: "low-wall", segmentId: segment.id, wallKind: line.kind },
  });
}

function material(name, color) {
  return Object.freeze({
    name,
    pbrMetallicRoughness: {
      baseColorFactor: [...hexColor(color), 1],
      metallicFactor: 0,
      roughnessFactor: 0.92,
    },
    doubleSided: true,
  });
}

function boxGeometry() {
  const faces = [
    [
      [1, 0, 0],
      [
        [0.5, -0.5, -0.5],
        [0.5, 0.5, -0.5],
        [0.5, 0.5, 0.5],
        [0.5, -0.5, 0.5],
      ],
    ],
    [
      [-1, 0, 0],
      [
        [-0.5, -0.5, 0.5],
        [-0.5, 0.5, 0.5],
        [-0.5, 0.5, -0.5],
        [-0.5, -0.5, -0.5],
      ],
    ],
    [
      [0, 1, 0],
      [
        [-0.5, 0.5, -0.5],
        [-0.5, 0.5, 0.5],
        [0.5, 0.5, 0.5],
        [0.5, 0.5, -0.5],
      ],
    ],
    [
      [0, -1, 0],
      [
        [-0.5, -0.5, 0.5],
        [-0.5, -0.5, -0.5],
        [0.5, -0.5, -0.5],
        [0.5, -0.5, 0.5],
      ],
    ],
    [
      [0, 0, 1],
      [
        [-0.5, -0.5, 0.5],
        [0.5, -0.5, 0.5],
        [0.5, 0.5, 0.5],
        [-0.5, 0.5, 0.5],
      ],
    ],
    [
      [0, 0, -1],
      [
        [0.5, -0.5, -0.5],
        [-0.5, -0.5, -0.5],
        [-0.5, 0.5, -0.5],
        [0.5, 0.5, -0.5],
      ],
    ],
  ];
  const positions = [];
  const normals = [];
  const indices = [];
  for (const [normal, vertices] of faces) {
    const offset = positions.length / 3;
    for (const vertex of vertices) {
      positions.push(...vertex);
      normals.push(...normal);
    }
    indices.push(offset, offset + 1, offset + 2, offset, offset + 2, offset + 3);
  }
  const positionBytes = float32Bytes(positions);
  const normalBytes = float32Bytes(normals);
  const indexBytes = uint16Bytes(indices);
  const binary = new Uint8Array(
    positionBytes.byteLength + normalBytes.byteLength + indexBytes.byteLength,
  );
  binary.set(positionBytes, 0);
  binary.set(normalBytes, positionBytes.byteLength);
  binary.set(indexBytes, positionBytes.byteLength + normalBytes.byteLength);
  return Object.freeze({
    positions: positionBytes,
    normals: normalBytes,
    indices: indexBytes,
    binary,
    vertexCount: positions.length / 3,
    indexCount: indices.length,
  });
}

function encodeGlb(gltf, binary) {
  const json = new TextEncoder().encode(JSON.stringify(gltf));
  const jsonLength = align4(json.byteLength);
  const binaryLength = align4(binary.byteLength);
  const output = new Uint8Array(12 + 8 + jsonLength + 8 + binaryLength);
  const view = new DataView(output.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, output.byteLength, true);
  view.setUint32(12, jsonLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  output.fill(0x20, 20, 20 + jsonLength);
  output.set(json, 20);
  const binaryHeader = 20 + jsonLength;
  view.setUint32(binaryHeader, binaryLength, true);
  view.setUint32(binaryHeader + 4, 0x004e4942, true);
  output.set(binary, binaryHeader + 8);
  return output;
}

function float32Bytes(values) {
  const bytes = new Uint8Array(values.length * 4);
  const view = new DataView(bytes.buffer);
  values.forEach((value, index) => view.setFloat32(index * 4, value, true));
  return bytes;
}

function uint16Bytes(values) {
  const bytes = new Uint8Array(values.length * 2);
  const view = new DataView(bytes.buffer);
  values.forEach((value, index) => view.setUint16(index * 2, value, true));
  return bytes;
}

function assertFloorplan(value) {
  assertEqual(value.schema_version, "1.0.0", "floorplan schema_version");
  assertEqual(value.project_id, "smart_home_90sqm", "floorplan project_id");
  assertEqual(value.units, "m", "floorplan units");
  assertEqual(value.coordinate_system?.z_axis, "up_positive", "floorplan source up axis");
  assertEqual(value.rooms?.length, 8, "floorplan room count");
  assertEqual(value.wall_lines?.length, 11, "floorplan wall line count");
  assertEqual(value.wall_segments?.length, 27, "floorplan wall segment count");
  const roomIds = value.rooms.map((room) => room.id);
  assertEqual(
    JSON.stringify(roomIds),
    JSON.stringify(Object.keys(ROOM_COLORS)),
    "floorplan room order",
  );
  const wallLineIds = new Set(value.wall_lines.map((line) => line.id));
  for (const segment of value.wall_segments) {
    if (!wallLineIds.has(segment.wall_line)) {
      throw new Error(`Presentation wall segment ${segment.id} has an unknown wall line.`);
    }
  }
}

function requireRoomColor(roomId) {
  const color = ROOM_COLORS[roomId];
  if (color === undefined) throw new Error(`Presentation room ${roomId} has no material color.`);
  return color;
}

function hexColor(value) {
  return [1, 3, 5].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16) / 255);
}

function align4(value) {
  return Math.ceil(value / 4) * 4;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function assertEqual(actual, expected, label) {
  if (actual !== expected)
    throw new Error(`${label} mismatch: expected ${expected}, received ${actual}.`);
}
