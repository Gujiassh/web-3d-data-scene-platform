import type { AuthoringTool } from "./session-state";

export type StudioShortcut =
  | { readonly type: "tool"; readonly tool: AuthoringTool }
  | { readonly type: "undo" }
  | { readonly type: "redo" }
  | { readonly type: "save" }
  | { readonly type: "duplicate" }
  | { readonly type: "delete" }
  | { readonly type: "focus" }
  | { readonly type: "clear" };

export interface ShortcutInput {
  readonly key: string;
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
  readonly targetTagName?: string;
  readonly targetEditable?: boolean;
}

export function resolveStudioShortcut(input: ShortcutInput): StudioShortcut | null {
  if (isEditingText(input)) return null;
  const command = input.metaKey || input.ctrlKey;
  const key = input.key.toLowerCase();

  if (command && !input.altKey && key === "z") {
    return { type: input.shiftKey ? "redo" : "undo" };
  }
  if (command && !input.altKey && !input.shiftKey && key === "s") return { type: "save" };
  if (command && !input.altKey && !input.shiftKey && key === "d") return { type: "duplicate" };
  if (command || input.altKey) return null;
  if (input.key === "Delete" || input.key === "Backspace") return { type: "delete" };
  if (input.key === "Escape") return { type: "clear" };
  if (key === "f") return { type: "focus" };
  if (key === "q") return { type: "tool", tool: "select" };
  if (key === "w") return { type: "tool", tool: "translate" };
  if (key === "e") return { type: "tool", tool: "rotate" };
  if (key === "r") return { type: "tool", tool: "scale" };
  return null;
}

function isEditingText(input: ShortcutInput): boolean {
  if (input.targetEditable === true) return true;
  const tagName = input.targetTagName?.toLowerCase();
  return tagName === "input" || tagName === "textarea" || tagName === "select";
}
