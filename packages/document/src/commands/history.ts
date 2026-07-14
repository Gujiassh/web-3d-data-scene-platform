import { executeDocumentCommand } from "./document-command.js";
import type {
  DocumentCommand,
  DocumentHistoryEntry,
  DocumentHistoryState,
  ExecuteDocumentCommandOptions,
} from "./types.js";
import type { SceneDocument } from "../types.js";
import { validateSceneDocument } from "../validate.js";

export function createDocumentHistory(document: SceneDocument): DocumentHistoryState {
  const validated = validateHistoryDocument(document);
  return {
    document: validated,
    undoStack: [],
    redoStack: [],
  };
}

export function executeHistoryCommand(
  history: DocumentHistoryState,
  command: DocumentCommand,
  options: ExecuteDocumentCommandOptions = {},
): DocumentHistoryState {
  if ((options.mode ?? "edit") === "run") {
    throw new Error("Document commands are disabled in Run mode.");
  }

  const nextDocument = executeDocumentCommand(history.document, command);
  const nextEntry: DocumentHistoryEntry = { before: history.document, command };
  return {
    document: nextDocument,
    undoStack: [...history.undoStack, nextEntry],
    redoStack: [],
  };
}

export function undoHistoryCommand(history: DocumentHistoryState): DocumentHistoryState {
  const entry = history.undoStack.at(-1);
  if (entry === undefined) return history;

  const restored = restoreDocument(entry.before, history.document.revision + 1);
  return {
    document: restored,
    undoStack: history.undoStack.slice(0, -1),
    redoStack: [...history.redoStack, entry],
  };
}

export function redoHistoryCommand(history: DocumentHistoryState): DocumentHistoryState {
  const entry = history.redoStack.at(-1);
  if (entry === undefined) return history;

  const nextDocument = executeDocumentCommand(history.document, entry.command);
  const nextUndoEntry: DocumentHistoryEntry = { before: history.document, command: entry.command };
  return {
    document: nextDocument,
    undoStack: [...history.undoStack, nextUndoEntry],
    redoStack: history.redoStack.slice(0, -1),
  };
}

function restoreDocument(document: SceneDocument, revision: number): SceneDocument {
  return validateHistoryDocument({
    ...document,
    revision,
  });
}

function validateHistoryDocument(document: SceneDocument): SceneDocument {
  const result = validateSceneDocument(document);
  if (result.ok) return result.value;

  const detail = result.diagnostics
    .map((diagnostic) => `${diagnostic.code}@${diagnostic.path}`)
    .join(", ");
  throw new Error(`Document history received an invalid SceneDocument: ${detail}`);
}
