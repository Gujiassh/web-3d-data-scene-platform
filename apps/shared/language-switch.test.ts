import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LanguageSwitch } from "./LanguageSwitch";

describe("LanguageSwitch", () => {
  it("exposes translated button names and the current selection", () => {
    const html = renderToStaticMarkup(
      createElement(LanguageSwitch, {
        ariaLabel: "界面语言",
        chineseLabel: "中文",
        englishLabel: "英文",
        locale: "zh-CN",
        onChange: () => undefined,
      }),
    );

    expect(html).toContain('role="group"');
    expect(html).toContain('aria-label="界面语言"');
    expect(html).toContain('aria-label="中文" aria-pressed="true"');
    expect(html).toContain('aria-label="英文" aria-pressed="false"');
  });
});
