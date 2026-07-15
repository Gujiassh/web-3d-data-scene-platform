import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ThemeSwitch } from "./ThemeSwitch";

describe("ThemeSwitch", () => {
  it("exposes the destination dark theme label from light mode", () => {
    const html = renderToStaticMarkup(
      createElement(ThemeSwitch, {
        theme: "light",
        lightLabel: "Use light theme",
        darkLabel: "Use dark theme",
        onToggle: () => undefined,
      }),
    );

    expect(html).toContain("<button");
    expect(html).toContain('aria-label="Use dark theme"');
    expect(html).toContain('title="Use dark theme"');
    expect(html).toContain('data-theme-target="dark"');
    expect(html).toContain('aria-hidden="true"');
  });

  it("exposes the destination light theme label from dark mode", () => {
    const html = renderToStaticMarkup(
      createElement(ThemeSwitch, {
        theme: "dark",
        lightLabel: "使用浅色主题",
        darkLabel: "使用深色主题",
        onToggle: () => undefined,
      }),
    );

    expect(html).toContain('aria-label="使用浅色主题"');
    expect(html).toContain('title="使用浅色主题"');
    expect(html).toContain('data-theme-target="light"');
    expect(html.match(/<button/g)).toHaveLength(1);
  });
});
