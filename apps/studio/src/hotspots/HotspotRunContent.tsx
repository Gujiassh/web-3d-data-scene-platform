import { X } from "lucide-react";

import { useStudioI18n } from "../i18n/I18nProvider";
import type { HotspotRunContent as Content } from "./useStudioHotspots";

export function HotspotRunContent({
  content,
  onClose,
}: {
  readonly content: Content;
  readonly onClose: () => void;
}) {
  const { t } = useStudioI18n();
  return (
    <aside aria-label={t.hotspots.run.ariaLabel} className="hotspot-run-content">
      <header>
        <strong>{content.title}</strong>
        <button aria-label={t.hotspots.run.close} type="button" onClick={onClose}>
          <X size={14} />
        </button>
      </header>
      <p>
        {content.kind === "plain-text"
          ? content.value || t.hotspots.run.empty
          : t.hotspots.run.hostContent}
      </p>
    </aside>
  );
}
