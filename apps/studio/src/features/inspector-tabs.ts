export type InspectorTab = "object" | "data";

export function inspectorTabForKey(current: InspectorTab, key: string): InspectorTab | null {
  if (key === "Home") return "object";
  if (key === "End") return "data";
  if (key === "ArrowLeft" || key === "ArrowRight") {
    return current === "object" ? "data" : "object";
  }
  return null;
}
