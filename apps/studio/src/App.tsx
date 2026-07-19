import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Box, FolderTree, MapPin, TriangleAlert } from "lucide-react";

import { AuthoringScene, type AuthoringSceneHandle } from "@web3d/react";
import type { PublishSurfaceEvidence } from "@web3d/publish";
import { useTheme } from "@web3d/demo-support/theme-provider";

import { AssetList } from "./features/AssetList";
import { ImportDialog } from "./features/ImportDialog";
import { ProjectMenu } from "./features/ProjectMenu";
import { SceneNameDialog, type SceneNameDialogMode } from "./features/SceneNameDialog";
import { SceneTree } from "./features/SceneTree";
import { StudioToolbar } from "./features/StudioToolbar";
import { StudioInspector } from "./features/StudioInspector";
import { syncStudioThemeColor } from "./branding/theme-color";
import { ShortcutHelpDialog } from "./help/ShortcutHelpDialog";
import { HotspotInspector } from "./hotspots/HotspotInspector";
import { HotspotPopover } from "./hotspots/HotspotPopover";
import { HotspotRunContent } from "./hotspots/HotspotRunContent";
import { HotspotsPanel } from "./hotspots/HotspotsPanel";
import { HotspotTitleEditor } from "./hotspots/HotspotTitleEditor";
import { hotspotStatusMessage } from "./hotspots/hotspotStatus";
import type { TrustedHotspotContentItem } from "./hotspots/trustedContentCatalog";
import { useStudioHotspots } from "./hotspots/useStudioHotspots";
import { PublishDialog, type PublishDialogState } from "./publish/PublishDialog";
import { useStudioDataBinding } from "./data-binding/useStudioDataBinding";
import { useStudioI18n } from "./i18n/I18nProvider";
import { useStudioSceneLayout } from "./layout/useStudioSceneLayout";
import { useStudioLightAuthoring } from "./lights/useStudioLightAuthoring";
import { studioHistoryCapabilities } from "./session/authoring-capabilities";
import { useStudioShortcuts, type StudioShortcutActions } from "./session/useStudioShortcuts";
import { useSmartAlignPreference } from "./smart-align/preference";
import { themeBackgroundFor } from "./scene-settings/model";
import { StudioSettingsDialog } from "./settings/StudioSettingsDialog";
import { useStudioSettingsDialog } from "./settings/useStudioSettingsDialog";
import { useStudioWorkspace } from "./workspace/useStudioWorkspace";

type LeftPanel = "scene" | "assets" | "hotspots";

export interface StudioAppProps {
  readonly trustedHotspotContentCatalog?: readonly TrustedHotspotContentItem[];
}

export function App({ trustedHotspotContentCatalog }: StudioAppProps = {}) {
  const desktopViewport = useDesktopViewport();
  const { locale, t } = useStudioI18n();
  const { theme } = useTheme();
  const workspace = useStudioWorkspace();
  const viewerRef = useRef<AuthoringSceneHandle>(null);
  const modelInputRef = useRef<HTMLInputElement>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const archiveInputRef = useRef<HTMLInputElement>(null);
  const helpButtonRef = useRef<HTMLButtonElement>(null);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const publishAbortRef = useRef<AbortController | null>(null);
  const [leftPanel, setLeftPanel] = useState<LeftPanel>("scene");
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [sceneNameDialogMode, setSceneNameDialogMode] = useState<SceneNameDialogMode | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [lightingMenuOpen, setLightingMenuOpen] = useState(false);
  const [publishState, setPublishState] = useState<PublishDialogState | null>(null);
  const [smartAlignEnabled, toggleSmartAlign] = useSmartAlignPreference();

  const selectedEntityId = workspace.session?.primaryEntityId ?? null;
  const activeTool = workspace.session?.tool ?? "select";
  const selectedEntity =
    workspace.project?.document.entities.find((entity) => entity.id === selectedEntityId) ?? null;
  const project = workspace.project;
  const session = workspace.session;
  const history = workspace.history;
  const themeBackground = themeBackgroundFor(theme);
  const restoreSettingsFocus = (): void => {
    requestAnimationFrame(() => settingsButtonRef.current?.focus());
  };
  const settings = useStudioSettingsDialog({
    projectId: project?.record.id ?? null,
    documentId: project?.document.id ?? null,
    environment: project?.document.environment ?? null,
    canEdit: workspace.canEdit,
    themeBackground,
    execute: workspace.execute,
    restoreFocus: restoreSettingsFocus,
  });
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
  const mode = session?.mode ?? "edit";
  const effectiveTrustedContentCatalog = trustedHotspotContentCatalog ?? [];
  const hotspotCommon = {
    document: project?.document ?? null,
    projectId: project?.record.id ?? null,
    viewerRef,
    clearEntitySelection: () => workspace.selectEntity(null),
    addDiagnostic: workspace.addDiagnostic,
    defaultTitle: t.hotspots.defaultTitle,
    locale,
  } as const;
  const hotspots = useStudioHotspots(
    mode === "edit"
      ? { ...hotspotCommon, mode: "edit", execute: workspace.execute }
      : { ...hotspotCommon, mode: "run" },
  );
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
  const closeHelp = (): void => {
    setHelpOpen(false);
    requestAnimationFrame(() => helpButtonRef.current?.focus());
  };
  const closePublish = useCallback((): void => {
    publishAbortRef.current?.abort();
    publishAbortRef.current = null;
    setPublishState(null);
    requestAnimationFrame(() =>
      document.querySelector<HTMLButtonElement>('[data-testid="publish-button"]')?.focus(),
    );
  }, []);

  const startPublish = (): void => {
    if (project === null) return;
    publishAbortRef.current?.abort();
    const controller = new AbortController();
    publishAbortRef.current = controller;
    const surfaceEvidence: PublishSurfaceEvidence[] = project.document.annotations.flatMap(
      (annotation) => {
        if (annotation.anchor.kind !== "surface") return [];
        const state = viewerRef.current?.getHotspotViewState(annotation.id);
        if (state === undefined) return [];
        return [
          {
            annotationId: annotation.id,
            documentId: project.document.id,
            documentRevision: project.document.revision,
            resolution: state.resolution,
          },
        ];
      },
    );
    setPublishState({ status: "checking" });
    void workspace
      .publishScene(surfaceEvidence, controller.signal)
      .then((outcome) => {
        if (publishAbortRef.current !== controller || controller.signal.aborted) return;
        publishAbortRef.current = null;
        setPublishState(
          outcome.status === "blocked"
            ? { status: "blocked", blockers: outcome.blockers }
            : { status: "published", fileName: outcome.fileName },
        );
      })
      .catch(() => {
        if (publishAbortRef.current !== controller || controller.signal.aborted) return;
        publishAbortRef.current = null;
        setPublishState({ status: "failed" });
      });
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

  useLayoutEffect(() => {
    syncStudioThemeColor(theme);
  }, [theme]);

  useEffect(() => {
    const controller = publishAbortRef.current;
    if (controller === null) return;
    controller.abort();
    publishAbortRef.current = null;
    setPublishState(null);
  }, [project?.document.id, project?.document.revision]);

  useEffect(
    () => () => {
      publishAbortRef.current?.abort();
    },
    [],
  );

  const focusSelection = (): void => {
    if (hotspots.selectedId !== null) {
      hotspots.focus(hotspots.selectedId);
      return;
    }
    if (selectedEntityId === null) return;
    void viewerRef.current?.focusEntity(selectedEntityId).catch((error: unknown) => {
      workspace.addDiagnostic(error instanceof Error ? error.message : String(error));
    });
  };
  const deleteSelection = (): void => {
    if (hotspots.mode === "edit" && hotspots.selectedId !== null) {
      hotspots.remove(hotspots.selectedId);
      return;
    }
    if (selectedEntityId === null) return;
    if (lightAuthoring.deleteSelection()) return;
    workspace.deleteEntity(selectedEntityId);
    workspace.selectEntity(null);
  };
  const changeMode = (mode: "edit" | "run"): void => {
    if (hotspots.mode === "edit") hotspots.cancelDraft();
    lightAuthoring.clearPreview();
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
  const undo = (): void => {
    if (hotspots.mode === "edit") hotspots.cancelDraft();
    settings.clearScenePreview();
    lightAuthoring.clearPreview();
    workspace.undo();
  };
  const redo = (): void => {
    if (hotspots.mode === "edit") hotspots.cancelDraft();
    settings.clearScenePreview();
    lightAuthoring.clearPreview();
    workspace.redo();
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
    "history.undo": undo,
    "history.redo": redo,
    "selection.duplicate": duplicateSelection,
    "selection.delete": deleteSelection,
    "selection.clear": () => {
      if (hotspots.selectedId !== null) hotspots.clearSelection();
      else workspace.selectEntity(null);
    },
    "hotspot.add": () => {
      if (hotspots.mode === "edit") hotspots.startPlacement();
    },
    "project.save": () => void workspace.save().catch(() => undefined),
    "view.focus": focusSelection,
    "help.open": () => setHelpOpen(true),
  };
  useStudioShortcuts({
    actions: shortcutActions,
    canEdit: workspace.canEdit,
    canResetSelection: sceneLayout.resetCapability.enabled,
    hasSelection: selectedEntityId !== null || hotspots.selectedId !== null,
    modalOpen:
      helpOpen ||
      settings.open ||
      lightingMenuOpen ||
      workspace.importState !== null ||
      sceneNameDialogMode !== null ||
      publishState !== null,
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
        hasSelection={selectedEntityId !== null || hotspots.selectedId !== null}
        mode={session?.mode ?? "edit"}
        projectName={project?.record.name ?? t.app.openingProject}
        save={session?.save ?? { status: "saving", revision: 0 }}
        smartAlignEnabled={smartAlignEnabled}
        hotspotPlacementActive={hotspots.placementActive}
        lightCount={lightAuthoring.lightCount}
        lightingMenuOpen={lightingMenuOpen}
        lightAddDisabledReason={
          lightAuthoring.addDisabledReason === null
            ? null
            : lightAuthoring.addDisabledReason === "not-ready"
              ? t.lights.menu.reasons.notReady
              : t.lights.menu.reasons[lightAuthoring.addDisabledReason]
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
        onPublish={startPublish}
        onImport={openModelPicker}
        onModeChange={changeMode}
        onOpenProjectMenu={() => {
          setLightingMenuOpen(false);
          setProjectMenuOpen((open) => !open);
        }}
        onOpenHelp={() => {
          setProjectMenuOpen(false);
          setLightingMenuOpen(false);
          setHelpOpen(true);
        }}
        onAddHotspot={() => {
          if (hotspots.mode === "edit") hotspots.startPlacement();
        }}
        onOpenSettings={() => {
          setProjectMenuOpen(false);
          setHelpOpen(false);
          setLightingMenuOpen(false);
          settings.openDialog();
        }}
        onToggleSmartAlign={toggleSmartAlign}
        onAddLight={lightAuthoring.add}
        onLightingMenuOpenChange={setLightingMenuOpen}
        onRefreshLightAvailability={lightAuthoring.refreshCreationAvailability}
        onRedo={redo}
        onSave={() => void workspace.save().catch(() => undefined)}
        onToolChange={(tool) => {
          if (lightAuthoring.canUseTool(tool)) workspace.setTool(tool);
        }}
        onUndo={undo}
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
            <button
              className={leftPanel === "hotspots" ? "is-active" : ""}
              type="button"
              onClick={() => setLeftPanel("hotspots")}
            >
              <MapPin size={14} /> {t.app.sourceSummary.hotspotsTab}
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
              onSelect={(entityId, operation) => {
                hotspots.clearSelection();
                sceneLayout.selectFromTree(entityId, operation);
              }}
              onVisibilityChange={(entityId, visible) =>
                lightAuthoring.updateVisibility(entityId, visible) ||
                workspace.execute({ type: "set-entity-visibility", entityId, visible })
              }
            />
          ) : leftPanel === "assets" ? (
            <AssetList
              assets={project?.document.assets ?? []}
              editable={workspace.canEdit}
              onImport={openModelPicker}
            />
          ) : (
            <HotspotsPanel hotspots={hotspots} />
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

        <section
          className={`studio-viewport ${hotspots.placementActive ? "is-hotspot-placement" : ""}`}
          aria-label={t.app.viewport.label}
        >
          {workspace.loading || project === null ? (
            <div className="viewport-loading">{t.app.openingLocalProject}</div>
          ) : (
            <AuthoringScene
              ref={viewerRef}
              adapters={dataBinding.adapters}
              backgroundPreview={settings.preview?.background ?? null}
              authoringMode={session?.mode ?? "edit"}
              hotspotAuthority={{ projectId: project.record.id, sourceId: project.document.id }}
              hotspotOrder={hotspots.orderedIds}
              dataRuntimeEnabled={session?.mode === "run"}
              canvasLabel={t.app.viewport.canvasLabel}
              assetResolver={workspace.assetResolver}
              className="studio-viewer"
              initialTool={activeTool}
              gridPreview={settings.preview?.grid ?? null}
              key={project.record.id}
              primaryEntityId={session?.primaryEntityId ?? null}
              selectedEntityIds={session?.selectedEntityIds ?? []}
              smartAlignEnabled={smartAlignEnabled}
              source={project.document}
              lightingPreview={settings.preview?.lighting ?? null}
              themeBackground={themeBackground}
              transformSettings={sceneLayout.transformSettings}
              onDiagnostic={(diagnostic) =>
                workspace.addDiagnostic(`${diagnostic.code} ${diagnostic.message}`)
              }
              onEvent={dataBinding.handleViewerEvent}
              onHotspotActivation={hotspots.handleActivation}
              onHotspotContent={hotspots.handleContent}
              onHotspotHostContentRequest={hotspots.handleHostContent}
              onHotspotPlacementAccept={hotspots.handlePlacementAccept}
              onHotspotPlacementPreview={hotspots.handlePlacementPreview}
              onHotspotSessionStart={hotspots.handleSessionStart}
              onHotspotSelectionRequest={hotspots.handleSelectionRequest}
              onHotspotSessionCancel={hotspots.handleSessionCancel}
              onReady={(event) => {
                settings.handleReady(event.documentId, event.revision);
                lightAuthoring.handleReady(event.documentId, event.revision);
                const viewer = viewerRef.current;
                if (viewer === null) return;
                viewer.setTool(activeTool);
                lightAuthoring.refreshCreationAvailability();
                sceneLayout.handleReady();
                hotspots.handleViewerReady();
              }}
              onSelectionChange={(event) => {
                if (event.origin === "viewport" || event.entityId !== null) {
                  hotspots.clearSelection();
                }
                sceneLayout.handleSelectionChange(event);
              }}
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
          {hotspots.titleEditor !== null && hotspots.mode === "edit" && (
            <HotspotTitleEditor
              editor={hotspots.titleEditor}
              onCancel={hotspots.cancelDraft}
              onConfirm={hotspots.confirmTitle}
            />
          )}
          {hotspots.mode === "edit" &&
            hotspots.selected !== null &&
            hotspots.popoverAnchor !== null && (
              <HotspotPopover
                anchor={hotspots.popoverAnchor}
                annotation={hotspots.selected}
                onDelete={() => hotspots.remove(hotspots.selected!.id)}
                onMore={hotspots.openInspector}
                onRename={() => hotspots.startRename(hotspots.selected!.id)}
                onReposition={() => hotspots.startReposition(hotspots.selected!.id)}
                onToggleLock={() => hotspots.toggleLock(hotspots.selected!.id)}
                onToggleVisibility={() => hotspots.toggleVisibility(hotspots.selected!.id)}
              />
            )}
          {hotspots.mode === "run" && hotspots.runContent !== null && (
            <HotspotRunContent content={hotspots.runContent} onClose={hotspots.closeRunContent} />
          )}
          <div className="viewport-mode mono" data-testid="viewport-mode">
            {t.app.viewport.modeStatus[session?.mode ?? "edit"]} /{" "}
            {t.app.viewport.toolStatus[activeTool]} /{" "}
            {selectedEntityId ?? t.app.viewport.noSelection}
          </div>
        </section>

        {project !== null &&
        hotspots.mode === "edit" &&
        hotspots.selected !== null &&
        hotspots.inspectorOpen ? (
          <aside aria-label={t.inspector.ariaLabel} className="studio-inspector">
            <HotspotInspector
              annotation={hotspots.selected}
              document={project.document}
              editable={!hotspots.selected.locked}
              trustedContentCatalog={effectiveTrustedContentCatalog}
              key={`${hotspots.selected.id}:${project.document.revision}`}
              onClose={hotspots.closeInspector}
              onUpdate={hotspots.update}
            />
          </aside>
        ) : project !== null ? (
          <StudioInspector
            document={project.document}
            projectId={project.record.id}
            editable={workspace.canEdit}
            entity={selectedEntity}
            execute={workspace.execute}
            lightPreviewCancellation={lightAuthoring.previewCancellation}
            layout={sceneLayout}
            mode={session?.mode ?? "edit"}
            preview={dataBinding.preview}
            selectedEntityId={selectedEntityId}
            targetResolution={dataBinding.targetResolution}
            onCancelLightPreview={lightAuthoring.cancelPreview}
            onAcceptLightPreview={lightAuthoring.acceptPreview}
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
            onPreviewLight={lightAuthoring.preview}
            onRename={(entityId, name) =>
              workspace.execute({ type: "rename-entity", entityId, name })
            }
          />
        ) : null}

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

      <div aria-live="polite" className="hotspot-live-region">
        {hotspotStatusMessage(hotspots.status, t.hotspots)}
      </div>

      {workspace.importState !== null && (
        <ImportDialog
          state={workspace.importState}
          onCancel={workspace.closeImport}
          onConfirm={() => void workspace.confirmImport()}
        />
      )}

      {publishState !== null && <PublishDialog state={publishState} onClose={closePublish} />}

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

      {settings.open && (
        <StudioSettingsDialog
          draft={settings.draft}
          sceneEditable={settings.sceneEditable}
          previewCancellation={settings.previewCancellation}
          onCancelScenePreview={settings.cancelScenePreview}
          onClose={settings.closeDialog}
          onCommitScene={settings.commitSceneSettings}
          onPreviewScene={settings.previewSceneSettings}
          onRedo={redo}
          onUndo={undo}
        />
      )}

      {helpOpen && <ShortcutHelpDialog onClose={closeHelp} />}

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
