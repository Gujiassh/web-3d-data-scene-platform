import { describe, expect, it } from "vitest";

import { chinese, english } from "./catalog";

describe("Studio catalog", () => {
  it("keeps viewport technical status separate from toolbar commands", () => {
    expect(english.toolbar.tools.translate).toBe("Move");
    expect(english.app.viewport.modeStatus).toEqual({ edit: "EDIT", run: "RUN" });
    expect(english.app.viewport.toolStatus).toEqual({
      select: "SELECT",
      translate: "TRANSLATE",
      rotate: "ROTATE",
      scale: "SCALE",
    });
    expect(chinese.app.viewport.modeStatus).toEqual({ edit: "编辑", run: "运行" });
    expect(chinese.app.viewport.toolStatus.translate).toBe("平移");
  });

  it("localizes the string rule-value length contract", () => {
    expect(english.dataBinding.validation("rule-expected-too-long")).toBe(
      "Rule values must be 160 characters or fewer.",
    );
    expect(chinese.dataBinding.validation("rule-expected-too-long")).toBe(
      "规则值不得超过 160 个字符。",
    );
  });

  it("localizes the primary Scene tree accessible name", () => {
    expect(english.sceneTree.itemLabel("Press", true)).toBe("Press, primary selection");
    expect(chinese.sceneTree.itemLabel("冲压机", true)).toBe("冲压机，主选对象");
    expect(english.sceneTree.itemLabel("Press", false)).toBe("Press");
  });

  it("localizes layout commands and stable disabled reasons", () => {
    expect(english.layout.groupSelection).toBe("Group selection");
    expect(chinese.layout.groupSelection).toBe("编组所选对象");
    expect(english.layout.reasons["non-representable-transform"]).toContain("shear");
    expect(chinese.layout.reasons["non-representable-transform"]).toContain("剪切");
    expect(english.layout.localScaleDelta).toBe("Local scale delta");
    expect(chinese.layout.localScaleDelta).toBe("局部缩放变化");
  });
});
