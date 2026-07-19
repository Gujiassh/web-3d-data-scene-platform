import { useEffect, useRef, useState } from "react";
import { Check, X } from "lucide-react";

import { useStudioI18n } from "../i18n/I18nProvider";
import type { HotspotTitleEditorState } from "./useStudioHotspots";
import { limitUnicodeScalars } from "./unicode-text";
import { ViewportClampedLayer } from "./ViewportClampedLayer";

const MAX_TITLE_SCALARS = 160;

export function HotspotTitleEditor({
  editor,
  onCancel,
  onConfirm,
}: {
  readonly editor: HotspotTitleEditorState;
  readonly onCancel: () => void;
  readonly onConfirm: (title: string) => void;
}) {
  const { t } = useStudioI18n();
  const [title, setTitle] = useState(editor.initialTitle);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const confirm = (): void => {
    if (title.trim().length > 0) onConfirm(title);
  };

  return (
    <ViewportClampedLayer
      anchor={editor.screenAnchor}
      className="hotspot-title-editor"
      fallbackHeight={title.trim().length === 0 ? 58 : 38}
      fallbackWidth={280}
      gap={14}
      placement="beside"
    >
      <input
        ref={inputRef}
        aria-label={t.hotspots.editor.titleLabel}
        value={title}
        onChange={(event) =>
          setTitle(limitUnicodeScalars(event.currentTarget.value, MAX_TITLE_SCALARS))
        }
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            confirm();
          } else if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          }
        }}
      />
      <button aria-label={t.hotspots.editor.confirm} type="button" onClick={confirm}>
        <Check size={14} />
      </button>
      <button aria-label={t.hotspots.editor.cancel} type="button" onClick={onCancel}>
        <X size={14} />
      </button>
      {title.trim().length === 0 && <span role="alert">{t.hotspots.editor.required}</span>}
    </ViewportClampedLayer>
  );
}
