// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "@web3d/demo-support/theme-provider";
import type { AuthoringSceneHandle } from "@web3d/react";

import { StudioI18nProvider } from "./i18n/I18nProvider";
import type { StudioSceneLayout } from "./layout/useStudioSceneLayout";
import type { AuthoringTool, StudioMode } from "./session/session-state";
import { SMART_ALIGN_PREFERENCE_KEY } from "./smart-align/preference";

type TestCommandOutcome =
  | { readonly status: "changed"; readonly revision: number }
  | { readonly status: "unchanged"; readonly revision: number };

interface TestReadyEvent {
  readonly type: "ready";
  readonly documentId: string;
  readonly revision: number;
}

const harness = vi.hoisted(() => ({
  authoringReady: undefined as ((event: TestReadyEvent) => void) | undefined,
  authoringSceneMounts: 0,
  authoringSceneRenders: [] as Array<string | null | undefined>,
  gridRenders: [] as Array<boolean | null | undefined>,
  lightingRenders: [] as Array<unknown>,
  smartAlignRenders: [] as Array<boolean | undefined>,
  viewerCalls: [] as string[],
  workspace: {
    loading: false,
    project: {
      record: {
        id: "project-a",
        name: "Project A",
        createdAt: "2026-07-16T00:00:00.000Z",
        updatedAt: "2026-07-16T00:00:00.000Z",
        lastOpenedAt: "2026-07-16T00:00:00.000Z",
        lastSavedRevision: 1,
        lastExportedRevision: null,
      },
      document: {
        schemaVersion: "1.3.0" as const,
        id: "scene-a",
        name: "Project A",
        revision: 1,
        assets: [],
        entities: [],
        targets: [],
        dataSources: [],
        bindings: [],
        ruleSets: [],
        annotations: [],
        views: [],
        environment: {
          backgroundMode: "theme" as const,
          background: "#F4F6F5",
          grid: true,
          unit: "m" as const,
          upAxis: "Y" as const,
          lighting: {
            fill: { skyColor: "#FFFFFF", groundColor: "#65706A", intensity: 1.8 },
            key: {
              color: "#FFFFFF",
              intensity: 2.2,
              directionToLight: [
                0.37904902178945177, 0.7580980435789035, 0.5306686305052324,
              ] as const,
            },
          },
        },
      },
      assets: [],
    },
    history: { document: null, undoStack: [], redoStack: [] },
    session: {
      mode: "edit" as StudioMode,
      tool: "select" as AuthoringTool,
      selectedEntityIds: [],
      primaryEntityId: null,
      save: { status: "saved" as const, revision: 1 },
    },
    recent: [],
    diagnostics: [] as string[],
    importState: null,
    assetResolver: { resolve: vi.fn() },
    dirty: false,
    exportOutdated: false,
    canEdit: true,
    execute: vi.fn<(_command: unknown) => TestCommandOutcome>(() => ({
      status: "unchanged",
      revision: 1,
    })),
    undo: vi.fn(),
    redo: vi.fn(),
    save: vi.fn(async () => undefined),
    setMode: vi.fn((mode: "edit" | "run") => harness.viewerCalls.push(`mode:${mode}`)),
    setTool: vi.fn(),
    selectEntity: vi.fn(),
    selectEntities: vi.fn(),
    deleteEntity: vi.fn(),
    inspectModel: vi.fn(async () => undefined),
    confirmImport: vi.fn(async () => undefined),
    closeImport: vi.fn(),
    createProject: vi.fn(async () => true),
    renameProject: vi.fn(),
    openProject: vi.fn(async () => undefined),
    deleteProject: vi.fn(async () => undefined),
    importJson: vi.fn(async () => undefined),
    importArchive: vi.fn(async () => undefined),
    exportJson: vi.fn(async () => undefined),
    exportArchive: vi.fn(async () => undefined),
    addDiagnostic: vi.fn(),
  },
}));

vi.mock("@web3d/react", async () => {
  const React = await import("react");
  return {
    AuthoringScene: React.forwardRef(function MockAuthoringScene(
      props: {
        readonly backgroundPreview?: string | null;
        readonly gridPreview?: boolean | null;
        readonly lightingPreview?: unknown;
        readonly smartAlignEnabled?: boolean;
        readonly onReady?: (event: TestReadyEvent) => void;
      },
      ref: React.ForwardedRef<AuthoringSceneHandle>,
    ) {
      const handle = React.useMemo<AuthoringSceneHandle>(
        () => ({
          selectEntity: vi.fn(),
          selectEntities: vi.fn(),
          focusEntity: vi.fn(async () => undefined),
          getLightCreationFrame: () => ({ position: [0, 2, 0], target: [0, 0, 0] }),
          setAuthoringMode: (mode: "edit" | "run") => harness.viewerCalls.push(`authoring:${mode}`),
          setTool: (tool) => harness.viewerCalls.push(`tool:${tool}`),
          getTool: () => "select",
          isTransformDragging: () => false,
          setTransformSettings: vi.fn(),
          setSmartAlignEnabled: vi.fn(),
          getEntitySpatialSnapshots: () => [],
          setDataRuntimeEnabled: vi.fn(async () => undefined),
          setThemeBackground: vi.fn(),
          setBackgroundPreview: vi.fn(),
          setGridPreview: vi.fn(),
          setLightingPreview: vi.fn(),
          setView: vi.fn(async () => undefined),
          getSnapshot: vi.fn(),
        }),
        [],
      );
      React.useImperativeHandle(ref, () => handle, [handle]);
      React.useEffect(() => {
        harness.authoringSceneMounts += 1;
      }, []);
      harness.authoringReady = props.onReady;
      harness.authoringSceneRenders.push(props.backgroundPreview);
      harness.gridRenders.push(props.gridPreview);
      harness.lightingRenders.push(props.lightingPreview);
      harness.smartAlignRenders.push(props.smartAlignEnabled);
      return React.createElement("div", { "data-authoring-scene": true });
    }),
  };
});

vi.mock("./workspace/useStudioWorkspace", () => ({
  useStudioWorkspace: () => harness.workspace,
}));

vi.mock("./data-binding/useStudioDataBinding", () => ({
  useStudioDataBinding: () => ({
    adapters: {},
    preview: { active: false, connections: {}, values: {}, alarms: [], diagnostics: [] },
    targetResolution: { status: "no-selection" },
    handleViewerEvent: vi.fn(),
  }),
}));

vi.mock("./layout/useStudioSceneLayout", () => {
  const disabled = { enabled: false, reason: "selection-required" } as const;
  const layout = {
    editable: true,
    primaryTransformEditable: false,
    documentEntities: [],
    selectedEntityIds: [],
    primaryEntityId: null,
    activeTool: "select",
    transformSettings: { translationSnap: null, rotationSnapRadians: null, scaleSnap: null },
    axis: "x",
    alignAnchor: "center",
    reparentTargetId: null,
    duplicateOffsetDraft: ["1", "0", "0"],
    invalidDuplicateOffsetFields: [],
    transformSettingsDraft: {
      translationSnap: "",
      rotationSnapDegrees: "",
      scaleSnap: "",
    },
    invalidTransformFields: [],
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
    resetCapability: disabled,
    feedback: {
      activity: "idle",
      pivotKind: "entity-origin",
      pivotWorld: null,
      activeAxis: "free",
      deltaPosition: null,
      deltaRotationRadians: null,
      deltaScale: null,
      settings: { translationSnap: null, rotationSnapRadians: null, scaleSnap: null },
      sourceAnchor: null,
      targetAnchor: null,
    },
    error: null,
    setAxis: vi.fn(),
    setAlignAnchor: vi.fn(),
    setReparentTargetId: vi.fn(),
    setDuplicateOffsetDraft: vi.fn(),
    setTransformSettingsDraft: vi.fn(),
    setSourceAnchor: vi.fn(),
    setTargetEntityId: vi.fn(),
    setTargetAnchor: vi.fn(),
    groupSelection: vi.fn(),
    reparentSelection: vi.fn(),
    alignSelection: vi.fn(),
    distributeSelection: vi.fn(),
    duplicateSelection: vi.fn(),
    snapToAnchor: vi.fn(),
    resetSelection: vi.fn(() => ({ status: "unavailable" as const })),
    commitEntityTransform: vi.fn(() => ({ status: "unavailable" as const })),
    selectFromTree: vi.fn(),
    handleSelectionChange: vi.fn(),
    handleReady: vi.fn(),
    handleTransformPreview: vi.fn(),
    handleTransformCommit: vi.fn(),
  } satisfies StudioSceneLayout;
  return { useStudioSceneLayout: () => layout };
});

vi.mock("./features/SceneTree", () => ({ SceneTree: () => null }));
vi.mock("./features/AssetList", () => ({ AssetList: () => null }));
vi.mock("./features/StudioInspector", () => ({ StudioInspector: () => null }));
vi.mock("./features/ImportDialog", () => ({ ImportDialog: () => null }));

import { App } from "./App";

describe("App scene settings preview", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    harness.authoringReady = undefined;
    harness.authoringSceneMounts = 0;
    harness.authoringSceneRenders.length = 0;
    harness.gridRenders.length = 0;
    harness.lightingRenders.length = 0;
    harness.smartAlignRenders.length = 0;
    harness.viewerCalls.length = 0;
    harness.workspace.execute.mockReset();
    harness.workspace.execute.mockReturnValue({ status: "unchanged", revision: 1 });
    harness.workspace.canEdit = true;
    harness.workspace.session.mode = "edit";
    harness.workspace.session.tool = "select";
    localStorage.clear();
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
    );
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("does not loop when the settings dialog reports its initial preview", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    act(() => {
      root.render(
        createElement(ThemeProvider, {
          storageKey: "app-preview-test-theme",
          children: createElement(StudioI18nProvider, null, createElement(App)),
        }),
      );
    });

    const beforeOpen = harness.authoringSceneRenders.length;
    expect(() => {
      act(() => button("Lighting").click());
      act(() => buttonByVisibleName("Scene lighting settings").click());
    }).not.toThrow();

    expect(consoleError.mock.calls.flat().join(" ")).not.toContain("Maximum update depth exceeded");
    expect(harness.authoringSceneRenders.length - beforeOpen).toBeLessThan(8);
    expect(container.querySelector('[role="dialog"]')?.getAttribute("aria-label")).toBe(
      "Scene settings",
    );
  });

  it("applies one concrete environment command and holds every preview until ready", () => {
    renderApp();
    openSceneSettings();
    checkInput(input("Custom color"), true);
    changeInput(input("Background color"), "#336699");
    checkInput(inputByText("Show grid"), false);
    act(() => tab("Lighting").click());
    act(() => buttonByVisibleName("Contrast").click());
    harness.workspace.execute.mockReturnValueOnce({ status: "changed", revision: 2 });

    act(() =>
      container
        .querySelector<HTMLFormElement>("form")!
        .dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true })),
    );
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(harness.authoringSceneRenders.at(-1)).toBe("#336699");
    expect(harness.gridRenders.at(-1)).toBe(false);
    expect(harness.lightingRenders.at(-1)).toMatchObject({
      fill: { skyColor: "#DDE7E3", groundColor: "#3D4743", intensity: 0.9 },
      key: { color: "#FFF1D6", intensity: 3 },
    });
    expect(harness.workspace.execute).toHaveBeenCalledWith({
      type: "set-scene-environment",
      before: harness.workspace.project.document.environment,
      after: {
        ...harness.workspace.project.document.environment,
        backgroundMode: "custom",
        background: "#336699",
        grid: false,
        lighting: expect.objectContaining({
          fill: expect.objectContaining({ intensity: 0.9 }),
          key: expect.objectContaining({ intensity: 3 }),
        }),
      },
    });
    const executedCommand: unknown = harness.workspace.execute.mock.calls[0]?.[0];
    expect(executedCommand).not.toHaveProperty("preset");

    act(() => harness.authoringReady?.({ type: "ready", documentId: "scene-a", revision: 1 }));
    expect(harness.authoringSceneRenders.at(-1)).toBe("#336699");
    expect(harness.gridRenders.at(-1)).toBe(false);
    expect(harness.lightingRenders.at(-1)).not.toBeNull();

    act(() => harness.authoringReady?.({ type: "ready", documentId: "scene-a", revision: 3 }));
    expect(harness.authoringSceneRenders.at(-1)).toBeNull();
    expect(harness.gridRenders.at(-1)).toBeNull();
    expect(harness.lightingRenders.at(-1)).toBeNull();
  });

  it("keeps an applied preview while application Settings opens before matching ready", () => {
    renderApp();
    openSceneSettings();
    act(() => tab("Appearance").click());
    checkInput(input("Custom color"), true);
    changeInput(input("Background color"), "#336699");
    harness.workspace.execute.mockReturnValueOnce({ status: "changed", revision: 2 });

    act(() =>
      container
        .querySelector<HTMLFormElement>("form")!
        .dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true })),
    );
    act(() => button("Settings").click());
    expect(container.querySelector('[role="dialog"]')?.getAttribute("aria-label")).toBe("Settings");
    expect(harness.authoringSceneRenders.at(-1)).toBe("#336699");

    act(() => harness.authoringReady?.({ type: "ready", documentId: "scene-a", revision: 1 }));
    expect(harness.authoringSceneRenders.at(-1)).toBe("#336699");
    act(() => harness.authoringReady?.({ type: "ready", documentId: "scene-a", revision: 2 }));
    expect(harness.authoringSceneRenders.at(-1)).toBeNull();
  });

  it("renders Diagnostics only when a real message exists", () => {
    harness.workspace.diagnostics = ["ASSET_LOAD_FAILED Missing asset bytes"];
    renderApp();

    expect(container.querySelector(".diagnostics-title span")?.textContent).toBe("1");
    expect(container.querySelector(".diagnostics-stream")?.textContent).toBe(
      "ASSET_LOAD_FAILED Missing asset bytes",
    );
    harness.workspace.diagnostics = [];
    renderApp();
    expect(container.querySelector(".studio-diagnostics")).toBeNull();
  });

  it("synchronously selects the runtime tool before entering Run without recreating the Viewer", () => {
    harness.workspace.session.tool = "translate";
    renderApp();
    harness.viewerCalls.length = 0;

    act(() => buttonByVisibleName("Run").click());

    expect(harness.viewerCalls).toEqual(["authoring:run", "tool:select", "mode:run"]);
    expect(harness.authoringSceneMounts).toBe(1);
    harness.workspace.session.tool = "select";
  });

  it("drives Viewer, toolbar and exact S from one persistent preference without resetting in Run", () => {
    renderApp();
    expect(harness.smartAlignRenders.at(-1)).toBe(true);
    const smartAlign = button("Smart Align (S)");
    expect(smartAlign.getAttribute("aria-pressed")).toBe("true");

    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "s", bubbles: true })));
    expect(harness.smartAlignRenders.at(-1)).toBe(false);
    expect(localStorage.getItem(SMART_ALIGN_PREFERENCE_KEY)).toBe("false");

    harness.workspace.canEdit = false;
    harness.workspace.session.mode = "run";
    renderApp();
    expect(button("Smart Align (S)").disabled).toBe(true);
    expect(button("Smart Align (S)").getAttribute("aria-pressed")).toBe("false");
    expect(localStorage.getItem(SMART_ALIGN_PREFERENCE_KEY)).toBe("false");
    harness.workspace.canEdit = true;
    harness.workspace.session.mode = "edit";
  });

  function renderApp(): void {
    act(() => {
      root.render(
        createElement(ThemeProvider, {
          storageKey: "app-preview-test-theme",
          children: createElement(StudioI18nProvider, null, createElement(App)),
        }),
      );
    });
  }

  function openSceneSettings(): void {
    act(() => button("Lighting").click());
    act(() => buttonByVisibleName("Scene lighting settings").click());
  }

  function input(label: string): HTMLInputElement {
    return container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
  }

  function inputByText(label: string): HTMLInputElement {
    const candidate = [...container.querySelectorAll<HTMLLabelElement>("label")].find(
      (element) => element.textContent?.trim() === label,
    );
    return candidate?.querySelector("input") as HTMLInputElement;
  }

  function tab(name: string): HTMLButtonElement {
    const candidate = [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
      (element) => element.textContent?.trim() === name,
    );
    if (candidate === undefined) throw new Error(`Tab '${name}' was not found.`);
    return candidate;
  }

  function button(label: string): HTMLButtonElement {
    return container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
  }

  function buttonByVisibleName(name: string): HTMLButtonElement {
    const match = [
      ...container.querySelectorAll<HTMLButtonElement>('button:not([aria-hidden="true"])'),
    ]
      .filter((candidate) => candidate.getAttribute("role") !== "presentation")
      .find((candidate) => candidate.textContent?.trim() === name);
    if (match === undefined) throw new Error(`Button with visible name '${name}' was not found.`);
    return match;
  }

  function changeInput(element: HTMLInputElement, value: string): void {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (setter === undefined) throw new Error("HTMLInputElement value setter is unavailable.");
    act(() => {
      setter.call(element, value);
      element.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  function checkInput(element: HTMLInputElement, checked: boolean): void {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "checked")?.set;
    if (setter === undefined) throw new Error("HTMLInputElement checked setter is unavailable.");
    act(() => {
      setter.call(element, !checked);
      element.click();
    });
  }
});
