import type { StudioCatalog } from "../i18n/catalog";
import type { HotspotStatusCode } from "./useStudioHotspots";

type HotspotCatalog = StudioCatalog["hotspots"];

export function hotspotStatusMessage(
  status: HotspotStatusCode | null,
  catalog: HotspotCatalog,
): string {
  if (status === null) return "";
  const feedback = catalog.feedback;
  switch (status) {
    case "placement-active":
    case "surface-ready":
      return feedback.place;
    case "title-required":
      return feedback.titleRequired;
    case "reposition-active":
      return feedback.reposition;
    case "unsupported":
      return feedback.unsupported;
    case "no-surface":
      return feedback.noSurface;
    case "created":
      return feedback.created;
    case "renamed":
      return feedback.renamed;
    case "repositioned":
      return feedback.repositioned;
    case "updated":
      return feedback.updated;
    case "hidden":
      return feedback.hidden;
    case "shown":
      return feedback.shown;
    case "lock-enabled":
      return feedback.lockEnabled;
    case "unlocked":
      return feedback.unlocked;
    case "locked":
      return feedback.locked;
    case "command-rejected":
      return feedback.commandRejected;
    case "unavailable":
    case "hotspot-unavailable":
      return feedback.unavailable;
    case "legacy-anchor":
    case "entity-not-registered":
    case "asset-hash-mismatch":
    case "node-not-registered":
    case "surface-not-registered":
    case "unsupported-surface":
    case "non-invertible-transform":
    case "invalid-frame":
      return catalog.list.unresolvedReasons[status];
    case "removed":
      return feedback.removed;
    case "content-shown":
      return feedback.contentShown;
    case "host-content-requested":
      return feedback.hostContentRequested;
    case "hotspot-focused":
      return feedback.hotspotFocused;
    case "target-focused":
      return feedback.targetFocused;
    case "target-unavailable":
      return feedback.targetUnavailable;
    case "link-opened":
      return feedback.linkOpened;
    case "link-blocked":
      return feedback.linkBlocked;
    case "link-invalid":
      return feedback.linkInvalid;
    case "cancel":
    case "mode":
    case "source":
    case "revision":
    case "project":
    case "context":
    case "dispose":
      return feedback.canceled;
  }
}
