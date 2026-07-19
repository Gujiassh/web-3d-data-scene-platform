export interface HotspotScreenAnchor {
  readonly clientX: number;
  readonly clientY: number;
}

export type HotspotUnresolvedReason =
  | "legacy-anchor"
  | "entity-not-registered"
  | "asset-hash-mismatch"
  | "node-not-registered"
  | "surface-not-registered"
  | "unsupported-surface"
  | "non-invertible-transform"
  | "invalid-frame";

export type HotspotViewState =
  | {
      readonly annotationId: string;
      readonly availability: "unavailable";
      readonly unavailableReason: "annotation-not-found";
      readonly resolution: "unresolved";
      readonly unresolvedReason: null;
      readonly markerVisible: false;
      readonly screenAnchor: null;
    }
  | {
      readonly annotationId: string;
      readonly availability: "available";
      readonly unavailableReason: null;
      readonly resolution: "unresolved";
      readonly unresolvedReason: HotspotUnresolvedReason;
      readonly markerVisible: false;
      readonly screenAnchor: null;
    }
  | {
      readonly annotationId: string;
      readonly availability: "available";
      readonly unavailableReason: null;
      readonly resolution: "resolved";
      readonly unresolvedReason: null;
      readonly markerVisible: boolean;
      readonly screenAnchor: HotspotScreenAnchor | null;
    };
