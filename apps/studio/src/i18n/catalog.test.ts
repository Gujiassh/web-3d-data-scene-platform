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
});
