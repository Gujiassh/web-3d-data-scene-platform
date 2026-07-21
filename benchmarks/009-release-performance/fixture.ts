import { parseSceneDocument, type SceneDocument } from "../../packages/document/src/index";
import type { JsonValue } from "../../packages/runtime/src/index";

import { createInitialValue } from "./fixture-contract";

interface FixtureManifest {
  readonly schemaVersion: "1.0.0";
  readonly scene: {
    readonly path: string;
    readonly sha256: string;
    readonly byteLength: number;
  };
  readonly asset: {
    readonly path: string;
    readonly sha256: string;
    readonly byteLength: number;
    readonly uniqueTriangles: number;
    readonly meshPrimitives: number;
  };
}

export interface ReleasePerformanceFixture {
  readonly document: SceneDocument;
  readonly documentSha256: string;
  readonly assetBytes: Uint8Array<ArrayBuffer>;
  readonly assetSha256: string;
  readonly initialValue: JsonValue;
  readonly manifest: FixtureManifest;
}

export async function loadReleasePerformanceFixture(): Promise<ReleasePerformanceFixture> {
  const manifest = await fetchJson<FixtureManifest>("./generated/fixture.manifest.json");
  if (manifest.schemaVersion !== "1.0.0") throw new Error("Fixture manifest version mismatch.");
  const [sceneBytes, assetBytes] = await Promise.all([
    fetchBytes(`./generated/${manifest.scene.path}`),
    fetchBytes(`./generated/${manifest.asset.path}`),
  ]);
  assertFile(sceneBytes, manifest.scene, "scene");
  assertFile(assetBytes, manifest.asset, "asset");
  const parsed = parseSceneDocument(new TextDecoder().decode(sceneBytes));
  if (!parsed.ok)
    throw new Error(`Generated fixture is invalid: ${parsed.diagnostics[0]?.message}`);
  return {
    document: parsed.value,
    documentSha256: manifest.scene.sha256,
    assetBytes,
    assetSha256: manifest.asset.sha256,
    initialValue: createInitialValue(),
    manifest,
  };
}

async function assertFile(
  bytes: Uint8Array<ArrayBuffer>,
  expected: { readonly sha256: string; readonly byteLength: number },
  label: string,
): Promise<void> {
  if (bytes.byteLength !== expected.byteLength)
    throw new Error(`Fixture ${label} byte length mismatch.`);
  if ((await sha256(bytes)) !== expected.sha256) throw new Error(`Fixture ${label} hash mismatch.`);
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Fixture request failed: ${response.status} ${url}.`);
  return response.json() as Promise<T>;
}

async function fetchBytes(url: string): Promise<Uint8Array<ArrayBuffer>> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Fixture request failed: ${response.status} ${url}.`);
  return new Uint8Array(await response.arrayBuffer());
}

async function sha256(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}
