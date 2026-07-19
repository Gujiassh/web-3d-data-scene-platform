import { useId, useState } from "react";
import { Check, Search } from "lucide-react";

import { useStudioI18n } from "../i18n/I18nProvider";

export interface HotspotSearchItem {
  readonly id: string;
  readonly displayName: string;
}

export function HotspotSearchSelect({
  disabled,
  emptyLabel,
  items,
  label,
  placeholder,
  selectedId,
  unavailableLabel,
  onSelect,
}: {
  readonly disabled: boolean;
  readonly emptyLabel: string;
  readonly items: readonly HotspotSearchItem[];
  readonly label: string;
  readonly placeholder: string;
  readonly selectedId: string | null;
  readonly unavailableLabel: string;
  readonly onSelect: (id: string) => void;
}) {
  const { locale } = useStudioI18n();
  const [query, setQuery] = useState("");
  const listId = useId();
  const selected = items.find((item) => item.id === selectedId) ?? null;
  const normalizedQuery = query.trim().toLocaleLowerCase(locale);
  const matches = items.filter((item) =>
    item.displayName.toLocaleLowerCase(locale).includes(normalizedQuery),
  );

  return (
    <div className="hotspot-search-select">
      <label>
        <span>{label}</span>
        <span className="hotspot-search-input">
          <Search aria-hidden="true" size={13} />
          <input
            aria-controls={listId}
            autoComplete="off"
            disabled={disabled}
            placeholder={placeholder}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
        </span>
      </label>
      {selected !== null ? (
        <div className="hotspot-current-selection">
          <Check aria-hidden="true" size={13} />
          <span>{selected.displayName}</span>
        </div>
      ) : selectedId !== null ? (
        <p className="hotspot-unavailable-selection" role="status">
          {unavailableLabel}
        </p>
      ) : null}
      <div id={listId} className="hotspot-search-results" role="listbox" aria-label={label}>
        {matches.length === 0 ? (
          <p>{emptyLabel}</p>
        ) : (
          matches.map((item) => (
            <button
              aria-selected={item.id === selectedId}
              disabled={disabled}
              key={item.id}
              role="option"
              type="button"
              onClick={() => onSelect(item.id)}
            >
              <span>{item.displayName}</span>
              {item.id === selectedId && <Check aria-hidden="true" size={13} />}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
