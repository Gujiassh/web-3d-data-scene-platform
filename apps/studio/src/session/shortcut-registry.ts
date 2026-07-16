export type StudioPlatform = "mac" | "other";

export type StudioCommandCategory = "project" | "selection" | "transform" | "view" | "help";

export type StudioCommandId =
  | "tool.select"
  | "tool.translate"
  | "tool.rotate"
  | "tool.scale"
  | "smart-align.toggle"
  | "reset.position"
  | "reset.rotation"
  | "reset.scale"
  | "history.undo"
  | "history.redo"
  | "selection.duplicate"
  | "selection.delete"
  | "selection.clear"
  | "project.save"
  | "view.focus"
  | "help.open";

export interface StudioShortcutChord {
  readonly key: string;
  readonly alt?: boolean;
  readonly primary?: boolean;
  readonly control?: boolean;
  readonly shift?: boolean;
  readonly platform?: StudioPlatform;
  readonly displayKey?: string;
}

export interface StudioCommandDefinition {
  readonly id: StudioCommandId;
  readonly category: StudioCommandCategory;
  readonly chords: readonly StudioShortcutChord[];
  readonly requiresEdit: boolean;
  readonly requiresSelection: boolean;
  readonly requiresReset: boolean;
}

export const STUDIO_COMMANDS = [
  command("project.save", "project", [primary("s")]),
  command("history.undo", "project", [primary("z")], true),
  command(
    "history.redo",
    "project",
    [primary("z", { shift: true }), { key: "y", control: true, platform: "other" }],
    true,
  ),
  command("selection.duplicate", "selection", [primary("d")], true, true),
  command(
    "selection.delete",
    "selection",
    [{ key: "Delete" }, { key: "Backspace", platform: "mac" }],
    true,
    true,
  ),
  command("selection.clear", "selection", [{ key: "Escape", displayKey: "Esc" }]),
  command("tool.select", "transform", [{ key: "q" }], true),
  command("tool.translate", "transform", [{ key: "w" }], true),
  command("tool.rotate", "transform", [{ key: "e" }], true),
  command("tool.scale", "transform", [{ key: "r" }], true),
  command("smart-align.toggle", "transform", [{ key: "s" }], true),
  command("reset.position", "transform", [{ key: "g", alt: true }], true, true, true),
  command("reset.rotation", "transform", [{ key: "r", alt: true }], true, true, true),
  command("reset.scale", "transform", [{ key: "s", alt: true }], true, true, true),
  command("view.focus", "view", [{ key: "f" }], false, true),
  command("help.open", "help", [{ key: "?", shift: true, displayKey: "?" }]),
] as const satisfies readonly StudioCommandDefinition[];

export function studioCommand(id: StudioCommandId): StudioCommandDefinition {
  const definition = STUDIO_COMMANDS.find((candidate) => candidate.id === id);
  if (definition === undefined) throw new TypeError(`Studio command '${id}' is not registered.`);
  return definition;
}

export function studioCommandShortcut(id: StudioCommandId, platform: StudioPlatform): string {
  return studioCommandShortcuts(id, platform)[0] ?? "";
}

export function studioCommandShortcuts(
  id: StudioCommandId,
  platform: StudioPlatform,
): readonly string[] {
  return studioCommand(id)
    .chords.filter(
      (candidate) => candidate.platform === undefined || candidate.platform === platform,
    )
    .map((chord) => formatShortcutChord(chord, platform));
}

export function formatShortcutChord(chord: StudioShortcutChord, platform: StudioPlatform): string {
  const parts: string[] = [];
  if (chord.primary === true) parts.push(platform === "mac" ? "Cmd" : "Ctrl");
  if (chord.control === true) parts.push("Ctrl");
  if (chord.alt === true) parts.push(platform === "mac" ? "Option" : "Alt");
  if (chord.shift === true && chord.displayKey !== "?") parts.push("Shift");
  parts.push(chord.displayKey ?? displayKey(chord.key));
  return parts.join("+");
}

export function detectStudioPlatform(navigatorValue: Navigator | undefined): StudioPlatform {
  if (navigatorValue === undefined) return "other";
  return /Mac|iPhone|iPad|iPod/u.test(`${navigatorValue.platform} ${navigatorValue.userAgent}`)
    ? "mac"
    : "other";
}

function command(
  id: StudioCommandId,
  category: StudioCommandCategory,
  chords: readonly StudioShortcutChord[],
  requiresEdit = false,
  requiresSelection = false,
  requiresReset = false,
): StudioCommandDefinition {
  return { id, category, chords, requiresEdit, requiresSelection, requiresReset };
}

function primary(
  key: string,
  overrides: Omit<StudioShortcutChord, "key" | "primary"> = {},
): StudioShortcutChord {
  return { key, primary: true, ...overrides };
}

function displayKey(key: string): string {
  return key.length === 1 ? key.toUpperCase() : key;
}
