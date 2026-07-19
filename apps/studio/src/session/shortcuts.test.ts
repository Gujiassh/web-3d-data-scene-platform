import { describe, expect, it } from "vitest";

import { STUDIO_COMMANDS, studioCommandShortcut } from "./shortcut-registry";
import { resolveStudioShortcut, type ShortcutInput, type StudioShortcutContext } from "./shortcuts";

const input: ShortcutInput = {
  key: "",
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
};
const context: StudioShortcutContext = {
  platform: "other",
  canEdit: true,
  canResetSelection: true,
  hasSelection: true,
  modalOpen: false,
  transformDragging: false,
};

describe("Studio shortcut registry", () => {
  it("uses unique command ids and platform labels", () => {
    expect(new Set(STUDIO_COMMANDS.map((command) => command.id)).size).toBe(STUDIO_COMMANDS.length);
    expect(studioCommandShortcut("history.undo", "mac")).toBe("Cmd+Z");
    expect(studioCommandShortcut("history.undo", "other")).toBe("Ctrl+Z");
    expect(studioCommandShortcut("reset.rotation", "mac")).toBe("Option+R");
    expect(studioCommandShortcut("help.open", "other")).toBe("?");
    expect(studioCommandShortcut("hotspot.add", "other")).toBe("H");
  });
});

describe("resolveStudioShortcut", () => {
  it("resolves tools, reset, history and platform aliases", () => {
    expect(resolveStudioShortcut({ ...input, key: "W" }, context)).toBe("tool.translate");
    expect(resolveStudioShortcut({ ...input, key: "H" }, context)).toBe("hotspot.add");
    expect(resolveStudioShortcut({ ...input, key: "S" }, context)).toBe("smart-align.toggle");
    expect(resolveStudioShortcut({ ...input, key: "r", altKey: true }, context)).toBe(
      "reset.rotation",
    );
    expect(resolveStudioShortcut({ ...input, key: "s", altKey: true }, context)).toBe(
      "reset.scale",
    );
    expect(resolveStudioShortcut({ ...input, key: "z", ctrlKey: true }, context)).toBe(
      "history.undo",
    );
    expect(
      resolveStudioShortcut({ ...input, key: "z", ctrlKey: true, shiftKey: true }, context),
    ).toBe("history.redo");
    expect(resolveStudioShortcut({ ...input, key: "y", ctrlKey: true }, context)).toBe(
      "history.redo",
    );
    expect(resolveStudioShortcut({ ...input, key: "Backspace" }, context)).toBeNull();
    expect(
      resolveStudioShortcut({ ...input, key: "Backspace" }, { ...context, platform: "mac" }),
    ).toBe("selection.delete");
  });

  it("requires exact modifiers", () => {
    expect(resolveStudioShortcut({ ...input, key: "w", shiftKey: true }, context)).toBeNull();
    expect(resolveStudioShortcut({ ...input, key: "s", shiftKey: true }, context)).toBeNull();
    expect(
      resolveStudioShortcut({ ...input, key: "z", ctrlKey: true, altKey: true }, context),
    ).toBeNull();
    expect(resolveStudioShortcut({ ...input, key: "z", metaKey: true }, context)).toBeNull();
    expect(resolveStudioShortcut({ ...input, key: "s", ctrlKey: true }, context)).toBe(
      "project.save",
    );
    expect(
      resolveStudioShortcut({ ...input, key: "z", metaKey: true }, { ...context, platform: "mac" }),
    ).toBe("history.undo");
    expect(resolveStudioShortcut({ ...input, key: "?", shiftKey: true }, context)).toBe(
      "help.open",
    );
    expect(resolveStudioShortcut({ ...input, key: "/", shiftKey: true }, context)).toBe(
      "help.open",
    );
  });

  it("enforces text, modal, drag, selection and Run gates", () => {
    expect(
      resolveStudioShortcut({ ...input, key: "w", targetTagName: "input" }, context),
    ).toBeNull();
    expect(
      resolveStudioShortcut({ ...input, key: "h", targetTagName: "input" }, context),
    ).toBeNull();
    expect(
      resolveStudioShortcut({ ...input, key: "w" }, { ...context, modalOpen: true }),
    ).toBeNull();
    expect(
      resolveStudioShortcut({ ...input, key: "w" }, { ...context, transformDragging: true }),
    ).toBeNull();
    expect(
      resolveStudioShortcut({ ...input, key: "Delete" }, { ...context, hasSelection: false }),
    ).toBeNull();
    expect(
      resolveStudioShortcut(
        { ...input, key: "r", altKey: true },
        { ...context, canResetSelection: false },
      ),
    ).toBeNull();
    expect(
      resolveStudioShortcut({ ...input, key: "w" }, { ...context, canEdit: false }),
    ).toBeNull();
    expect(
      resolveStudioShortcut({ ...input, key: "h" }, { ...context, canEdit: false }),
    ).toBeNull();
    expect(
      resolveStudioShortcut({ ...input, key: "s" }, { ...context, canEdit: false }),
    ).toBeNull();
    expect(
      resolveStudioShortcut({ ...input, key: "s", ctrlKey: true }, { ...context, canEdit: false }),
    ).toBe("project.save");
    expect(
      resolveStudioShortcut({ ...input, key: "?", shiftKey: true }, { ...context, canEdit: false }),
    ).toBe("help.open");
  });
});
