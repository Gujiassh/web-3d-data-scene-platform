import type {
  SceneEnvironment,
  SceneLighting,
  SetSceneEnvironmentCommand,
  Vec3,
} from "@web3d/document";
import type { Theme } from "@web3d/demo-support/theme";

export type SceneSettingsTab = "appearance" | "lighting";
export type LightingPresetId = "standard" | "soft" | "contrast";
export type DerivedLightingPresetId = LightingPresetId | "custom";
export type LightingDirectionId = "standard" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";
export type DerivedLightingDirectionId = LightingDirectionId | "custom";
export type SceneLightingDraft = SceneLighting;
export type SceneSettingsDraft = Pick<
  SceneEnvironment,
  "backgroundMode" | "background" | "grid" | "lighting"
>;

export interface LightingDirectionOption {
  readonly id: LightingDirectionId;
  readonly vector: Vec3;
}

export const LIGHTING_PRESET_IDS = ["standard", "soft", "contrast"] as const;
export const LIGHTING_DIRECTION_IDS = [
  "standard",
  "n",
  "ne",
  "e",
  "se",
  "s",
  "sw",
  "w",
  "nw",
] as const;

const STANDARD_DIRECTION = normalize([5, 10, 7]);

export const LIGHTING_DIRECTIONS: readonly LightingDirectionOption[] = [
  { id: "standard", vector: STANDARD_DIRECTION },
  ...LIGHTING_DIRECTION_IDS.slice(1).map((id, index) => ({
    id,
    vector: compassDirection(index * 45),
  })),
];

export const LIGHTING_PRESETS: Readonly<Record<LightingPresetId, SceneLightingDraft>> = {
  standard: lighting("#FFFFFF", "#65706A", 1.8, "#FFFFFF", 2.2),
  soft: lighting("#FFFFFF", "#84918B", 2, "#FFF4E5", 1.2),
  contrast: lighting("#DDE7E3", "#3D4743", 0.9, "#FFF1D6", 3),
};

const THEME_BACKGROUNDS: Readonly<Record<Theme, string>> = {
  light: "#F4F6F5",
  dark: "#111715",
};

export function themeBackgroundFor(theme: Theme): string {
  return THEME_BACKGROUNDS[theme];
}

export function sceneSettingsStateKey(projectId: string, documentId: string): string {
  return `${projectId}\u0000${documentId}`;
}

export function lightingForPreset(preset: LightingPresetId): SceneLightingDraft {
  return cloneLighting(LIGHTING_PRESETS[preset]);
}

export function deriveLightingPreset(lightingValue: SceneLightingDraft): DerivedLightingPresetId {
  for (const preset of LIGHTING_PRESET_IDS) {
    if (lightingEqual(lightingValue, LIGHTING_PRESETS[preset])) return preset;
  }
  return "custom";
}

export function directionFor(id: LightingDirectionId): Vec3 {
  const option = LIGHTING_DIRECTIONS.find((candidate) => candidate.id === id);
  if (option === undefined) throw new TypeError(`Unknown lighting direction '${id}'.`);
  return [...option.vector];
}

export function deriveLightingDirection(direction: Vec3): DerivedLightingDirectionId {
  return (
    LIGHTING_DIRECTIONS.find((candidate) => vectorsEqual(candidate.vector, direction))?.id ??
    "custom"
  );
}

export function sceneSettingsDraft(environment: SceneEnvironment): SceneSettingsDraft {
  return {
    backgroundMode: environment.backgroundMode,
    background: environment.background,
    grid: environment.grid,
    lighting: cloneLighting(environment.lighting),
  };
}

export function createSetSceneEnvironmentCommand(
  before: SceneEnvironment,
  after: SceneSettingsDraft,
): SetSceneEnvironmentCommand {
  return {
    type: "set-scene-environment",
    before,
    after: { ...before, ...after },
  };
}

export function themeBackgroundForSettings(
  settings: Pick<SceneSettingsDraft, "backgroundMode" | "background">,
  themeBackground: string,
): string {
  return settings.backgroundMode === "theme" ? themeBackground : settings.background;
}

function lighting(
  skyColor: string,
  groundColor: string,
  fillIntensity: number,
  keyColor: string,
  keyIntensity: number,
): SceneLightingDraft {
  return {
    fill: { skyColor, groundColor, intensity: fillIntensity },
    key: { color: keyColor, intensity: keyIntensity, directionToLight: [...STANDARD_DIRECTION] },
  };
}

function cloneLighting(value: SceneLightingDraft): SceneLightingDraft {
  return {
    fill: { ...value.fill },
    key: { ...value.key, directionToLight: [...value.key.directionToLight] },
  };
}

function lightingEqual(left: SceneLightingDraft, right: SceneLightingDraft): boolean {
  return (
    left.fill.skyColor === right.fill.skyColor &&
    left.fill.groundColor === right.fill.groundColor &&
    left.fill.intensity === right.fill.intensity &&
    left.key.color === right.key.color &&
    left.key.intensity === right.key.intensity &&
    vectorsEqual(left.key.directionToLight, right.key.directionToLight)
  );
}

function vectorsEqual(left: Vec3, right: Vec3): boolean {
  return left.every((value, index) => value === right[index]);
}

function compassDirection(azimuthDegrees: number): Vec3 {
  const azimuth = (azimuthDegrees * Math.PI) / 180;
  const elevation = Math.PI / 4;
  return [
    Math.sin(azimuth) * Math.cos(elevation),
    Math.sin(elevation),
    -Math.cos(azimuth) * Math.cos(elevation),
  ];
}

function normalize(value: Vec3): Vec3 {
  const length = Math.hypot(...value);
  return value.map((component) => component / length) as [number, number, number];
}
