import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  assertAssetRecord,
  assertInventoryCoverage,
  assertRepositoryBudgets,
  auditRepositoryAssets,
} from "./asset-audit.mjs";

const root = path.resolve(import.meta.dirname, "../..");

describe("release asset audit", () => {
  it("validates the complete tracked inventory with the Khronos validator", async () => {
    const report = await auditRepositoryAssets(root);
    expect(report.totals).toEqual({
      trackedFiles: 3,
      uniqueHashes: 2,
      trackedBytes: 5_632,
      uniqueBytes: 4_416,
    });
    expect(report.assets.every((asset) => asset.validatorErrors === 0)).toBe(true);
  });

  it("fails closed for unlisted models, changed bytes, licenses and budgets", () => {
    expect(() => assertInventoryCoverage(["a.glb"], ["a.glb", "new.glb"])).toThrow(
      /inventory mismatch/u,
    );
    const bytes = Buffer.from("asset");
    const license = Buffer.from("license");
    const record = {
      path: "a.glb",
      byteLength: bytes.byteLength,
      maxByteLength: bytes.byteLength,
      sha256: "d59386e0ae435e292fbe0ebcdb954b75ed5fb3922091277cb19f798fc5d50718",
      licenseId: "CC0-1.0",
      licenseSha256: "cc1d3b0234846714b0aeda6cc34b057b4305bb83dd447fb88f816efeb59a4e96",
    };
    expect(() => assertAssetRecord(record, Buffer.from("changed"), license)).toThrow(
      /byteLength changed/u,
    );
    expect(() => assertAssetRecord(record, bytes, Buffer.from("changed"))).toThrow(
      /license bytes changed/u,
    );
    expect(() =>
      assertRepositoryBudgets({ repositoryMaxTrackedBytes: 4, repositoryMaxUniqueBytes: 4 }, [
        { sha256: record.sha256, byteLength: 5 },
      ]),
    ).toThrow(/Tracked model bytes/u);
  });
});
