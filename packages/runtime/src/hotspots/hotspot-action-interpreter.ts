import { isValidAnnotationOpenLinkHref } from "@web3d/document";
import type { AnnotationAction, AnnotationContent } from "@web3d/document";
import type { Vector3 } from "three";

export type HotspotActivationOrigin = "pointer" | "keyboard" | "list";

export type HotspotActionResultCode =
  | "content-shown"
  | "host-content-requested"
  | "hotspot-focused"
  | "hotspot-unavailable"
  | "target-focused"
  | "target-unavailable"
  | "link-opened"
  | "link-blocked"
  | "link-invalid";

export interface HotspotActivationEvent {
  readonly type: "hotspot-activation";
  readonly annotationId: string;
  readonly actionType: AnnotationAction["type"];
  readonly origin: HotspotActivationOrigin;
  readonly result: HotspotActionResultCode;
}

export interface HotspotActionSubject {
  readonly id: string;
  readonly title: string;
  readonly content: AnnotationContent;
  readonly action: AnnotationAction;
  readonly worldPosition: Vector3 | null;
}

export interface HotspotActionInterpreterOptions {
  readonly showPlainText: (request: {
    readonly annotationId: string;
    readonly title: string;
    readonly text: string;
  }) => void;
  readonly requestHostContent: (request: {
    readonly annotationId: string;
    readonly title: string;
    readonly key: string;
  }) => void;
  readonly focusPoint: (point: Vector3) => Promise<boolean> | boolean;
  readonly focusTarget: (targetId: string) => Promise<boolean> | boolean;
  readonly openExternal?: (href: string) => boolean;
  readonly isUserActivationActive?: () => boolean;
}

export class HotspotActionInterpreter {
  readonly #options: HotspotActionInterpreterOptions;

  constructor(options: HotspotActionInterpreterOptions) {
    this.#options = options;
  }

  async activate(
    subject: HotspotActionSubject,
    origin: HotspotActivationOrigin,
  ): Promise<HotspotActivationEvent> {
    const result = await this.#execute(subject);
    return {
      type: "hotspot-activation",
      annotationId: subject.id,
      actionType: subject.action.type,
      origin,
      result,
    };
  }

  async #execute(subject: HotspotActionSubject): Promise<HotspotActionResultCode> {
    switch (subject.action.type) {
      case "show-content":
        if (subject.content.kind === "plain-text") {
          this.#options.showPlainText({
            annotationId: subject.id,
            title: subject.title,
            text: subject.content.text,
          });
          return "content-shown";
        }
        this.#options.requestHostContent({
          annotationId: subject.id,
          title: subject.title,
          key: subject.content.key,
        });
        return "host-content-requested";
      case "focus-hotspot":
        if (subject.worldPosition === null) return "hotspot-unavailable";
        return (await this.#options.focusPoint(subject.worldPosition.clone()))
          ? "hotspot-focused"
          : "hotspot-unavailable";
      case "focus-target":
        return (await this.#options.focusTarget(subject.action.targetId))
          ? "target-focused"
          : "target-unavailable";
      case "open-link": {
        const href = validAbsoluteHttpsUrl(subject.action.href);
        if (href === null) return "link-invalid";
        const active = (this.#options.isUserActivationActive ?? defaultUserActivationActive)();
        if (!active) return "link-blocked";
        const opened = (this.#options.openExternal ?? defaultOpenExternal)(href);
        return opened ? "link-opened" : "link-blocked";
      }
    }
  }
}

export function validAbsoluteHttpsUrl(value: string): string | null {
  return isValidAnnotationOpenLinkHref(value) ? value : null;
}

function defaultOpenExternal(href: string): boolean {
  if (typeof globalThis.open !== "function") return false;
  return globalThis.open(href, "_blank", "noopener,noreferrer") !== null;
}

function defaultUserActivationActive(): boolean {
  return globalThis.navigator?.userActivation?.isActive === true;
}
