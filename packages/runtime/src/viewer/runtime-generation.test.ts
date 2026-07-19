import { readFile } from "node:fs/promises";

import { parseSceneDocument, type LightEntity } from "@web3d/document";
import {
  Box3,
  BufferGeometry,
  Color,
  Mesh,
  MeshStandardMaterial,
  PointLight,
  SpotLight,
  Vector3,
  type Material,
} from "three";
import { describe, expect, it, vi } from "vitest";

import { applyRuleEffects, resetRuleEffects } from "./effect-projector";
import { buildRuntimeGeneration } from "./runtime-generation";

const sceneUrl = new URL(
  "../../../../tests/fixtures/m0-factory/public/m0-scene.json",
  import.meta.url,
);
const assetUrl = new URL(
  "../../../../tests/fixtures/m0-factory/public/m0-factory-cell.glb",
  import.meta.url,
);
const pbrSceneUrl = new URL(
  "../../../../tests/fixtures/006b-light-performance-pbr/public/006b-light-performance-pbr.scene.json",
  import.meta.url,
);
const pbrAssetUrl = new URL(
  "../../../../tests/fixtures/006b-light-performance-pbr/public/006b-light-performance-pbr.glb",
  import.meta.url,
);

describe("buildRuntimeGeneration", () => {
  it("builds exact hotspot surface evidence from formal loader node associations", async () => {
    const [sceneJson, asset] = await Promise.all([readFile(sceneUrl, "utf8"), readFile(assetUrl)]);
    const parsed = parseSceneDocument(sceneJson);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const entity = parsed.value.entities.find((candidate) => candidate.type === "asset");
    const sceneAsset = parsed.value.assets[0];
    expect(entity?.type).toBe("asset");
    expect(sceneAsset).toBeDefined();
    if (entity?.type !== "asset" || sceneAsset === undefined) return;
    const generation = await buildRuntimeGeneration(
      parsed.value,
      { resolve: () => Promise.resolve(new Blob([asset])) },
      new AbortController().signal,
    );
    const surface = generation.entities.get(entity.id)?.object.getObjectByProperty("isMesh", true);
    expect(surface).toBeDefined();
    if (surface === undefined) return;
    const lookup = generation.hotspotSurfaces.lookupHitObject(surface);
    expect(lookup).toMatchObject({
      ok: true,
      identity: { entityId: entity.id, assetHash: sceneAsset.sha256 },
    });
    if (!lookup.ok) return;
    const anchor = {
      kind: "surface" as const,
      ...lookup.identity,
      nodeLocalPosition: [0, 0, 0] as const,
      nodeLocalNormal: [0, 1, 0] as const,
    };
    expect(
      generation.hotspotSurfaces.resolveAnchor(anchor, new Vector3(), new Vector3()),
    ).toMatchObject({ ok: true });
    expect(
      generation.hotspotSurfaces.resolveAnchor(
        { ...anchor, entityId: "wrong-entity" },
        new Vector3(),
        new Vector3(),
      ),
    ).toEqual({ ok: false, reason: "entity-not-registered" });
    expect(
      generation.hotspotSurfaces.resolveAnchor(
        { ...anchor, assetHash: "0".repeat(64) },
        new Vector3(),
        new Vector3(),
      ),
    ).toEqual({ ok: false, reason: "asset-hash-mismatch" });
    expect(
      generation.hotspotSurfaces.resolveAnchor(
        { ...anchor, nodeIndex: Number.MAX_SAFE_INTEGER },
        new Vector3(),
        new Vector3(),
      ),
    ).toEqual({ ok: false, reason: "node-not-registered" });
    generation.dispose();
  });

  it("maps both M0 targets by node index and isolates their materials", async () => {
    const [sceneJson, asset] = await Promise.all([readFile(sceneUrl, "utf8"), readFile(assetUrl)]);
    const parsed = parseSceneDocument(sceneJson);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const generation = await buildRuntimeGeneration(
      parsed.value,
      { resolve: () => Promise.resolve(new Blob([asset])) },
      new AbortController().signal,
    );
    const press = generation.targets.get("press-01");
    const conveyor = generation.targets.get("conveyor-01");

    expect(press).toBeDefined();
    expect(conveyor).toBeDefined();
    expect(press?.materials[0]).not.toBe(conveyor?.materials[0]);
    if (press !== undefined && conveyor !== undefined) {
      applyRuleEffects(press, [{ type: "color", value: "#B93632" }]);
      applyRuleEffects(conveyor, [{ type: "color", value: "#2E7D4D" }]);
      expect(generation.entityForObject(press.object)).toBe("factory-cell");
      expect(generation.entityForObject(conveyor.object)).toBe("factory-cell");
      expect(generation.targetForObject(press.object)).toBe("press-01");
      expect(generation.targetForObject(conveyor.object)).toBe("conveyor-01");
    }

    const dispose = vi.fn();
    press?.materials[0]?.addEventListener("dispose", dispose);
    generation.dispose();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it("restores baseline color and visibility after projected effects", async () => {
    const [sceneJson, asset] = await Promise.all([readFile(sceneUrl, "utf8"), readFile(assetUrl)]);
    const parsed = parseSceneDocument(sceneJson);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const generation = await buildRuntimeGeneration(
      parsed.value,
      { resolve: () => Promise.resolve(new Blob([asset])) },
      new AbortController().signal,
    );
    const target = generation.targets.get("press-01");
    expect(target).toBeDefined();
    if (target === undefined) return;
    const baselineColor = target.baseline.colors[0]?.getHexString();
    const baselineVisibility = target.baseline.visible;

    applyRuleEffects(target, [
      { type: "color", value: "#B93632" },
      { type: "visibility", value: !baselineVisibility },
    ]);
    expect(target.object.visible).toBe(!baselineVisibility);
    expect(materialColorHex(target.materials[0])).not.toBe(baselineColor);

    resetRuleEffects(target);
    expect(target.object.visible).toBe(baselineVisibility);
    expect(materialColorHex(target.materials[0])).toBe(baselineColor);
    generation.dispose();
  });

  it("disposes an earlier unattached asset when a later asset fails", async () => {
    const [sceneJson, asset] = await Promise.all([readFile(sceneUrl, "utf8"), readFile(assetUrl)]);
    const parsed = parseSceneDocument(sceneJson);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const firstEntity = parsed.value.entities[0];
    const firstAsset = parsed.value.assets[0];
    expect(firstEntity?.type).toBe("asset");
    expect(firstAsset).toBeDefined();
    if (firstEntity?.type !== "asset" || firstAsset === undefined) return;
    const invalidAsset = {
      ...firstAsset,
      id: "invalid-asset",
      name: "Invalid asset",
      sha256: "0".repeat(64),
    };
    const document = {
      ...parsed.value,
      assets: [...parsed.value.assets, invalidAsset],
      entities: [
        ...parsed.value.entities,
        { ...firstEntity, id: "invalid-entity", assetId: invalidAsset.id },
      ],
    };
    const dispose = vi.spyOn(BufferGeometry.prototype, "dispose");

    await expect(
      buildRuntimeGeneration(
        document,
        { resolve: () => Promise.resolve(new Blob([asset])) },
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ diagnostic: { code: "ASSET_HASH_MISMATCH" } });
    expect(dispose).toHaveBeenCalled();
    dispose.mockRestore();
  });

  it("rejects targets that overlap the same renderable object", async () => {
    const [sceneJson, asset] = await Promise.all([readFile(sceneUrl, "utf8"), readFile(assetUrl)]);
    const parsed = parseSceneDocument(sceneJson);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const firstTarget = parsed.value.targets[0];
    expect(firstTarget).toBeDefined();
    if (firstTarget === undefined) return;

    await expect(
      buildRuntimeGeneration(
        {
          ...parsed.value,
          targets: [
            {
              ...firstTarget,
              id: "factory-cell-root",
              name: "Factory cell root",
              nodeIndex: null,
            },
            ...parsed.value.targets,
          ],
        },
        { resolve: () => Promise.resolve(new Blob([asset])) },
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ diagnostic: { code: "DOCUMENT_REFERENCE_INVALID" } });
  });

  it("builds authored lights without asset loading and keeps them in entity mappings", async () => {
    const sceneJson = await readFile(sceneUrl, "utf8");
    const parsed = parseSceneDocument(sceneJson);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const point = pointLight("point-a");
    const spot = spotLight("spot-a");
    const resolve = vi.fn(() => Promise.reject(new Error("Assets must not load.")));

    const generation = await buildRuntimeGeneration(
      {
        ...parsed.value,
        assets: [],
        entities: [point, spot],
        targets: [],
        dataSources: [],
        bindings: [],
        ruleSets: [],
        annotations: [],
      },
      { resolve },
      new AbortController().signal,
      "edit",
    );

    expect(resolve).not.toHaveBeenCalled();
    const pointObject = generation.entities.get(point.id)?.object;
    const spotObject = generation.entities.get(spot.id)?.object;
    expect(pointObject?.children.some((object) => object instanceof PointLight)).toBe(true);
    expect(spotObject?.children.some((object) => object instanceof SpotLight)).toBe(true);
    const pointProxy = pointObject?.getObjectByName(`light-pick-proxy:${point.id}`);
    expect(pointProxy).toBeDefined();
    expect(generation.entityForObject(pointProxy!)).toBe(point.id);

    generation.authoredLights.setAuthoringMode("run");
    expect(pointObject?.getObjectByName(`light-pick-proxy:${point.id}`)).toBeUndefined();
    generation.authoredLights.setAuthoringMode("edit");
    expect(pointObject?.getObjectByName(`light-pick-proxy:${point.id}`)).toBeDefined();
    generation.dispose();
  });

  it("loads the deterministic 006B PBR shader-cost fixture with fixed scale and materials", async () => {
    const [sceneJson, asset] = await Promise.all([
      readFile(pbrSceneUrl, "utf8"),
      readFile(pbrAssetUrl),
    ]);
    const parsed = parseSceneDocument(sceneJson);
    expect(parsed.ok, parsed.ok ? "" : JSON.stringify(parsed.diagnostics)).toBe(true);
    if (!parsed.ok) return;

    const generation = await buildRuntimeGeneration(
      parsed.value,
      { resolve: () => Promise.resolve(new Blob([asset])) },
      new AbortController().signal,
    );
    const fixture = generation.entities.get("pbr-fixture-scene")?.object;
    expect(fixture).toBeDefined();
    if (fixture === undefined) return;
    const meshes: Mesh[] = [];
    fixture.traverse((object) => {
      if (object instanceof Mesh) meshes.push(object);
    });
    const materials = new Set(
      meshes.flatMap((mesh) => (Array.isArray(mesh.material) ? mesh.material : [mesh.material])),
    );
    const bounds = new Box3().setFromObject(fixture);

    expect(meshes).toHaveLength(10);
    expect(materials).toHaveLength(4);
    expect([...materials].every((material) => material instanceof MeshStandardMaterial)).toBe(true);
    expect([bounds.min.x, bounds.min.z]).toEqual([-4, -3]);
    expect(bounds.min.y).toBeCloseTo(-0.15, 12);
    expect([bounds.max.x, bounds.max.z]).toEqual([4, 3]);
    expect(bounds.max.y).toBeCloseTo(2.2, 12);
    generation.dispose();
  });
});

function materialColorHex(material: Material | undefined): string | undefined {
  if (material === undefined || !("color" in material) || !(material.color instanceof Color)) {
    return undefined;
  }
  return material.color.getHexString();
}

function pointLight(id: string): LightEntity {
  return {
    ...lightBase(id),
    light: { kind: "point", color: "#FFFFFF", intensity: 25, range: null },
  };
}

function spotLight(id: string): LightEntity {
  return {
    ...lightBase(id),
    light: {
      kind: "spot",
      color: "#FFFFFF",
      intensity: 10,
      range: null,
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
      position: [0, 2, 0],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
    },
    metadata: {},
  };
}
