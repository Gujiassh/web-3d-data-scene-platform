export function migrateSceneDocument1_0(value: unknown): unknown {
  const document = requireRecord(value, "Legacy SceneDocument");
  const environment = requireRecord(document["environment"], "Legacy scene environment");
  return {
    ...document,
    schemaVersion: "1.1.0",
    environment: {
      ...environment,
      backgroundMode: "custom",
    },
  };
}

function requireRecord(value: unknown, label: string): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object.`);
  }
  return value as Readonly<Record<string, unknown>>;
}
