import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Box, FolderTree, TriangleAlert } from "lucide-react";

import { AuthoringScene, type AuthoringSceneHandle } from "@web3d/react";
import { useTheme } from "@web3d/demo-support/theme-provider";

import { AssetList } from "./features/AssetList";
import { ImportDialog } from "./features/ImportDialog";
import { ProjectMenu } from "./features/ProjectMenu";
import { SceneNameDialog, type SceneNameDialogMode } from "./features/SceneNameDialog";
import { SceneTree } from "./features/SceneTree";
import { StudioToolbar } from "./features/StudioToolbar";
import { StudioInspector } from "./features/StudioInspector";
import { ShortcutHelpDialog } from "./help/ShortcutHelpDialog";
import { useStudioDataBinding } from "./data-binding/useStudioDataBinding";
import { useStudioI18n } from "./i18n/I18nProvider";
import { useStudioSceneLayout } from "./layout/useStudioSceneLayout";
import { useStudioLightAuthoring } from "./lights/useStudioLightAuthoring";
import { studioHistoryCapabilities } from "./session/authoring-capabilities";
import { useStudioShortcuts, type StudioShortcutActions } from "./session/useStudioShortcuts";
import { useSmartAlignPreference } from "./smart-align/preference";
import { SceneSettingsDialog } from "./scene-settings/SceneSettingsDialog";
import {
  createSetSceneEnvironmentCommand,
  sceneSettingsDraft,
  sceneSettingsStateKey,
  themeBackgroundFor,
  type SceneSettingsDraft,
} from "./scene-settings/model";
import {
  closeSceneSettingsDraftPreview,
  createSceneSettingsDraftPreview,
  holdSceneSettingsPreviewUntilReady,
  releaseSceneSettingsPreviewOnReady,
  resolveSceneSettingsPreview,
  type SceneSettingsPreviewState,
} from "./scene-settings/preview-state";
import { AppSettingsDialog } from "./settings/AppSettingsDialog";
import { useStudioWorkspace } from "./workspace/useStudioWorkspace";

type LeftPanel = "scene" | "assets";

export function App() {
  const desktopViewport = useDesktopViewport();
  const { t } = useStudioI18n();
  const { theme } = useTheme();
  const workspace = useStudioWorkspace();
  const viewerRef = useRef<AuthoringSceneHandle>(null);
  const modelInputRef = useRef<HTMLInputElement>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const archiveInputRef = useRef<HTMLInputElement>(null);
  const helpButtonRef = useRef<HTMLButtonElement>(null);
  const sceneSettingsButtonRef = useRef<HTMLButtonElement>(null);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const [leftPanel, setLeftPanel] = useState<LeftPanel>("scene");
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [sceneNameDialogMode, setSceneNameDialogMode] = useState<SceneNameDialogMode | null>(null);
  const [sceneSettingsKey, setSceneSettingsKey] = useState<string | null>(null);
  const [sceneSettingsDraftValue, setSceneSettingsDraftValue] = useState<SceneSettingsDraft | null>(
    null,
  );
  const [helpOpen, setHelpOpen] = useState(false);
  const [appSettingsOpen, setAppSettingsOpen] = useState(false);
  const [lightingMenuOpen, setLightingMenuOpen] = useState(false);
  const [smartAlignEnabled, toggleSmartAlign] = useSmartAlignPreference();
  const [sceneSettingsPreview, setSceneSettingsPreview] =
    useState<SceneSettingsPreviewState | null>(null);

  const selectedEntityId = workspace.session?.primaryEntityId ?? null;
  const activeTool = workspace.session?.tool ?? "select";
  const selectedEntity =
    workspace.project?.document.entities.find((entity) => entity.id === selectedEntityId) ?? null;
  const project = workspace.project;
  const session = workspace.session;
  const history = workspace.history;
  const themeBackground = themeBackgroundFor(theme);
  const projectDocumentKey =
    project === null ? null : sceneSettingsStateKey(project.record.id, project.document.id);
  const sceneSettingsOpen = sceneSettingsKey !== null && sceneSettingsKey === projectDocumentKey;
  const resolvedSceneSettingsPreview = resolveSceneSettingsPreview(
    sceneSettingsPreview,
    projectDocumentKey,
    themeBackground,
  );
  const historyCapabilities = studioHistoryCapabilities(
    workspace.canEdit,
    history?.undoStack.length ?? 0,
    history?.redoStack.length ?? 0,
  );
  const dataBinding = useStudioDataBinding({
    document: project?.document ?? null,
    mode: session?.mode ?? "edit",
    selectedEntityId,
    execute: workspace.execute,
  });
  const sceneLayout = useStudioSceneLayout({
    projectId: project?.record.id ?? null,
    document: project?.document ?? null,
    mode: session?.mode ?? "edit",
    canEdit: workspace.canEdit,
    activeTool,
    selectedEntityIds: session?.selectedEntityIds ?? [],
    primaryEntityId: selectedEntityId,
    viewerRef,
    execute: workspace.execute,
    selectEntity: workspace.selectEntity,
    selectEntities: workspace.selectEntities,
    addDiagnostic: workspace.addDiagnostic,
  });
  const lightAuthoring = useStudioLightAuthoring({
    document: project?.document ?? null,
    mode: session?.mode ?? "edit",
    canEdit: workspace.canEdit,
    selectedEntityIds: session?.selectedEntityIds ?? [],
    primaryEntityId: selectedEntityId,
    viewerRef,
    execute: workspace.execute,
    selectEntity: workspace.selectEntity,
  });
  const openModelPicker = (): void => modelInputRef.current?.click();
  const closeSceneNameDialog = (): void => {
    setSceneNameDialogMode(null);
    requestAnimationFrame(() =>
      document.querySelector<HTMLButtonElement>(".project-menu-trigger")?.focus(),
    );
  };
  const closeSceneSettings = (): void => {
    setSceneSettingsKey(null);
    setSceneSettingsDraftValue(null);
    setSceneSettingsPreview(null);
    restoreSceneSettingsFocus();
  };
  const restoreSceneSettingsFocus = (): void => {
    requestAnimationFrame(() => sceneSettingsButtonRef.current?.focus());
  };
  const handleSceneSettingsPreview = useCallback(
    (settings: SceneSettingsDraft) => {
      if (projectDocumentKey !== null) {
        setSceneSettingsPreview(createSceneSettingsDraftPreview(projectDocumentKey, settings));
      }
    },
    [projectDocumentKey],
  );
  const closeHelp = (): void => {
    setHelpOpen(false);
    requestAnimationFrame(() => helpButtonRef.current?.focus());
  };
  const closeAppSettings = (): void => {
    setAppSettingsOpen(false);
    requestAnimationFrame(() => settingsButtonRef.current?.focus());
  };
  const openSceneSettings = (): void => {
    if (!workspace.canEdit || projectDocumentKey === null || project === null) return;
    setProjectMenuOpen(false);
    setHelpOpen(false);
    setAppSettingsOpen(false);
    setLightingMenuOpen(false);
    setSceneSettingsDraftValue(sceneSettingsDraft(project.document.environment));
    setSceneSettingsKey(projectDocumentKey);
  };

  useEffect(() => {
    const viewer = viewerRef.current;
    if (viewer === null) return;
    viewer.setTool(activeTool);
  }, [activeTool]);

  useLayoutEffect(() => {
    const title =
      project === null ? t.app.documentTitle : `${project.record.name} | ${t.app.documentTitle}`;
    document.title = title;
  }, [project, t.app.documentTitle]);

  const focusSelection = (): void => {
    if (selectedEntityId === null) return;
    void viewerRef.current?.focusEntity(selectedEntityId).catch((error: unknown) => {
      workspace.addDiagnostic(error instanceof Error ? error.message : String(error));
    });
  };
  const deleteSelection = (): void => {
    if (selectedEntityId === null) return;
    if (lightAuthoring.deleteSelection()) return;
    workspace.deleteEntity(selectedEntityId);
    workspace.selectEntity(null);
  };
  const changeMode = (mode: "edit" | "run"): void => {
    viewerRef.current?.setAuthoringMode(mode);
    if (mode === "run") viewerRef.current?.setTool("select");
    setLightingMenuOpen(false);
    workspace.setMode(mode);
  };
  const duplicateSelection = (): void => {
    if (lightAuthoring.selectionContainsLight) {
      lightAuthoring.duplicateSelection();
      return;
    }
    sceneLayout.duplicateSelection();
  };
  const shortcutActions: StudioShortcutActions = {
    "tool.select": () => workspace.setTool("select"),
    "tool.translate": () => {
      if (lightAuthoring.canUseTool("translate")) workspace.setTool("translate");
    },
    "tool.rotate": () => {
      if (lightAuthoring.canUseTool("rotate")) workspace.setTool("rotate");
    },
    "tool.scale": () => {
      if (lightAuthoring.canUseTool("scale")) workspace.setTool("scale");
    },
    "smart-align.toggle": toggleSmartAlign,
    "reset.position": () => void sceneLayout.resetSelection("position"),
    "reset.rotation": () => void sceneLayout.resetSelection("rotation"),
    "reset.scale": () => void sceneLayout.resetSelection("scale"),
    "history.undo": workspace.undo,
    "history.redo": workspace.redo,
    "selection.duplicate": duplicateSelection,
    "selection.delete": deleteSelection,
    "selection.clear": () => workspace.selectEntity(null),
    "project.save": () => void workspace.save().catch(() => undefined),
    "view.focus": focusSelection,
    "help.open": () => setHelpOpen(true),
  };
  useStudioShortcuts({
    actions: shortcutActions,
    canEdit: workspace.canEdit,
    canResetSelection: sceneLayout.resetCapability.enabled,
    hasSelection: selectedEntityId !== null,
    modalOpen:
      helpOpen ||
      appSettingsOpen ||
      lightingMenuOpen ||
      workspace.importState !== null ||
      sceneNameDialogMode !== null ||
      sceneSettingsOpen,
    viewerRef,
  });

  if (!desktopViewport) {
    return (
      <div className="studio-app">
        <div className="studio-size-gate">
          <Box size={22} />
          <strong>{t.app.sizeGate}</strong>
        </div>
      </div>
    );
  }

  return (
    <div className="studio-app">
      <StudioToolbar
        helpButtonRef={helpButtonRef}
        sceneSettingsButtonRef={sceneSettingsButtonRef}
        settingsButtonRef={settingsButtonRef}
        canEdit={workspace.canEdit}
        canDuplicate={
          lightAuthoring.selectionContainsLight
            ? lightAuthoring.duplicateEnabled
            : sceneLayout.capabilities.duplicate.enabled
        }
        canRedo={historyCapabilities.canRedo}
        canUndo={historyCapabilities.canUndo}
        duplicateDisabledReason={
          lightAuthoring.selectionContainsLight
            ? lightAuthoring.duplicateDisabledReason === "limit"
              ? t.lights.menu.reasons.limit
              : lightAuthoring.duplicateDisabledReason === "mixed-selection"
                ? t.lights.menu.reasons.mixedSelection
                : null
            : sceneLayout.capabilities.duplicate.reason === null
              ? null
              : t.layout.reasons[sceneLayout.capabilities.duplicate.reason]
        }
        exportOutdated={workspace.exportOutdated}
        hasSelection={selectedEntityId !== null}
        mode={session?.mode ?? "edit"}
        projectName={project?.record.name ?? t.app.openingProject}
        save={session?.save ?? { status: "saving", revision: 0 }}
        smartAlignEnabled={smartAlignEnabled}
        lightCount={lightAuthoring.lightCount}
        lightingMenuOpen={lightingMenuOpen}
        lightAddDisabledReason={
          lightAuthoring.addDisabledReason === null
            ? null
            : lightAuthoring.addDisabledReason === "not-ready"
              ? t.lights.menu.reasons.notReady
              : t.lights.menu.reasons[lightAuthoring.addDisabledReason]
        }
        lightSettingsDisabledReason={
          lightAuthoring.settingsDisabled ? t.lights.menu.reasons.run : null
        }
        toolDisabledReasons={Object.fromEntries(
          (["translate", "rotate", "scale"] as const)
            .filter((tool) => !lightAuthoring.canUseTool(tool))
            .map((tool) => [tool, t.lights.menu.reasons.unsupportedTool]),
        )}
        tool={activeTool}
        onDelete={deleteSelection}
        onDuplicate={duplicateSelection}
        onExport={() => void workspace.exportArchive()}
        onImport={openModelPicker}
        onModeChange={changeMode}
        onOpenProjectMenu={() => {
          setLightingMenuOpen(false);
          setProjectMenuOpen((open) => !open);
        }}
        onOpenHelp={() => {
          setProjectMenuOpen(false);
          setAppSettingsOpen(false);
          setLightingMenuOpen(false);
          setHelpOpen(true);
        }}
        onOpenSceneSettings={openSceneSettings}
        onOpenSettings={() => {
          setProjectMenuOpen(false);
          setHelpOpen(false);
          setLightingMenuOpen(false);
          setSceneSettingsKey(null);
          setSceneSettingsDraftValue(null);
          setSceneSettingsPreview(closeSceneSettingsDraftPreview);
          setAppSettingsOpen(true);
        }}
        onToggleSmartAlign={toggleSmartAlign}
        onAddLight={lightAuthoring.add}
        onLightingMenuOpenChange={setLightingMenuOpen}
        onRefreshLightAvailability={lightAuthoring.refreshCreationAvailability}
        onRedo={workspace.redo}
        onSave={() => void workspace.save().catch(() => undefined)}
        onToolChange={(tool) => {
          if (lightAuthoring.canUseTool(tool)) workspace.setTool(tool);
        }}
        onUndo={workspace.undo}
      />

      {projectMenuOpen && project !== null && (
        <ProjectMenu
          canRename={workspace.canEdit}
          currentProjectId={project.record.id}
          recent={workspace.recent.map((item) => ({
            id: item.id,
            name: item.name,
            revision: item.lastSavedRevision,
            updatedAt: item.updatedAt,
          }))}
          onClose={() => setProjectMenuOpen(false)}
          onDelete={(projectId) => void workspace.deleteProject(projectId)}
          onExportJson={() => {
            setProjectMenuOpen(false);
            void workspace.exportJson();
          }}
          onImportArchive={() => {
            setProjectMenuOpen(false);
            archiveInputRef.current?.click();
          }}
          onImportJson={() => {
            setProjectMenuOpen(false);
            jsonInputRef.current?.click();
          }}
          onNew={() => {
            setProjectMenuOpen(false);
            setSceneNameDialogMode("create");
          }}
          onRename={() => {
            setProjectMenuOpen(false);
            setSceneNameDialogMode("rename");
          }}
          onOpen={(projectId) => {
            setProjectMenuOpen(false);
            void workspace.openProject(projectId);
          }}
        />
      )}

      <main className="studio-workspace">
        <aside className="studio-left" aria-label={t.app.navigationLabel}>
          <div className="panel-tabs">
            <button
              className={leftPanel === "scene" ? "is-active" : ""}
              type="button"
              onClick={() => setLeftPanel("scene")}
            >
              <FolderTree size={14} /> {t.app.sourceSummary.sceneTab}
            </button>
            <button
              className={leftPanel === "assets" ? "is-active" : ""}
              type="button"
              onClick={() => setLeftPanel("assets")}
            >
              <Box size={14} /> {t.app.sourceSummary.assetsTab}
            </button>
          </div>
          {leftPanel === "scene" ? (
            <SceneTree
              editable={workspace.canEdit}
              entities={project?.document.entities ?? []}
              primaryEntityId={session?.primaryEntityId ?? null}
              selectedEntityIds={session?.selectedEntityIds ?? []}
              onLockChange={(entityId, locked) =>
                lightAuthoring.updateLock(entityId, locked) ||
                workspace.execute({ type: "set-entity-lock", entityId, locked })
              }
              onSelect={sceneLayout.selectFromTree}
              onVisibilityChange={(entityId, visible) =>
                lightAuthoring.updateVisibility(entityId, visible) ||
                workspace.execute({ type: "set-entity-visibility", entityId, visible })
              }
            />
          ) : (
            <AssetList
              assets={project?.document.assets ?? []}
              editable={workspace.canEdit}
              onImport={openModelPicker}
            />
          )}
          <div className="source-summary">
            <span className="status-dot" />
            <span>
              <strong>
                {session?.mode === "run"
                  ? t.app.sourceSummary.runMode
                  : t.app.sourceSummary.localProject}
              </strong>
              <small
                data-revision={project?.document.revision ?? 0}
                data-testid="document-revision"
              >
                {t.app.sourceSummary.revision(project?.document.revision ?? 0)}
              </small>
            </span>
          </div>
        </aside>

        <section className="studio-viewport" aria-label={t.app.viewport.label}>
          {workspace.loading || project === null ? (
            <div className="viewport-loading">{t.app.openingLocalProject}</div>
          ) : (
            <AuthoringScene
              ref={viewerRef}
              adapters={dataBinding.adapters}
              backgroundPreview={resolvedSceneSettingsPreview?.background ?? null}
              authoringMode={session?.mode ?? "edit"}
              dataRuntimeEnabled={session?.mode === "run"}
              canvasLabel={t.app.viewport.canvasLabel}
              assetResolver={workspace.assetResolver}
              className="studio-viewer"
              initialTool={activeTool}
              gridPreview={resolvedSceneSettingsPreview?.grid ?? null}
              key={project.record.id}
              primaryEntityId={session?.primaryEntityId ?? null}
              selectedEntityIds={session?.selectedEntityIds ?? []}
              smartAlignEnabled={smartAlignEnabled}
              source={project.document}
              lightingPreview={resolvedSceneSettingsPreview?.lighting ?? null}
              themeBackground={themeBackground}
              transformSettings={sceneLayout.transformSettings}
              onDiagnostic={(diagnostic) =>
                workspace.addDiagnostic(`${diagnostic.code} ${diagnostic.message}`)
              }
              onEvent={dataBinding.handleViewerEvent}
              onReady={(event) => {
                setSceneSettingsPreview((current) =>
                  releaseSceneSettingsPreviewOnReady(
                    current,
                    sceneSettingsStateKey(project.record.id, event.documentId),
                    event.revision,
                  ),
                );
                const viewer = viewerRef.current;
                if (viewer === null) return;
                viewer.setTool(activeTool);
                lightAuthoring.refreshCreationAvailability();
                sceneLayout.handleReady();
              }}
              onSelectionChange={sceneLayout.handleSelectionChange}
              onTransformPreview={(event) => {
                if (!lightAuthoring.handleTransformPreview(event)) {
                  sceneLayout.handleTransformPreview(event);
                }
              }}
              onTransformCommit={(event) => {
                if (!lightAuthoring.handleTransformCommit(event)) {
                  sceneLayout.handleTransformCommit(event);
                }
              }}
            />
          )}
          <div className="viewport-mode mono" data-testid="viewport-mode">
            {t.app.viewport.modeStatus[session?.mode ?? "edit"]} /{" "}
            {t.app.viewport.toolStatus[activeTool]} /{" "}
            {selectedEntityId ?? t.app.viewport.noSelection}
          </div>
        </section>

        {project !== null && (
          <StudioInspector
            document={project.document}
            projectId={project.record.id}
            editable={workspace.canEdit}
            entity={selectedEntity}
            execute={workspace.execute}
            layout={sceneLayout}
            mode={session?.mode ?? "edit"}
            preview={dataBinding.preview}
            selectedEntityId={selectedEntityId}
            targetResolution={dataBinding.targetResolution}
            onFocusTarget={(targetId) => {
              const entityId = project.document.targets.find(
                (target) => target.id === targetId,
              )?.entityId;
              if (entityId === undefined) return;
              workspace.selectEntity(entityId);
              void viewerRef.current?.focusEntity(entityId).catch((error: unknown) => {
                workspace.addDiagnostic(error instanceof Error ? error.message : String(error));
              });
            }}
            onRename={(entityId, name) =>
              workspace.execute({ type: "rename-entity", entityId, name })
            }
          />
        )}

        {workspace.diagnostics.length > 0 && (
          <section className="studio-diagnostics" aria-label={t.app.diagnostics.label}>
            <div className="diagnostics-title">
              <TriangleAlert size={14} /> {t.app.diagnostics.label}
              <span>{workspace.diagnostics.length}</span>
            </div>
            <div className="diagnostics-stream mono">{workspace.diagnostics.join(" · ")}</div>
          </section>
        )}
      </main>

      {workspace.importState !== null && (
        <ImportDialog
          state={workspace.importState}
          onCancel={workspace.closeImport}
          onConfirm={() => void workspace.confirmImport()}
        />
      )}

      {sceneNameDialogMode !== null && project !== null && (
        <SceneNameDialog
          initialName={sceneNameDialogMode === "rename" ? project.document.name : ""}
          key={sceneNameDialogMode}
          mode={sceneNameDialogMode}
          onCancel={closeSceneNameDialog}
          onConfirm={async (name) => {
            if (sceneNameDialogMode === "create") {
              const created = await workspace.createProject(name);
              if (created) closeSceneNameDialog();
              return created;
            }
            workspace.renameProject(name);
            closeSceneNameDialog();
            return true;
          }}
        />
      )}

      {sceneSettingsOpen && project !== null && sceneSettingsDraftValue !== null && (
        <SceneSettingsDialog
          draft={sceneSettingsDraftValue}
          initialTab="lighting"
          key={projectDocumentKey ?? undefined}
          onApply={(settings) => {
            const outcome = workspace.execute(
              createSetSceneEnvironmentCommand(project.document.environment, settings),
            );
            if (outcome.status === "rejected" || outcome.status === "unavailable") return false;
            if (outcome.status === "changed") {
              setSceneSettingsKey(null);
              setSceneSettingsDraftValue(null);
              setSceneSettingsPreview(
                holdSceneSettingsPreviewUntilReady(
                  sceneSettingsStateKey(project.record.id, project.document.id),
                  settings,
                  outcome.revision,
                ),
              );
              restoreSceneSettingsFocus();
            } else {
              closeSceneSettings();
            }
            return true;
          }}
          onCancel={closeSceneSettings}
          onDraftChange={setSceneSettingsDraftValue}
          onPreview={handleSceneSettingsPreview}
        />
      )}

      {helpOpen && <ShortcutHelpDialog onClose={closeHelp} />}
      {appSettingsOpen && <AppSettingsDialog onClose={closeAppSettings} />}

      <input
        ref={modelInputRef}
        hidden
        accept=".glb,.gltf,model/gltf-binary,model/gltf+json"
        data-testid="model-file-input"
        type="file"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (file !== undefined) void workspace.inspectModel(file);
        }}
      />
      <input
        ref={jsonInputRef}
        hidden
        accept=".json,application/json"
        data-testid="json-file-input"
        type="file"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (file !== undefined) void workspace.importJson(file);
        }}
      />
      <input
        ref={archiveInputRef}
        hidden
        accept=".zip,application/zip"
        data-testid="archive-file-input"
        type="file"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (file !== undefined) void workspace.importArchive(file);
        }}
      />
    </div>
  );
}

function useDesktopViewport(): boolean {
  const query = "(min-width: 1280px)";
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const media = window.matchMedia(query);
    const update = (): void => setMatches(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return matches;
}
