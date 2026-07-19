import { unzipSync } from "fflate";
import { describe, expect, it, vi } from "vitest";

import { serializeSceneDocument } from "@web3d/document";

import { createPublishBundle } from "./bundle.js";
import { loadPublishedScene, PublishLoadError } from "./loader.js";
import { inspectPublishReadiness } from "./readiness.js";
import { publishFixture } from "./test-fixture.js";

describe("publish bundle and static loader", () => {
  it("produces byte-identical files and ZIP for identical input", async () => {
    const fixture = await publishFixture();
    const first = await readyBundle(fixture);
    const second = await readyBundle(fixture);

    expect([...first.files.keys()]).toEqual([...second.files.keys()]);
    for (const path of first.files.keys()) {
      expect(first.files.get(path)).toEqual(second.files.get(path));
    }
    expect(first.zipBytes).toEqual(second.zipBytes);
    expect(Object.keys(unzipSync(first.zipBytes)).sort()).toEqual([...first.files.keys()].sort());
  });

  it("rejects a forged ready snapshot", async () => {
    const fixture = await publishFixture();
    await expect(
      createPublishBundle({
        document: fixture.document,
        assets: [],
        requirements: { dataSources: [], trustedContentKeys: [] },
      }),
    ).rejects.toThrow("inspectPublishReadiness");
  });

  it("does not serialize runtime, credential, selection, alarm or host content values", async () => {
    const fixture = await publishFixture();
    const bundle = await readyBundle(fixture);
    const publishedJson = [...bundle.files]
      .filter(([path]) => path.endsWith(".json"))
      .map(([, bytes]) => new TextDecoder().decode(bytes))
      .join("\n");

    for (const forbidden of [
      "credential",
      "password",
      "selectedTargetId",
      "selectedEntityId",
      "alarms",
      "connectionState",
      "currentPayload",
      "Inspection details from host",
    ]) {
      expect(publishedJson).not.toContain(forbidden);
    }
  });

  it("loads canonical scene metadata and returns a verified AssetResolver", async () => {
    const fixture = await publishFixture();
    const bundle = await readyBundle(fixture);
    const fetchMock = fetchFromFiles(bundle.files);

    const loaded = await loadPublishedScene({
      baseUrl: "https://example.test/published/",
      fetch: fetchMock,
    });
    const asset = loaded.document.assets[0]!;
    const resolved = await loaded.assetResolver.resolve(asset, new AbortController().signal);

    expect(serializeSceneDocument(loaded.document)).toBe(serializeSceneDocument(fixture.document));
    expect(resolved).toBeInstanceOf(Blob);
    expect(new Uint8Array(await (resolved as Blob).arrayBuffer())).toEqual(fixture.assetBytes);
    expect(fetchMock).toHaveBeenCalledWith(
      new URL("https://example.test/published/publish-manifest.json"),
      expect.objectContaining({ credentials: "omit" }),
    );
  });

  it("rejects a scene payload tampered after manifest creation", async () => {
    const fixture = await publishFixture();
    const bundle = await readyBundle(fixture);
    const files = new Map(bundle.files);
    files.set("scene.json", new TextEncoder().encode("{}\n"));

    await expect(
      loadPublishedScene({
        baseUrl: "https://example.test/published/",
        fetch: fetchFromFiles(files),
      }),
    ).rejects.toMatchObject({ code: "PUBLISH_FILE_LENGTH_MISMATCH", path: "scene.json" });
  });

  it("rejects credential-bearing base URLs", async () => {
    await expect(
      loadPublishedScene({
        baseUrl: "https://user:secret@example.test/published/",
        fetch: vi.fn(),
      }),
    ).rejects.toMatchObject({ code: "PUBLISH_BASE_URL_INVALID" });
  });

  it("honors loader cancellation before fetch", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn();
    controller.abort();
    await expect(
      loadPublishedScene({
        baseUrl: "https://example.test/published/",
        fetch: fetchMock,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports undeclared assets before fetching them", async () => {
    const fixture = await publishFixture();
    const bundle = await readyBundle(fixture);
    const fetchMock = fetchFromFiles(bundle.files);
    const loaded = await loadPublishedScene({
      baseUrl: "https://example.test/published/",
      fetch: fetchMock,
    });

    await expect(
      loaded.assetResolver.resolve(
        { ...loaded.document.assets[0]!, sha256: "f".repeat(64) },
        new AbortController().signal,
      ),
    ).rejects.toBeInstanceOf(PublishLoadError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

async function readyBundle(fixture: Awaited<ReturnType<typeof publishFixture>>) {
  const readiness = await inspectPublishReadiness({
    document: fixture.document,
    surfaceEvidence: fixture.evidence,
    resolveAssetBytes: () => fixture.assetBytes,
  });
  if (!readiness.ok) throw new Error(readiness.blockers[0]?.message ?? "Fixture is not ready.");
  return createPublishBundle(readiness.value);
}

function fetchFromFiles(files: ReadonlyMap<string, Uint8Array>) {
  return vi.fn(async (input: string | URL | Request) => {
    const url = input instanceof Request ? new URL(input.url) : new URL(input.toString());
    const path = url.pathname.split("/").filter(Boolean).at(-1);
    const relative = url.pathname.includes("/assets/") ? `assets/${path ?? ""}` : (path ?? "");
    const bytes = files.get(relative);
    if (bytes === undefined) return new Response(null, { status: 404 });
    const body = new Uint8Array(bytes.byteLength);
    body.set(bytes);
    return new Response(body.buffer, {
      status: 200,
      headers: { "content-length": String(bytes.byteLength) },
    });
  });
}
