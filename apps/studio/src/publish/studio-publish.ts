import type { SceneDocument } from "@web3d/document";
import {
  createPublishBundle,
  inspectPublishReadiness,
  type PublishAssetBytesResolver,
  type PublishBlocker,
  type PublishSurfaceEvidence,
} from "@web3d/publish";

export type StudioPublishBuildResult =
  | { readonly status: "blocked"; readonly blockers: readonly PublishBlocker[] }
  | { readonly status: "ready"; readonly bytes: Uint8Array };

export async function buildStudioPublish(options: {
  readonly document: SceneDocument;
  readonly surfaceEvidence: readonly PublishSurfaceEvidence[];
  readonly resolveAssetBytes: PublishAssetBytesResolver;
  readonly signal: AbortSignal;
}): Promise<StudioPublishBuildResult> {
  const readiness = await inspectPublishReadiness(options);
  if (!readiness.ok) return { status: "blocked", blockers: readiness.blockers };
  const bundle = await createPublishBundle(readiness.value);
  options.signal.throwIfAborted();
  return { status: "ready", bytes: bundle.zipBytes };
}
