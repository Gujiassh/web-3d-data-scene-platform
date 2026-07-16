import { useEffect, useRef } from "react";

import type { AuthoringSceneHandle } from "@web3d/react";

import { detectStudioPlatform, type StudioCommandId } from "./shortcut-registry";
import { resolveStudioShortcut } from "./shortcuts";

export type StudioShortcutActions = Readonly<Record<StudioCommandId, () => void>>;

interface UseStudioShortcutsOptions {
  readonly actions: StudioShortcutActions;
  readonly canEdit: boolean;
  readonly canResetSelection: boolean;
  readonly hasSelection: boolean;
  readonly modalOpen: boolean;
  readonly viewerRef: React.RefObject<AuthoringSceneHandle | null>;
}

export function useStudioShortcuts(options: UseStudioShortcutsOptions): void {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const current = optionsRef.current;
      const target = event.target instanceof HTMLElement ? event.target : null;
      const commandId = resolveStudioShortcut(
        {
          key: event.key,
          metaKey: event.metaKey,
          ctrlKey: event.ctrlKey,
          shiftKey: event.shiftKey,
          altKey: event.altKey,
          ...(target === null ? {} : { targetTagName: target.tagName }),
          ...(target === null ? {} : { targetEditable: target.isContentEditable }),
        },
        {
          platform: detectStudioPlatform(globalThis.navigator),
          canEdit: current.canEdit,
          canResetSelection: current.canResetSelection,
          hasSelection: current.hasSelection,
          modalOpen: current.modalOpen,
          transformDragging: current.viewerRef.current?.isTransformDragging() ?? false,
        },
      );
      if (commandId === null) return;
      event.preventDefault();
      current.actions[commandId]();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
