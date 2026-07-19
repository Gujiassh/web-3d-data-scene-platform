// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "@web3d/demo-support/theme-provider";

const workspace = vi.hoisted(() => ({
  loading: true,
  project: null,
  session: null,
  history: null,
  canEdit: false,
  recent: [],
  diagnostics: [],
  importState: null,
  dirty: false,
  exportOutdated: false,
  assetResolver: { resolve: vi.fn() },
  execute: vi.fn(() => ({ status: "unavailable" as const })),
  selectEntity: vi.fn(),
  selectEntities: vi.fn(),
  addDiagnostic: vi.fn(),
  setTool: vi.fn(),
  save: vi.fn(async () => undefined),
  undo: vi.fn(),
  redo: vi.fn(),
  setMode: vi.fn(),
  deleteEntity: vi.fn(),
}));

vi.mock("../workspace/useStudioWorkspace", () => ({ useStudioWorkspace: () => workspace }));
vi.mock("../data-binding/useStudioDataBinding", () => ({
  useStudioDataBinding: () => ({
    adapters: {},
    preview: { active: false, connections: {}, values: {}, alarms: [], diagnostics: [] },
    targetResolution: { status: "no-selection" },
    handleViewerEvent: vi.fn(),
  }),
}));
vi.mock("../layout/useStudioSceneLayout", () => ({
  useStudioSceneLayout: () => ({
    resetCapability: { enabled: false, reason: "selection-required" },
    capabilities: { duplicate: { enabled: false, reason: "selection-required" } },
    transformSettings: { translationSnap: null, rotationSnapRadians: null, scaleSnap: null },
    duplicateSelection: vi.fn(),
    resetSelection: vi.fn(),
    selectFromTree: vi.fn(),
    handleReady: vi.fn(),
    handleSelectionChange: vi.fn(),
    handleTransformPreview: vi.fn(),
    handleTransformCommit: vi.fn(),
  }),
}));
vi.mock("../lights/useStudioLightAuthoring", () => ({
  useStudioLightAuthoring: () => ({
    lightCount: 0,
    addDisabledReason: null,
    selectionContainsLight: false,
    previewCancellation: null,
    clearPreview: vi.fn(),
    canUseTool: vi.fn(() => false),
    deleteSelection: vi.fn(() => false),
    duplicateSelection: vi.fn(),
    updateLock: vi.fn(() => false),
    updateVisibility: vi.fn(() => false),
    refreshCreationAvailability: vi.fn(),
    handleReady: vi.fn(),
    handleTransformPreview: vi.fn(() => false),
    handleTransformCommit: vi.fn(() => false),
  }),
}));
vi.mock("../settings/useStudioSettingsDialog", () => ({
  useStudioSettingsDialog: () => ({
    open: false,
    preview: null,
    previewCancellation: null,
    clearScenePreview: vi.fn(),
    closeDialog: vi.fn(),
  }),
}));
vi.mock("../session/useStudioShortcuts", () => ({ useStudioShortcuts: vi.fn() }));
vi.mock("../smart-align/preference", () => ({ useSmartAlignPreference: () => [true, vi.fn()] }));

import { App } from "../App";
import { StudioI18nProvider } from "../i18n/I18nProvider";

describe("App trusted hotspot content catalog", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    localStorage.clear();
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
    );
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    localStorage.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it.each([{ locale: "en" }, { locale: "zh-CN" }] as const)(
    "renders the App with an empty host-owned catalog in $locale",
    ({ locale }) => {
      localStorage.setItem("web3d.studio.locale", locale);
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
      expect(() => {
        act(() =>
          root.render(
            createElement(ThemeProvider, {
              storageKey: "hotspot-app-catalog-theme",
              children: createElement(StudioI18nProvider, null, createElement(App)),
            }),
          ),
        );
      }).not.toThrow();
      expect(consoleError).not.toHaveBeenCalled();
      expect(document.documentElement.lang).toBe(locale);
    },
  );
});
