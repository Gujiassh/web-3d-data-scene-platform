import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { StudioI18nProvider } from "../i18n/I18nProvider";
import { SceneLayoutPanel } from "./SceneLayoutPanel";
import { DISABLED_TRANSFORM_SETTINGS } from "./types";
import type { StudioSceneLayout } from "./useStudioSceneLayout";

describe("SceneLayoutPanel", () => {
  it("links disabled reasons and invalid snap drafts to accessible controls", () => {
    const html = renderToStaticMarkup(
      createElement(
        StudioI18nProvider,
        null,
        createElement(SceneLayoutPanel, { layout: layoutModel() }),
      ),
    );

    expect(html).toContain("Group selection");
    expect(html).toContain('aria-describedby="layout-group-reason"');
    expect(html).toContain('id="layout-group-reason"');
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('aria-describedby="layout-snap-error"');
    expect(html).toContain('id="layout-snap-error"');
    expect(html).toContain('role="status"');
    expect(html).toContain("Entity origin");
  });

  it("disables every layout configuration control in Run while keeping status readable", () => {
    const html = renderToStaticMarkup(
      createElement(
        StudioI18nProvider,
        null,
        createElement(SceneLayoutPanel, { layout: { ...layoutModel(), editable: false } }),
      ),
    );
    const controls = html.match(/<(?:button|select|input)[^>]*data-layout-control="true"[^>]*>/g);
    expect(controls?.length).toBeGreaterThan(10);
    expect(controls?.every((control) => control.includes("disabled"))).toBe(true);
    expect(html).toContain('role="status"');
  });

  it("marks invalid duplicate offset fields and links a stable error", () => {
    const model = layoutModel();
    const html = renderToStaticMarkup(
      createElement(
        StudioI18nProvider,
        null,
        createElement(SceneLayoutPanel, {
          layout: {
            ...model,
            duplicateOffsetDraft: ["bad", "0", "0"],
            invalidDuplicateOffsetFields: [0],
            capabilities: {
              ...model.capabilities,
              duplicate: { enabled: false, reason: "invalid-offset" },
            },
          },
        }),
      ),
    );
    expect(html).toMatch(
      /aria-describedby="layout-offset-error"[^>]*aria-invalid="true"[^>]*aria-label="Duplicate offset X"/,
    );
    expect(html).toContain('id="layout-offset-error"');
  });

  it("does not present zero deltas while spatial feedback is idle", () => {
    const html = renderToStaticMarkup(
      createElement(
        StudioI18nProvider,
        null,
        createElement(SceneLayoutPanel, { layout: layoutModel() }),
      ),
    );
    expect(html).not.toContain("0.000 / 0.000 / 0.000");
    expect(html).toContain("Unavailable");
  });
});

function layoutModel(): StudioSceneLayout {
  const disabled = { enabled: false, reason: "selection-required" } as const;
  return {
    editable: true,
    primaryTransformEditable: false,
    documentEntities: [
      {
        id: "entity-a",
        type: "asset",
        assetId: "asset",
        parentId: null,
        name: "Press",
        visible: true,
        locked: false,
        transform: {
          position: [0, 0, 0],
          rotation: [0, 0, 0, 1],
          scale: [1, 1, 1],
        },
        metadata: {},
      },
    ],
    selectedEntityIds: [],
    primaryEntityId: null,
    activeTool: "translate",
    transformSettings: DISABLED_TRANSFORM_SETTINGS,
    axis: "x",
    alignAnchor: "center",
    reparentTargetId: null,
    duplicateOffsetDraft: ["1", "0", "0"],
    invalidDuplicateOffsetFields: [],
    transformSettingsDraft: {
      translationSnap: "0",
      rotationSnapDegrees: "",
      scaleSnap: "",
    },
    invalidTransformFields: ["translationSnap"],
    sourceAnchor: "center",
    targetEntityId: null,
    targetAnchor: "center",
    capabilities: {
      group: disabled,
      reparent: disabled,
      align: disabled,
      distribute: disabled,
      duplicate: disabled,
      anchorSnap: disabled,
    },
    resetCapability: { enabled: false, reason: "selection-required" },
    feedback: {
      activity: "idle",
      pivotKind: "entity-origin",
      pivotWorld: null,
      activeAxis: "free",
      deltaPosition: null,
      deltaRotationRadians: null,
      deltaScale: null,
      settings: DISABLED_TRANSFORM_SETTINGS,
      sourceAnchor: null,
      targetAnchor: null,
    },
    error: null,
    setAxis: () => undefined,
    setAlignAnchor: () => undefined,
    setReparentTargetId: () => undefined,
    setDuplicateOffsetDraft: () => undefined,
    setTransformSettingsDraft: () => undefined,
    setSourceAnchor: () => undefined,
    setTargetEntityId: () => undefined,
    setTargetAnchor: () => undefined,
    groupSelection: () => undefined,
    reparentSelection: () => undefined,
    alignSelection: () => undefined,
    distributeSelection: () => undefined,
    duplicateSelection: () => undefined,
    snapToAnchor: () => undefined,
    resetSelection: () => ({ status: "unavailable" }),
    commitEntityTransform: () => ({ status: "unavailable" }),
    selectFromTree: () => undefined,
    handleSelectionChange: () => undefined,
    handleReady: () => undefined,
    handleTransformPreview: () => undefined,
    handleTransformCommit: () => undefined,
  };
}
