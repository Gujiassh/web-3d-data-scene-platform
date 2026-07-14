import { readFile } from "node:fs/promises";

import { parseSceneDocument } from "@web3d/document";
import { BufferGeometry } from "three";
import { describe, expect, it, vi } from "vitest";

import { applyRuleEffects } from "./effect-projector";
import { buildRuntimeGeneration } from "./runtime-generation";

const sceneUrl = new URL("../../../../assets/factory/public/m0-scene.json", import.meta.url);
const assetUrl = new URL("../../../../assets/factory/public/m0-factory-cell.glb", import.meta.url);

describe("buildRuntimeGeneration", () => {
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
      expect(generation.targetForObject(press.object)).toBe("press-01");
      expect(generation.targetForObject(conveyor.object)).toBe("conveyor-01");
    }

    const dispose = vi.fn();
    press?.materials[0]?.addEventListener("dispose", dispose);
    generation.dispose();
    expect(dispose).toHaveBeenCalledOnce();
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
});
