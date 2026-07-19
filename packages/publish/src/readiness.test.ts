import { describe, expect, it, vi } from "vitest";

import { inspectPublishReadiness } from "./readiness.js";
import { publishFixture } from "./test-fixture.js";

type FixtureEvidence = Awaited<ReturnType<typeof publishFixture>>["evidence"];

describe("publish readiness", () => {
  it("accepts one exact document/evidence/assets snapshot and sorts host requirements", async () => {
    const fixture = await publishFixture();
    const resolveAssetBytes = vi.fn(() => fixture.assetBytes);

    const result = await inspectPublishReadiness({
      document: fixture.document,
      surfaceEvidence: fixture.evidence,
      resolveAssetBytes,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.assets).toHaveLength(1);
    expect(result.value.requirements).toEqual({
      dataSources: [
        { sourceId: "source-a", adapter: "mock" },
        { sourceId: "source-z", adapter: "websocket" },
      ],
      trustedContentKeys: ["inspection-card"],
    });
    expect(resolveAssetBytes).toHaveBeenCalledOnce();
  });

  it("blocks Legacy hotspots without requesting asset bytes", async () => {
    const fixture = await publishFixture({ anchor: "legacy" });
    const resolveAssetBytes = vi.fn(() => fixture.assetBytes);

    const result = await inspectPublishReadiness({
      document: fixture.document,
      surfaceEvidence: [],
      resolveAssetBytes,
    });

    expect(result).toMatchObject({
      ok: false,
      blockers: [{ code: "PUBLISH_LEGACY_HOTSPOT", annotationId: "annotation-1" }],
    });
    expect(resolveAssetBytes).not.toHaveBeenCalled();
  });

  it.each([
    ["missing", [], "PUBLISH_SURFACE_EVIDENCE_MISSING"],
    [
      "stale",
      [
        {
          annotationId: "annotation-1",
          documentId: "publish-scene",
          documentRevision: 6,
          resolution: "resolved" as const,
        },
      ],
      "PUBLISH_SURFACE_EVIDENCE_STALE",
    ],
    [
      "unresolved",
      [
        {
          annotationId: "annotation-1",
          documentId: "publish-scene",
          documentRevision: 7,
          resolution: "unresolved" as const,
        },
      ],
      "PUBLISH_SURFACE_UNRESOLVED",
    ],
  ])("blocks %s Surface evidence", async (_label, evidence, code) => {
    const fixture = await publishFixture();
    const result = await inspectPublishReadiness({
      document: fixture.document,
      surfaceEvidence: evidence,
      resolveAssetBytes: () => fixture.assetBytes,
    });

    expect(result).toMatchObject({ ok: false, blockers: [{ code, annotationId: "annotation-1" }] });
  });

  it.each([
    [
      "duplicate",
      (evidence: FixtureEvidence) => [evidence[0]!, evidence[0]!],
      "PUBLISH_SURFACE_EVIDENCE_DUPLICATE",
      "annotation-1",
    ],
    [
      "unknown",
      (evidence: FixtureEvidence) => [
        ...evidence,
        { ...evidence[0]!, annotationId: "annotation-missing" },
      ],
      "PUBLISH_SURFACE_EVIDENCE_UNKNOWN",
      "annotation-missing",
    ],
  ])("blocks %s Surface evidence entries", async (_label, mutate, code, annotationId) => {
    const fixture = await publishFixture();
    const result = await inspectPublishReadiness({
      document: fixture.document,
      surfaceEvidence: mutate(fixture.evidence),
      resolveAssetBytes: () => fixture.assetBytes,
    });

    expect(result).toMatchObject({ ok: false, blockers: [{ code, annotationId }] });
  });

  it.each([
    ["missing", () => Promise.reject(new Error("not found")), "PUBLISH_ASSET_MISSING"],
    ["length", () => new Uint8Array([1]), "PUBLISH_ASSET_LENGTH_MISMATCH"],
    ["hash", () => new Uint8Array([6, 5, 4, 3, 2, 1]), "PUBLISH_ASSET_HASH_MISMATCH"],
  ])("blocks %s asset bytes", async (_label, resolveAssetBytes, code) => {
    const fixture = await publishFixture();
    const result = await inspectPublishReadiness({
      document: fixture.document,
      surfaceEvidence: fixture.evidence,
      resolveAssetBytes,
    });

    expect(result).toMatchObject({ ok: false, blockers: [{ code, assetId: "asset-1" }] });
  });

  it("honors cancellation before asset resolution", async () => {
    const fixture = await publishFixture();
    const controller = new AbortController();
    controller.abort();

    await expect(
      inspectPublishReadiness({
        document: fixture.document,
        surfaceEvidence: fixture.evidence,
        resolveAssetBytes: () => fixture.assetBytes,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});
