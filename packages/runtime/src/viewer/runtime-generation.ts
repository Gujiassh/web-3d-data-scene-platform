import type { SceneDocument, SceneEntity } from "@web3d/document";
import { Group, Mesh, type Material, type Object3D } from "three";

import { loadGltfAsset } from "../assets/asset-loader";
import { disposeObject3D, isolateTargetMaterials } from "../assets/dispose-object";
import { diagnostic, diagnosticError } from "../diagnostics";
import type { AssetResolver } from "../types";

export interface RuntimeTarget {
  readonly object: Object3D;
  readonly materials: readonly Material[];
}

export interface RuntimeGeneration {
  readonly root: Group;
  readonly targets: ReadonlyMap<string, RuntimeTarget>;
  targetForObject(object: Object3D): string | undefined;
  dispose(): void;
}

export async function buildRuntimeGeneration(
  document: SceneDocument,
  resolver: AssetResolver,
  signal: AbortSignal,
): Promise<RuntimeGeneration> {
  const root = new Group();
  root.name = `document:${document.id}`;
  const entityObjects = new Map<string, Object3D>();
  const assetNodes = new Map<string, ReadonlyMap<number, Object3D>>();
  const originalMaterials = new Set<Material>();
  let disposed = false;

  try {
    for (const entity of document.entities) {
      signal.throwIfAborted();
      if (entity.type === "group") {
        const group = new Group();
        applyEntity(group, entity);
        entityObjects.set(entity.id, group);
        continue;
      }

      const asset = document.assets.find((candidate) => candidate.id === entity.assetId);
      if (asset === undefined) {
        throw diagnosticError(
          diagnostic(
            "DOCUMENT_REFERENCE_INVALID",
            "document",
            "error",
            `Entity ${entity.id} references missing asset ${entity.assetId}.`,
            { entityId: entity.id, assetId: entity.assetId },
          ),
        );
      }
      const loaded = await loadGltfAsset(asset, resolver, signal);
      collectMaterials(loaded.root, originalMaterials);
      applyEntity(loaded.root, entity);
      entityObjects.set(entity.id, loaded.root);
      assetNodes.set(entity.id, loaded.nodesByIndex);
    }

    for (const entity of document.entities) {
      const object = entityObjects.get(entity.id);
      if (object === undefined) continue;
      const parent = entity.parentId === null ? root : entityObjects.get(entity.parentId);
      if (parent === undefined) {
        throw diagnosticError(
          diagnostic(
            "DOCUMENT_REFERENCE_INVALID",
            "document",
            "error",
            `Entity ${entity.id} references missing parent ${entity.parentId}.`,
            { entityId: entity.id },
          ),
        );
      }
      parent.add(object);
    }

    const targetObjects = new Map<string, RuntimeTarget>();
    const objectTargets = new WeakMap<Object3D, string>();
    const meshOwners = new Map<Mesh, string>();
    const orderedTargets = [...document.targets].sort((left, right) => {
      if (left.nodeIndex === null && right.nodeIndex !== null) return -1;
      if (left.nodeIndex !== null && right.nodeIndex === null) return 1;
      return left.id.localeCompare(right.id, "en");
    });

    for (const target of orderedTargets) {
      const entityObject = entityObjects.get(target.entityId);
      const targetObject =
        target.nodeIndex === null
          ? entityObject
          : assetNodes.get(target.entityId)?.get(target.nodeIndex);
      if (targetObject === undefined) {
        throw diagnosticError(
          diagnostic(
            "ASSET_NODE_MISSING",
            "asset",
            "error",
            `Target ${target.id} cannot resolve glTF node ${String(target.nodeIndex)}.`,
            {
              entityId: target.entityId,
              targetId: target.id,
              ...(target.nodeIndex === null ? {} : { nodeIndex: target.nodeIndex }),
            },
          ),
        );
      }

      targetObject.traverse((object) => {
        if (!(object instanceof Mesh)) return;
        const owner = meshOwners.get(object);
        if (owner !== undefined) {
          throw diagnosticError(
            diagnostic(
              "DOCUMENT_REFERENCE_INVALID",
              "document",
              "error",
              `Targets ${owner} and ${target.id} overlap the same renderable object.`,
              { targetId: target.id, entityId: target.entityId },
            ),
          );
        }
        meshOwners.set(object, target.id);
      });

      const runtimeTarget = {
        object: targetObject,
        materials: isolateTargetMaterials(targetObject),
      };
      targetObjects.set(target.id, runtimeTarget);
      targetObject.traverse((object) => objectTargets.set(object, target.id));
    }

    const attachedMaterials = new Set<Material>();
    collectMaterials(root, attachedMaterials);
    const detachedMaterials = [...originalMaterials].filter(
      (material) => !attachedMaterials.has(material),
    );

    return {
      root,
      targets: targetObjects,
      targetForObject(object) {
        let current: Object3D | null = object;
        while (current !== null) {
          const targetId = objectTargets.get(current);
          if (targetId !== undefined) return targetId;
          current = current.parent;
        }
        return undefined;
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        disposeObject3D(root);
        detachedMaterials.forEach((material) => material.dispose());
      },
    };
  } catch (error) {
    const attachedMaterials = new Set<Material>();
    const disposableRoots = [
      root,
      ...new Set([...entityObjects.values()].filter((object) => object.parent === null)),
    ];
    disposableRoots.forEach((object) => collectMaterials(object, attachedMaterials));
    disposableRoots.forEach((object) => disposeObject3D(object));
    originalMaterials.forEach((material) => {
      if (!attachedMaterials.has(material)) material.dispose();
    });
    throw error;
  }
}

function collectMaterials(root: Object3D, output: Set<Material>): void {
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => output.add(material));
  });
}

function applyEntity(object: Object3D, entity: SceneEntity): void {
  object.name = entity.id;
  object.position.fromArray(entity.transform.position);
  object.quaternion.fromArray(entity.transform.rotation);
  object.scale.fromArray(entity.transform.scale);
  object.visible = entity.visible;
  object.updateMatrix();
  object.updateMatrixWorld(true);
}
