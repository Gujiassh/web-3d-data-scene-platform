import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { BrandMark } from "./BrandMark";

const publicAsset = (name: string): URL => new URL(`../../public/${name}`, import.meta.url);

describe("BrandMark", () => {
  it("renders the fixed 24px optical geometry as a decorative mark by default", () => {
    const markup = renderToStaticMarkup(createElement(BrandMark, { className: "brand" }));

    expect(markup).toContain('class="brand"');
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain('height="24"');
    expect(markup).toContain('width="24"');
    expect(markup).toContain('viewBox="0 0 24 24"');
    expect(markup).toContain('d="M3 3H18V7H7V12H3Z"');
    expect(markup).toContain('d="M21 12V21H6V17H17V12Z"');
    expect(markup).toContain('d="M12 8L16 12L12 16L8 12Z"');
    expect(markup).not.toMatch(/gradient|url\(/i);
  });

  it("accepts an explicit size and accessible image label", () => {
    const markup = renderToStaticMarkup(
      createElement(BrandMark, {
        "aria-hidden": false,
        "aria-label": "SceneWeave",
        size: 32,
      }),
    );

    expect(markup).toContain('aria-hidden="false"');
    expect(markup).toContain('aria-label="SceneWeave"');
    expect(markup).toContain('role="img"');
    expect(markup).toContain('height="32"');
    expect(markup).toContain('width="32"');
  });
});

describe("brand assets", () => {
  it("keeps the favicon on the dedicated 16px optical geometry without gradients", () => {
    const svg = readFileSync(publicAsset("favicon.svg"), "utf8");

    expect(svg).toContain('viewBox="0 0 16 16"');
    expect(svg).toContain('d="M2 2H12V5H5V8H2Z"');
    expect(svg).toContain('d="M14 8V14H4V11H11V8Z"');
    expect(svg).toContain('d="M8 6L10 8L8 10L6 8Z"');
    expect(svg).toContain('fill="#111715"');
    expect(svg).toContain('fill="#F4F6F5"');
    expect(svg).toContain('fill="#4CC4BA"');
    expect(svg).not.toMatch(/gradient|url\(/i);
  });

  it("ships generated ICO and Apple touch assets at the required sizes", () => {
    const ico = readFileSync(publicAsset("favicon.ico"));
    const png = readFileSync(publicAsset("apple-touch-icon.png"));

    expect(ico.readUInt16LE(0)).toBe(0);
    expect(ico.readUInt16LE(2)).toBe(1);
    expect(ico.readUInt16LE(4)).toBe(3);
    expect(
      [0, 1, 2]
        .map((index) => ico[6 + index * 16] ?? 0)
        .map((size) => (size === 0 ? 256 : size))
        .sort((left, right) => left - right),
    ).toEqual([16, 32, 48]);
    expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(png.readUInt32BE(16)).toBe(180);
    expect(png.readUInt32BE(20)).toBe(180);
  });

  it("references the complete icon and theme metadata without a manifest", () => {
    const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");

    expect(html).toContain('<meta name="color-scheme" content="light dark" />');
    expect(html).toContain('<meta name="theme-color" content="#F4F6F5" />');
    expect(html.match(/name="theme-color"/g)).toHaveLength(1);
    expect(html).toContain('<meta name="application-name" content="SceneWeave" />');
    expect(html).toContain('<meta name="apple-mobile-web-app-title" content="SceneWeave" />');
    expect(html).toContain('name="description"');
    expect(html).toContain("open-source, self-hosted editor for data-driven Three.js scenes");
    expect(html).toContain('<link rel="icon" href="/favicon.svg" type="image/svg+xml" />');
    expect(html).toContain('<link rel="icon" href="/favicon.ico" sizes="any" />');
    expect(html).toContain('<link rel="apple-touch-icon" href="/apple-touch-icon.png" />');
    expect(html).not.toContain('rel="manifest"');
  });
});
