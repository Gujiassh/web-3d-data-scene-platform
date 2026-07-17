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

  it("keeps the bilingual shortcut command catalog symmetric", () => {
    expect(Object.keys(english.shortcutHelp.commands)).toEqual(
      Object.keys(chinese.shortcutHelp.commands),
    );
    expect(english.shortcutHelp.commands["reset.rotation"].label).toBe("Reset rotation");
    expect(chinese.shortcutHelp.commands["reset.rotation"].label).toBe("重置旋转");
    expect(english.shortcutHelp.commands["smart-align.toggle"].label).toBe("Toggle Smart Align");
    expect(chinese.shortcutHelp.commands["smart-align.toggle"].label).toBe("切换智能对齐");
    expect(english.toolbar.smartAlign).toBe("Smart Align");
    expect(chinese.toolbar.smartAlign).toBe("智能对齐");
  });

  it("keeps unified Settings tabs, Scene presets and directions symmetric", () => {
    expect(english.appSettings.applicationTab).toBe("Application");
    expect(english.appSettings.sceneTab).toBe("Scene");
    expect(chinese.appSettings.lightingTab).toBe("灯光");
    expect(Object.keys(english.sceneSettings.presets)).toEqual(
      Object.keys(chinese.sceneSettings.presets),
    );
    expect(Object.keys(english.sceneSettings.directions)).toEqual(
      Object.keys(chinese.sceneSettings.directions),
    );
    expect(english.sceneSettings.currentPreset(english.sceneSettings.presets.custom)).toBe(
      "Current preset: Custom",
    );
    expect(chinese.sceneSettings.currentPreset(chinese.sceneSettings.presets.custom)).toBe(
      "当前预设：自定义",
    );
  });

  it("keeps app Settings language and theme labels symmetric", () => {
    expect(Object.keys(english.appSettings)).toEqual(Object.keys(chinese.appSettings));
    expect(english.toolbar.settings).toBe("Settings");
    expect(chinese.toolbar.settings).toBe("设置");
    expect(english.sceneSettings.commitFailed).toContain("previous value was restored");
    expect(chinese.sceneSettings.commitFailed).toContain("已恢复之前的值");
  });

  it("keeps authored-light menu, fields and disabled reasons bilingual", () => {
    expect(Object.keys(english.lights.menu)).toEqual(Object.keys(chinese.lights.menu));
    expect(Object.keys(english.lights.inspector.validation)).toEqual(
      Object.keys(chinese.lights.inspector.validation),
    );
    expect(english.lights.menu.addPoint).toBe("Add point");
    expect(chinese.lights.menu.addSpot).toBe("添加聚光灯");
    expect(chinese.lights.menu.countLabel(3)).toContain("3/8");
    expect(english.lights.inspector.brightness).toBe("Brightness");
    expect(chinese.lights.inspector.brightness).toBe("亮度");
  });
});
