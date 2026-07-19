import { useRef, useState } from "react";
import { ExternalLink, Focus, MessageSquareText, MousePointerClick, X } from "lucide-react";

import {
  isValidAnnotationOpenLinkHref,
  type Annotation,
  type SceneDocument,
} from "@web3d/document";

import { useStudioI18n } from "../i18n/I18nProvider";
import { HotspotSearchSelect } from "./HotspotSearchSelect";
import type { TrustedHotspotContentItem } from "./trustedContentCatalog";
import { limitUnicodeScalars, unicodeScalarLength } from "./unicode-text";

type ActionType = Annotation["action"]["type"];
const MAX_PLAIN_TEXT_SCALARS = 2000;

export function HotspotInspector({
  annotation,
  document,
  editable,
  trustedContentCatalog,
  onClose,
  onUpdate,
}: {
  readonly annotation: Annotation;
  readonly document: SceneDocument;
  readonly editable: boolean;
  readonly trustedContentCatalog: readonly TrustedHotspotContentItem[];
  readonly onClose: () => void;
  readonly onUpdate: (before: Annotation, after: Annotation) => boolean;
}) {
  const { t } = useStudioI18n();
  const [contentMode, setContentMode] = useState(annotation.content.kind);
  const [contentValue, setContentValue] = useState(
    annotation.content.kind === "plain-text" ? annotation.content.text : "",
  );
  const [actionType, setActionType] = useState<ActionType>(annotation.action.type);
  const [linkValue, setLinkValue] = useState(
    annotation.action.type === "open-link" ? annotation.action.href : "",
  );
  const [linkInvalid, setLinkInvalid] = useState(false);
  const committedTextRef = useRef(
    annotation.content.kind === "plain-text" ? annotation.content.text : null,
  );
  const committedLinkRef = useRef(
    annotation.action.type === "open-link" ? annotation.action.href : null,
  );

  const commitPlainText = (): void => {
    if (
      !editable ||
      contentMode !== "plain-text" ||
      unicodeScalarLength(contentValue) > MAX_PLAIN_TEXT_SCALARS
    )
      return;
    if (committedTextRef.current === contentValue) return;
    if (
      onUpdate(annotation, {
        ...annotation,
        content: { kind: "plain-text", text: contentValue },
      })
    ) {
      committedTextRef.current = contentValue;
    }
  };

  const chooseAction = (nextType: ActionType): void => {
    if (!editable) return;
    setActionType(nextType);
    setLinkInvalid(false);
    if (nextType === "show-content" || nextType === "focus-hotspot") {
      if (annotation.action.type === nextType) return;
      onUpdate(annotation, { ...annotation, action: { type: nextType } });
    }
  };

  const commitLink = (): void => {
    if (!editable || actionType !== "open-link") return;
    if (!isValidAnnotationOpenLinkHref(linkValue)) {
      setLinkInvalid(true);
      return;
    }
    setLinkInvalid(false);
    if (committedLinkRef.current === linkValue) return;
    if (
      onUpdate(annotation, {
        ...annotation,
        action: { type: "open-link", href: linkValue },
      })
    ) {
      committedLinkRef.current = linkValue;
    }
  };

  return (
    <section className="hotspot-inspector">
      <header>
        <MousePointerClick size={14} />
        <strong>{annotation.title}</strong>
        <button aria-label={t.hotspots.inspector.close} type="button" onClick={onClose}>
          <X size={14} />
        </button>
      </header>

      <div className="hotspot-segment" aria-label={t.hotspots.inspector.contentType}>
        <button
          aria-pressed={contentMode === "plain-text"}
          disabled={!editable}
          type="button"
          onClick={() => {
            setContentMode("plain-text");
            if (annotation.content.kind !== "plain-text") {
              onUpdate(annotation, {
                ...annotation,
                content: { kind: "plain-text", text: "" },
              });
            }
          }}
        >
          <MessageSquareText size={13} /> {t.hotspots.inspector.plainText}
        </button>
        <button
          aria-pressed={contentMode === "host-content"}
          disabled={!editable}
          type="button"
          onClick={() => setContentMode("host-content")}
        >
          {t.hotspots.inspector.hostContent}
        </button>
      </div>

      {contentMode === "plain-text" ? (
        <label>
          <span>{t.hotspots.inspector.content}</span>
          <textarea
            disabled={!editable}
            rows={4}
            value={contentValue}
            onBlur={commitPlainText}
            onChange={(event) =>
              setContentValue(
                limitUnicodeScalars(event.currentTarget.value, MAX_PLAIN_TEXT_SCALARS),
              )
            }
          />
          <small>{t.hotspots.inspector.plainTextLimit(unicodeScalarLength(contentValue))}</small>
        </label>
      ) : (
        <HotspotSearchSelect
          disabled={!editable}
          emptyLabel={t.hotspots.inspector.noTrustedContent}
          items={trustedContentCatalog.map((item) => ({
            id: item.key,
            displayName: item.displayName,
          }))}
          label={t.hotspots.inspector.trustedContent}
          placeholder={t.hotspots.inspector.searchTrustedContent}
          selectedId={annotation.content.kind === "host-content" ? annotation.content.key : null}
          unavailableLabel={t.hotspots.inspector.trustedContentUnavailable}
          onSelect={(key) => {
            if (!editable) return;
            if (annotation.content.kind === "host-content" && annotation.content.key === key)
              return;
            onUpdate(annotation, {
              ...annotation,
              content: { kind: "host-content", key },
            });
          }}
        />
      )}

      <details className="hotspot-behavior">
        <summary>{t.hotspots.inspector.behavior}</summary>
        <div
          className="hotspot-action-options"
          role="radiogroup"
          aria-label={t.hotspots.inspector.action}
        >
          <ActionChoice
            checked={actionType === "show-content"}
            disabled={!editable}
            icon={<MessageSquareText size={13} />}
            label={t.hotspots.inspector.actions.showContent}
            onChoose={() => chooseAction("show-content")}
          />
          <ActionChoice
            checked={actionType === "focus-hotspot"}
            disabled={!editable}
            icon={<Focus size={13} />}
            label={t.hotspots.inspector.actions.focusHotspot}
            onChoose={() => chooseAction("focus-hotspot")}
          />
          <ActionChoice
            checked={actionType === "focus-target"}
            disabled={!editable || document.targets.length === 0}
            icon={<Focus size={13} />}
            label={t.hotspots.inspector.actions.focusTarget}
            onChoose={() => chooseAction("focus-target")}
          />
          <ActionChoice
            checked={actionType === "open-link"}
            disabled={!editable}
            icon={<ExternalLink size={13} />}
            label={t.hotspots.inspector.actions.openLink}
            onChoose={() => chooseAction("open-link")}
          />
        </div>

        {actionType === "focus-target" && (
          <HotspotSearchSelect
            disabled={!editable}
            emptyLabel={t.hotspots.inspector.noTargets}
            items={document.targets.map((target) => ({
              id: target.id,
              displayName: target.name,
            }))}
            label={t.hotspots.inspector.target}
            placeholder={t.hotspots.inspector.searchTarget}
            selectedId={
              annotation.action.type === "focus-target" ? annotation.action.targetId : null
            }
            unavailableLabel={t.hotspots.inspector.targetUnavailable}
            onSelect={(targetId) => {
              if (!editable) return;
              if (
                annotation.action.type === "focus-target" &&
                annotation.action.targetId === targetId
              ) {
                return;
              }
              onUpdate(annotation, {
                ...annotation,
                action: { type: "focus-target", targetId },
              });
            }}
          />
        )}

        {actionType === "open-link" && (
          <label>
            <span>{t.hotspots.inspector.link}</span>
            <input
              aria-invalid={linkInvalid}
              disabled={!editable}
              maxLength={2048}
              placeholder={t.hotspots.inspector.linkPlaceholder}
              type="url"
              value={linkValue}
              onBlur={commitLink}
              onChange={(event) => {
                setLinkValue(event.currentTarget.value);
                setLinkInvalid(false);
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                commitLink();
              }}
            />
            {linkInvalid && <small role="alert">{t.hotspots.inspector.invalidLink}</small>}
          </label>
        )}
      </details>
    </section>
  );
}

function ActionChoice({
  checked,
  disabled,
  icon,
  label,
  onChoose,
}: {
  readonly checked: boolean;
  readonly disabled: boolean;
  readonly icon: React.ReactNode;
  readonly label: string;
  readonly onChoose: () => void;
}) {
  return (
    <button
      aria-checked={checked}
      className={checked ? "is-active" : ""}
      disabled={disabled}
      role="radio"
      type="button"
      onClick={onChoose}
    >
      {icon} {label}
    </button>
  );
}
