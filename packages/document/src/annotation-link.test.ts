import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  isValidAnnotationOpenLinkHref,
  validateSceneDocument,
  type Annotation,
  type SceneDocument,
} from "./index.js";

const fixtureUrl = new URL(
  "../../../specs/001-product-foundation/contracts/scene.example.json",
  import.meta.url,
);

describe("Annotation open-link contract", () => {
  it("accepts an absolute lower-case HTTPS URL without requiring canonical href equality", () => {
    const href = "https://example.com";

    expect(new URL(href).href).toBe("https://example.com/");
    expect(isValidAnnotationOpenLinkHref(href)).toBe(true);
    expect(validateSceneDocument(withOpenLink(href)).ok).toBe(true);
  });

  it.each([
    ["upper-case scheme", "HTTPS://example.com"],
    ["HTTP scheme", "http://example.com"],
    ["relative URL", "/details"],
    ["credentials", "https://user:password@example.com"],
    ["oversize URL", `https://example.com/${"a".repeat(2049)}`],
  ])("rejects %s", (_label, href) => {
    expect(isValidAnnotationOpenLinkHref(href)).toBe(false);
    expect(validateSceneDocument(withOpenLink(href)).ok).toBe(false);
  });
});

function withOpenLink(href: string): SceneDocument {
  const document = JSON.parse(readFileSync(fixtureUrl, "utf8")) as SceneDocument;
  const annotation: Annotation = {
    id: "annotation-link",
    title: "Documentation",
    visible: true,
    locked: false,
    anchor: {
      kind: "surface",
      entityId: "press-01",
      assetHash: "a".repeat(64),
      nodeIndex: 0,
      nodeLocalPosition: [0, 0, 0],
      nodeLocalNormal: [0, 1, 0],
    },
    content: { kind: "plain-text", text: "" },
    action: { type: "open-link", href },
  };
  return { ...document, annotations: [annotation] };
}
