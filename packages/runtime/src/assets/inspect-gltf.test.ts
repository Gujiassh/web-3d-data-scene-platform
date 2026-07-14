import { readFile } from "node:fs/promises";

import { BoxGeometry, Group, Mesh, MeshBasicMaterial } from "three";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MAX_GLTF_INSPECTION_BYTES, inspectGltf } from "./inspect-gltf";
import { sha256Hex } from "./asset-loader";

const assetUrl = new URL("../../../../assets/factory/public/m0-factory-cell.glb", import.meta.url);

if (typeof globalThis.ProgressEvent === "undefined") {
  class TestProgressEvent extends Event {
    readonly lengthComputable: boolean;
    readonly loaded: number;
    readonly total: number;

    constructor(
      type: string,
      init: { lengthComputable?: boolean; loaded?: number; total?: number } = {},
    ) {
      super(type);
      this.lengthComputable = init.lengthComputable ?? false;
      this.loaded = init.loaded ?? 0;
      this.total = init.total ?? 0;
    }
  }

  globalThis.ProgressEvent = TestProgressEvent as typeof ProgressEvent;
}

describe("inspectGltf", () => {
  afterEach(() => vi.restoreAllMocks());

  it("inspects the real M0 GLB and returns an immutable summary", async () => {
    const file = await readFile(assetUrl);
    const bytes = toArrayBuffer(file);

    const summary = await inspectGltf("m0-factory-cell.glb", bytes);

    expect(summary).toEqual({
      name: "m0-factory-cell.glb",
      mediaType: "model/gltf-binary",
      byteLength: file.byteLength,
      sha256: await sha256Hex(bytes),
      stats: {
        nodeCount: 2,
        meshCount: 1,
        materialCount: 1,
        triangleCount: 24,
      },
      warnings: [],
    });
    expect(Object.isFrozen(summary)).toBe(true);
    expect(Object.isFrozen(summary.stats)).toBe(true);
    expect(Object.isFrozen(summary.warnings)).toBe(true);
  });

  it("accepts a self-contained glTF with data URIs", async () => {
    const bytes = gltfJsonBytes(selfContainedTriangleGltf());

    const summary = await inspectGltf("triangle.gltf", bytes);

    expect(summary.mediaType).toBe("model/gltf+json");
    expect(summary.stats).toEqual({
      nodeCount: 1,
      meshCount: 1,
      materialCount: 1,
      triangleCount: 1,
    });
  });

  it("rejects a glTF with external resource URIs", async () => {
    const bytes = gltfJsonBytes({
      asset: { version: "2.0" },
      buffers: [{ uri: "mesh.bin", byteLength: 12 }],
    });

    await expect(inspectGltf("external.gltf", bytes)).rejects.toMatchObject({
      code: "INSPECT_GLTF_EXTERNAL_URI_UNSUPPORTED",
    });
  });

  it("rejects files larger than 50 MiB before parsing", async () => {
    const parse = vi.spyOn(GLTFLoader.prototype, "parseAsync");

    await expect(
      inspectGltf("too-large.glb", new ArrayBuffer(MAX_GLTF_INSPECTION_BYTES + 1)),
    ).rejects.toMatchObject({ code: "INSPECT_GLTF_TOO_LARGE" });
    expect(parse).not.toHaveBeenCalled();
  });

  it("rejects invalid GLB headers", async () => {
    const file = await readFile(assetUrl);
    const valid = new Uint8Array(toArrayBuffer(file));

    const badMagic = valid.slice();
    badMagic[0] = 0;

    const badVersion = valid.slice();
    new DataView(badVersion.buffer).setUint32(4, 1, true);

    const badLength = valid.slice();
    new DataView(badLength.buffer).setUint32(8, valid.byteLength - 1, true);

    await expect(inspectGltf("bad-magic.glb", badMagic.buffer)).rejects.toMatchObject({
      code: "INSPECT_GLB_HEADER_INVALID",
    });
    await expect(inspectGltf("bad-version.glb", badVersion.buffer)).rejects.toMatchObject({
      code: "INSPECT_GLB_VERSION_UNSUPPORTED",
    });
    await expect(inspectGltf("bad-length.glb", badLength.buffer)).rejects.toMatchObject({
      code: "INSPECT_GLB_LENGTH_MISMATCH",
    });
  });

  it("rejects a damaged GLB when GLTFLoader cannot parse it", async () => {
    const file = await readFile(assetUrl);
    const damaged = new Uint8Array(toArrayBuffer(file));
    const jsonChunkOffset = 20;
    damaged.fill(0xff, jsonChunkOffset, jsonChunkOffset + 32);

    await expect(inspectGltf("damaged.glb", damaged.buffer)).rejects.toMatchObject({
      code: "INSPECT_GLTF_PARSE_FAILED",
    });
  });

  it("disposes parsed resources after a successful inspection", async () => {
    const root = new Group();
    const geometry = new BoxGeometry();
    const dispose = vi.fn();
    geometry.addEventListener("dispose", dispose);
    root.add(new Mesh(geometry, new MeshBasicMaterial()));

    vi.spyOn(GLTFLoader.prototype, "parseAsync").mockResolvedValue(
      fakeGltf({
        root,
        scenes: [root],
        json: { nodes: [{}], meshes: [{}], materials: [{}] },
      }),
    );

    const summary = await inspectGltf("dispose-success.glb", toArrayBuffer(fakeGlbBytes()));

    expect(summary.stats.triangleCount).toBe(12);
    expect(dispose).toHaveBeenCalledOnce();
  });

  it("rejects multi-scene assets and still disposes parsed resources", async () => {
    const first = new Group();
    const second = new Group();
    const geometry = new BoxGeometry();
    const dispose = vi.fn();
    geometry.addEventListener("dispose", dispose);
    first.add(new Mesh(geometry, new MeshBasicMaterial()));

    vi.spyOn(GLTFLoader.prototype, "parseAsync").mockResolvedValue(
      fakeGltf({
        root: first,
        scenes: [first, second],
        json: { nodes: [{}], meshes: [{}], materials: [{}] },
      }),
    );

    await expect(
      inspectGltf("multi-scene.glb", toArrayBuffer(fakeGlbBytes())),
    ).rejects.toMatchObject({
      code: "INSPECT_GLTF_MULTISCENE_UNSUPPORTED",
    });
    expect(dispose).toHaveBeenCalledOnce();
  });
});

function selfContainedTriangleGltf(): Record<string, unknown> {
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const indices = new Uint16Array([0, 1, 2]);
  const combined = new Uint8Array(positions.byteLength + indices.byteLength);
  combined.set(new Uint8Array(positions.buffer), 0);
  combined.set(new Uint8Array(indices.buffer), positions.byteLength);

  return {
    asset: { version: "2.0" },
    scenes: [{ nodes: [0] }],
    scene: 0,
    nodes: [{ mesh: 0, name: "Triangle" }],
    meshes: [
      {
        primitives: [
          {
            attributes: { POSITION: 0 },
            indices: 1,
            material: 0,
          },
        ],
      },
    ],
    materials: [{ pbrMetallicRoughness: { baseColorFactor: [1, 0, 0, 1] } }],
    buffers: [
      {
        uri: toDataUri(combined),
        byteLength: combined.byteLength,
      },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positions.byteLength, target: 34962 },
      {
        buffer: 0,
        byteOffset: positions.byteLength,
        byteLength: indices.byteLength,
        target: 34963,
      },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 3,
        type: "VEC3",
        min: [0, 0, 0],
        max: [1, 1, 0],
      },
      {
        bufferView: 1,
        componentType: 5123,
        count: 3,
        type: "SCALAR",
      },
    ],
  };
}

function fakeGltf(input: {
  root: Group;
  scenes: Group[];
  json: { nodes?: unknown[]; meshes?: unknown[]; materials?: unknown[] };
}): GLTF {
  return {
    scene: input.root,
    scenes: input.scenes,
    animations: [],
    cameras: [],
    asset: { version: "2.0" },
    parser: {
      associations: new Map(),
      json: input.json,
    },
    userData: {},
  } as unknown as GLTF;
}

function fakeGlbBytes(): Uint8Array {
  const bytes = new Uint8Array(12);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, bytes.byteLength, true);
  return bytes;
}

function gltfJsonBytes(value: unknown): ArrayBuffer {
  return toArrayBuffer(new TextEncoder().encode(JSON.stringify(value)));
}

function toDataUri(bytes: Uint8Array): string {
  return `data:application/octet-stream;base64,${Buffer.from(bytes).toString("base64")}`;
}

function toArrayBuffer(value: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy.buffer;
}
