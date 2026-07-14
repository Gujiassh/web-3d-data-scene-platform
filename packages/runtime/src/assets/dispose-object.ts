import { Mesh, SkinnedMesh, Texture, type Material, type Object3D } from "three";

export function disposeObject3D(root: Object3D): void {
  const geometries = new Set<NonNullable<Mesh["geometry"]>>();
  const materials = new Set<Material>();
  const textures = new Set<Texture>();
  const skeletons = new Set<SkinnedMesh["skeleton"]>();

  root.traverse((object) => {
    if (object instanceof Mesh) {
      geometries.add(object.geometry);
      const values = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of values) {
        materials.add(material);
        collectTextures(material, textures, new Set());
      }
    }
    if (object instanceof SkinnedMesh) skeletons.add(object.skeleton);
  });

  for (const skeleton of skeletons) skeleton.dispose();
  for (const texture of textures) {
    const image: unknown = texture.source.data;
    if (typeof ImageBitmap !== "undefined" && image instanceof ImageBitmap) image.close();
    texture.dispose();
  }
  for (const material of materials) material.dispose();
  for (const geometry of geometries) geometry.dispose();
  root.removeFromParent();
  root.clear();
}

function collectTextures(value: unknown, textures: Set<Texture>, seen: Set<object>): void {
  if (value instanceof Texture) {
    textures.add(value);
    return;
  }
  if (value === null || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  for (const child of Object.values(value)) collectTextures(child, textures, seen);
}

export function isolateTargetMaterials(root: Object3D): readonly Material[] {
  const materials: Material[] = [];
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    if (Array.isArray(object.material)) {
      object.material = object.material.map((material) => {
        const clone = material.clone();
        materials.push(clone);
        return clone;
      });
    } else {
      const clone = object.material.clone();
      object.material = clone;
      materials.push(clone);
    }
  });
  return materials;
}
