import { describe, expect, it } from "vitest";

import { resolveStudioShortcut, type ShortcutInput } from "./shortcuts";

const base: ShortcutInput = {
  key: "",
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
};

describe("resolveStudioShortcut", () => {
  it("maps authoring tools and selection commands", () => {
    expect(resolveStudioShortcut({ ...base, key: "w" })).toEqual({
      type: "tool",
      tool: "translate",
    });
    expect(resolveStudioShortcut({ ...base, key: "E" })).toEqual({
      type: "tool",
      tool: "rotate",
    });
    expect(resolveStudioShortcut({ ...base, key: "Delete" })).toEqual({ type: "delete" });
    expect(resolveStudioShortcut({ ...base, key: "Escape" })).toEqual({ type: "clear" });
  });

  it("maps platform command shortcuts without treating display labels as semantics", () => {
    expect(resolveStudioShortcut({ ...base, key: "z", ctrlKey: true })).toEqual({ type: "undo" });
    expect(resolveStudioShortcut({ ...base, key: "z", metaKey: true, shiftKey: true })).toEqual({
      type: "redo",
    });
    expect(resolveStudioShortcut({ ...base, key: "s", ctrlKey: true })).toEqual({ type: "save" });
    expect(resolveStudioShortcut({ ...base, key: "d", metaKey: true })).toEqual({
      type: "duplicate",
    });
  });

  it("does not trigger scene commands while editing text or using unsupported modifiers", () => {
    expect(resolveStudioShortcut({ ...base, key: "w", targetTagName: "input" })).toBeNull();
    expect(resolveStudioShortcut({ ...base, key: "Delete", targetEditable: true })).toBeNull();
    expect(resolveStudioShortcut({ ...base, key: "w", altKey: true })).toBeNull();
  });
});
