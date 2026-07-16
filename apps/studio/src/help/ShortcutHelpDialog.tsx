import { useEffect, useId, useMemo, useRef, useState } from "react";
import { CircleHelp, Search, X } from "lucide-react";

import { useStudioI18n } from "../i18n/I18nProvider";
import {
  STUDIO_COMMANDS,
  detectStudioPlatform,
  studioCommandShortcuts,
  type StudioCommandCategory,
} from "../session/shortcut-registry";

interface ShortcutHelpDialogProps {
  readonly onClose: () => void;
}

const CATEGORIES: readonly StudioCommandCategory[] = [
  "project",
  "selection",
  "transform",
  "view",
  "help",
];

export function ShortcutHelpDialog({ onClose }: ShortcutHelpDialogProps) {
  const { t } = useStudioI18n();
  const backdropRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const [query, setQuery] = useState("");
  const platform = detectStudioPlatform(globalThis.navigator);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const groups = useMemo(
    () =>
      CATEGORIES.map((category) => ({
        category,
        commands: STUDIO_COMMANDS.filter((command) => {
          if (command.category !== category) return false;
          const shortcuts = studioCommandShortcuts(command.id, platform);
          const haystack = [
            t.shortcutHelp.commands[command.id].label,
            t.shortcutHelp.commands[command.id].description,
            ...shortcuts,
          ]
            .join(" ")
            .toLocaleLowerCase();
          return normalizedQuery === "" || haystack.includes(normalizedQuery);
        }),
      })).filter((group) => group.commands.length > 0),
    [normalizedQuery, platform, t.shortcutHelp.commands],
  );

  useEffect(() => {
    const backdrop = backdropRef.current;
    const siblings = backdrop?.parentElement
      ? [...backdrop.parentElement.children].filter(
          (element): element is HTMLElement =>
            element instanceof HTMLElement && element !== backdrop,
        )
      : [];
    const previousInert = siblings.map((element) => ({ element, inert: element.inert }));
    for (const sibling of siblings) sibling.inert = true;
    searchRef.current?.focus();
    return () => {
      for (const entry of previousInert) entry.element.inert = entry.inert;
    };
  }, []);

  return (
    <div ref={backdropRef} className="dialog-backdrop" role="presentation">
      <section
        ref={dialogRef}
        aria-labelledby={titleId}
        aria-modal="true"
        className="shortcut-help-dialog"
        role="dialog"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            onClose();
          }
          if (event.key === "Tab") trapFocus(event, dialogRef.current);
        }}
      >
        <header>
          <span className="dialog-symbol">
            <CircleHelp size={18} />
          </span>
          <h2 id={titleId}>{t.shortcutHelp.title}</h2>
          <button
            aria-label={t.shortcutHelp.close}
            className="icon-button"
            title={t.shortcutHelp.close}
            type="button"
            onClick={onClose}
          >
            <X size={15} />
          </button>
        </header>

        <label className="shortcut-help-search">
          <Search size={14} />
          <input
            ref={searchRef}
            aria-label={t.shortcutHelp.searchLabel}
            placeholder={t.shortcutHelp.searchPlaceholder}
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
        </label>

        <div className="shortcut-help-results" aria-live="polite">
          {groups.length === 0 ? (
            <p className="shortcut-help-empty">{t.shortcutHelp.noResults}</p>
          ) : (
            groups.map((group) => (
              <section key={group.category}>
                <h3>{t.shortcutHelp.categories[group.category]}</h3>
                <div className="shortcut-help-list">
                  {group.commands.map((command) => (
                    <div className="shortcut-help-row" key={command.id}>
                      <span>
                        <strong>{t.shortcutHelp.commands[command.id].label}</strong>
                        <small>{t.shortcutHelp.commands[command.id].description}</small>
                      </span>
                      <kbd>{studioCommandShortcuts(command.id, platform).join(" / ")}</kbd>
                    </div>
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function trapFocus(event: React.KeyboardEvent, container: HTMLElement | null): void {
  if (container === null) return;
  const focusable = [...container.querySelectorAll<HTMLElement>("button:not(:disabled), input")];
  const first = focusable[0];
  const last = focusable.at(-1);
  if (first === undefined || last === undefined) return;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}
