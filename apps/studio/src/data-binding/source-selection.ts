import type { SceneDocument } from "@web3d/document";

export function effectiveMockSourceId(
  sources: SceneDocument["dataSources"],
  requestedSourceId: string,
): string {
  const mockSources = sources.filter((source) => source.adapter === "mock");
  return (
    mockSources.find((source) => source.id === requestedSourceId)?.id ?? mockSources[0]?.id ?? ""
  );
}
