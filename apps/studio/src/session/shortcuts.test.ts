import { describe, expect, it } from "vitest";

import {
  canExecuteStudioShortcut,
  resolveExecutableStudioShortcut,
  resolveStudioShortcut,
  type ShortcutInput,
  type StudioShortcut,
} from "./shortcuts";

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

describe("canExecuteStudioShortcut", () => {
  it.each([
    { type: "undo" },
    { type: "redo" },
    { type: "tool", tool: "translate" },
    { type: "duplicate" },
    { type: "delete" },
  ] satisfies readonly StudioShortcut[])(
    "blocks $type while authoring is unavailable",
    (shortcut) => {
      expect(canExecuteStudioShortcut(shortcut, false)).toBe(false);
      expect(canExecuteStudioShortcut(shortcut, true)).toBe(true);
    },
  );

  it.each([
    { type: "save" },
    { type: "focus" },
    { type: "clear" },
  ] satisfies readonly StudioShortcut[])("keeps $type available in Run", (shortcut) => {
    expect(canExecuteStudioShortcut(shortcut, false)).toBe(true);
  });
});

describe("resolveExecutableStudioShortcut", () => {
  it("returns no authoring mutation in Run but preserves non-mutating shortcuts", () => {
    expect(resolveExecutableStudioShortcut({ ...base, key: "z", ctrlKey: true }, false)).toBeNull();
    expect(resolveExecutableStudioShortcut({ ...base, key: "w" }, false)).toBeNull();
    expect(resolveExecutableStudioShortcut({ ...base, key: "Delete" }, false)).toBeNull();
    expect(resolveExecutableStudioShortcut({ ...base, key: "s", ctrlKey: true }, false)).toEqual({
      type: "save",
    });
    expect(resolveExecutableStudioShortcut({ ...base, key: "f" }, false)).toEqual({
      type: "focus",
    });
  });
});
