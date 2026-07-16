import {
  STUDIO_COMMANDS,
  type StudioCommandDefinition,
  type StudioCommandId,
  type StudioPlatform,
  type StudioShortcutChord,
} from "./shortcut-registry";

export interface ShortcutInput {
  readonly key: string;
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
  readonly targetTagName?: string;
  readonly targetEditable?: boolean;
}

export interface StudioShortcutContext {
  readonly platform: StudioPlatform;
  readonly canEdit: boolean;
  readonly hasSelection: boolean;
  readonly canResetSelection: boolean;
  readonly modalOpen: boolean;
  readonly transformDragging: boolean;
}

export function resolveStudioShortcut(
  input: ShortcutInput,
  context: StudioShortcutContext,
): StudioCommandId | null {
  if (isEditingText(input) || context.modalOpen || context.transformDragging) return null;
  const definition = STUDIO_COMMANDS.find((candidate) =>
    candidate.chords.some((chord) => matchesChord(input, chord, context.platform)),
  );
  if (definition === undefined || !canExecuteStudioCommand(definition, context)) return null;
  return definition.id;
}

export function canExecuteStudioCommand(
  definition: StudioCommandDefinition,
  context: Pick<StudioShortcutContext, "canEdit" | "hasSelection" | "canResetSelection">,
): boolean {
  if (definition.requiresEdit && !context.canEdit) return false;
  if (definition.requiresSelection && !context.hasSelection) return false;
  return !definition.requiresReset || context.canResetSelection;
}

function matchesChord(
  input: ShortcutInput,
  chord: StudioShortcutChord,
  platform: StudioPlatform,
): boolean {
  if (chord.platform !== undefined && chord.platform !== platform) return false;
  const expectsMeta = chord.primary === true && platform === "mac";
  const expectsControl = chord.control === true || (chord.primary === true && platform === "other");
  return (
    normalizeInputKey(input) === normalizeKey(chord.key) &&
    input.altKey === (chord.alt ?? false) &&
    input.shiftKey === (chord.shift ?? false) &&
    input.metaKey === expectsMeta &&
    input.ctrlKey === expectsControl
  );
}

function normalizeInputKey(input: ShortcutInput): string {
  if (input.shiftKey && input.key === "/") return "?";
  return normalizeKey(input.key);
}

function normalizeKey(key: string): string {
  return key.length === 1 ? key.toLowerCase() : key;
}

function isEditingText(input: ShortcutInput): boolean {
  if (input.targetEditable === true) return true;
  const tagName = input.targetTagName?.toLowerCase();
  return tagName === "input" || tagName === "textarea" || tagName === "select";
}
