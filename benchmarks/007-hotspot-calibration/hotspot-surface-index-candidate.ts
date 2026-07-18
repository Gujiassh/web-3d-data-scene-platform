import type { Matrix4, Vector3 } from "three";

export interface CalibrationSurfaceAnchor {
  readonly id: string;
  readonly entityId: string;
  readonly assetHash: string;
  readonly nodeIndex: number;
  readonly nodeLocalPosition: Vector3;
  readonly nodeLocalNormal: Vector3;
}

export interface CalibrationSurfaceEntity {
  readonly entityId: string;
  readonly assetHash: string;
  readonly nodes: ReadonlyMap<number, Matrix4>;
}

interface IndexedSurfaceEntity {
  readonly assetHash: string;
  readonly nodes: ReadonlyMap<number, Matrix4>;
}

export class HotspotSurfaceIndexCandidate {
  readonly #entities = new Map<string, IndexedSurfaceEntity>();

  constructor(entities: readonly CalibrationSurfaceEntity[]) {
    entities.forEach((entity) => {
      if (this.#entities.has(entity.entityId)) {
        throw new Error(`Duplicate calibration entity ${entity.entityId}.`);
      }
      this.#entities.set(entity.entityId, {
        assetHash: entity.assetHash,
        nodes: new Map(entity.nodes),
      });
    });
  }

  resolve(anchor: CalibrationSurfaceAnchor, worldPosition: Vector3, worldNormal: Vector3): boolean {
    const entity = this.#entities.get(anchor.entityId);
    if (entity === undefined || entity.assetHash !== anchor.assetHash) return false;
    const matrixWorld = entity.nodes.get(anchor.nodeIndex);
    if (matrixWorld === undefined) return false;
    worldPosition.copy(anchor.nodeLocalPosition).applyMatrix4(matrixWorld);
    worldNormal.copy(anchor.nodeLocalNormal).transformDirection(matrixWorld);
    return true;
  }
}
