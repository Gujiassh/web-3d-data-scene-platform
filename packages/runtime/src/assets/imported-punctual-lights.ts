import { DirectionalLight, Light, PointLight, SpotLight, type Object3D } from "three";

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

export function removeImportedPunctualLights(root: Object3D): ImportedPunctualLightSummary {
  const summary = inspectImportedPunctualLights(root);
  const importedLights: Light[] = [];
  root.traverse((object) => {
    if (object instanceof Light) importedLights.push(object);
  });
  importedLights.forEach((light) => light.removeFromParent());
  return summary;
}

export function describeImportedPunctualLights(summary: ImportedPunctualLightSummary): string {
  return `${summary.total} imported punctual ${plural(summary.total, "light")} (${summary.directional} directional, ${summary.point} point, ${summary.spot} spot)`;
}

function plural(count: number, word: string): string {
  return count === 1 ? word : `${word}s`;
}
