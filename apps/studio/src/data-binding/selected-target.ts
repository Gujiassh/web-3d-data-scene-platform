import type { SceneDocument } from "@web3d/document";

import type { TargetResolution } from "./types";

export function resolveSelectedRootTarget(
  document: SceneDocument,
  selectedEntityId: string | null,
): TargetResolution {
  if (selectedEntityId === null) return { status: "no-selection" };
  const entity = document.entities.find((candidate) => candidate.id === selectedEntityId);
  if (entity?.type !== "asset") return { status: "unsupported-entity" };

  const targets = document.targets.filter((target) => target.entityId === selectedEntityId);
  const roots = targets.filter((target) => target.nodeIndex === null);
  if (roots.length === 1) return { status: "supported", target: roots[0]! };
  if (roots.length === 0) return { status: "no-root-target", targets };
  return { status: "ambiguous-root-target", targets: roots };
}
