import { DirectionalLight, Light, Object3D, PointLight, SpotLight } from "three";
import type { GLTF } from "three/addons/loaders/GLTFLoader.js";

export interface ImportedPunctualLightSummary {
  readonly total: number;
  readonly directional: number;
  readonly point: number;
  readonly spot: number;
}

export function inspectImportedPunctualLights(root: Object3D): ImportedPunctualLightSummary {
  let directional = 0;
  let point = 0;
  let spot = 0;

  root.traverse((object) => {
    if (object instanceof DirectionalLight) directional += 1;
    else if (object instanceof PointLight) point += 1;
    else if (object instanceof SpotLight) spot += 1;
  });

  return Object.freeze({
    total: directional + point + spot,
    directional,
    point,
    spot,
  });
}

export function replaceImportedPunctualLights(gltf: GLTF): ImportedPunctualLightSummary {
  const summary = inspectImportedPunctualLights(gltf.scene);
  const importedLights: Light[] = [];
  gltf.scene.traverse((object) => {
    if (object instanceof Light) importedLights.push(object);
  });
  importedLights.forEach((light) => replaceLight(light, gltf.parser.associations));
  gltf.scene.updateMatrixWorld(true);
  return summary;
}

export function describeImportedPunctualLights(summary: ImportedPunctualLightSummary): string {
  return `${summary.total} imported punctual ${plural(summary.total, "light")} (${summary.directional} directional, ${summary.point} point, ${summary.spot} spot)`;
}

function plural(count: number, word: string): string {
  return count === 1 ? word : `${word}s`;
}

function replaceLight(light: Light, associations: GLTF["parser"]["associations"]): void {
  const parent = light.parent;
  if (parent === null) throw new Error("Imported punctual light must belong to the glTF scene.");
  const parentIndex = parent.children.indexOf(light);
  const replacement = new Object3D().copy(light, false);
  [...light.children].forEach((child) => replacement.add(child));
  const target =
    light instanceof DirectionalLight || light instanceof SpotLight ? light.target : null;
  if (target !== null && target.parent !== replacement) replacement.add(target);

  const association = associations.get(light);
  associations.delete(light);
  if (association !== undefined) associations.set(replacement, association);

  parent.remove(light);
  parent.add(replacement);
  const appendedIndex = parent.children.indexOf(replacement);
  parent.children.splice(appendedIndex, 1);
  parent.children.splice(parentIndex, 0, replacement);
}
