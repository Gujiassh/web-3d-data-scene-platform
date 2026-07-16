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
import { useStudioDataBinding } from "./data-binding/useStudioDataBinding";
import { useStudioI18n } from "./i18n/I18nProvider";
import { useStudioSceneLayout } from "./layout/useStudioSceneLayout";
import { studioHistoryCapabilities } from "./session/authoring-capabilities";
import { resolveExecutableStudioShortcut } from "./session/shortcuts";
import { SceneBackgroundSettingsDialog } from "./scene-background/SceneBackgroundSettingsDialog";
import {
  createSetSceneBackgroundCommand,
  sceneBackgroundStateKey,
  themeBackgroundFor,
  type SceneBackgroundSettings,
} from "./scene-background/model";
import {
  createSceneBackgroundDraftPreview,
  holdSceneBackgroundPreviewUntilReady,
  releaseSceneBackgroundPreviewOnReady,
  resolveSceneBackgroundPreview,
  type SceneBackgroundPreviewState,
} from "./scene-background/preview-state";
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
  const [leftPanel, setLeftPanel] = useState<LeftPanel>("scene");
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [sceneNameDialogMode, setSceneNameDialogMode] = useState<SceneNameDialogMode | null>(null);
  const [sceneSettingsKey, setSceneSettingsKey] = useState<string | null>(null);
  const [sceneBackgroundPreview, setSceneBackgroundPreview] =
    useState<SceneBackgroundPreviewState | null>(null);

  const selectedEntityId = workspace.session?.primaryEntityId ?? null;
  const activeTool = workspace.session?.tool ?? "select";
  const selectedEntity =
    workspace.project?.document.entities.find((entity) => entity.id === selectedEntityId) ?? null;
  const project = workspace.project;
  const session = workspace.session;
  const history = workspace.history;
  const themeBackground = themeBackgroundFor(theme);
  const projectDocumentKey =
    project === null ? null : sceneBackgroundStateKey(project.record.id, project.document.id);
  const sceneSettingsOpen = sceneSettingsKey !== null && sceneSettingsKey === projectDocumentKey;
  const resolvedSceneBackgroundPreview = resolveSceneBackgroundPreview(
    sceneBackgroundPreview,
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
  const openModelPicker = (): void => modelInputRef.current?.click();
  const closeSceneNameDialog = (): void => {
    setSceneNameDialogMode(null);
    requestAnimationFrame(() =>
      document.querySelector<HTMLButtonElement>(".project-menu-trigger")?.focus(),
    );
  };
  const closeSceneSettings = (): void => {
    setSceneSettingsKey(null);
    setSceneBackgroundPreview(null);
    restoreSceneSettingsFocus();
  };
  const restoreSceneSettingsFocus = (): void => {
    requestAnimationFrame(() =>
      document.querySelector<HTMLButtonElement>(".project-menu-trigger")?.focus(),
    );
  };
  const handleSceneBackgroundPreview = useCallback(
    (color: string) => {
      if (projectDocumentKey !== null) {
        setSceneBackgroundPreview(createSceneBackgroundDraftPreview(projectDocumentKey, color));
      }
    },
    [projectDocumentKey],
  );

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

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      const shortcut = resolveExecutableStudioShortcut(
        {
          key: event.key,
          metaKey: event.metaKey,
          ctrlKey: event.ctrlKey,
          shiftKey: event.shiftKey,
          altKey: event.altKey,
          ...(target === null ? {} : { targetTagName: target.tagName }),
          ...(target === null ? {} : { targetEditable: target.isContentEditable }),
        },
        workspace.canEdit,
      );
      if (shortcut === null) return;
      event.preventDefault();
      if (shortcut.type === "undo") workspace.undo();
      if (shortcut.type === "redo") workspace.redo();
      if (shortcut.type === "save") void workspace.save().catch(() => undefined);
      if (shortcut.type === "duplicate" && selectedEntityId !== null) {
        sceneLayout.duplicateSelection();
      }
      if (shortcut.type === "delete" && selectedEntityId !== null) {
        workspace.deleteEntity(selectedEntityId);
        workspace.selectEntity(null);
      }
      if (shortcut.type === "clear") workspace.selectEntity(null);
      if (shortcut.type === "tool") workspace.setTool(shortcut.tool);
      if (shortcut.type === "focus" && selectedEntityId !== null) {
        void viewerRef.current?.focusEntity(selectedEntityId).catch((error: unknown) => {
          workspace.addDiagnostic(error instanceof Error ? error.message : String(error));
        });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [sceneLayout, selectedEntityId, workspace]);

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
        canEdit={workspace.canEdit}
        canDuplicate={sceneLayout.capabilities.duplicate.enabled}
        canRedo={historyCapabilities.canRedo}
        canUndo={historyCapabilities.canUndo}
        duplicateDisabledReason={
          sceneLayout.capabilities.duplicate.reason === null
            ? null
            : t.layout.reasons[sceneLayout.capabilities.duplicate.reason]
        }
        exportOutdated={workspace.exportOutdated}
        hasSelection={selectedEntityId !== null}
        mode={session?.mode ?? "edit"}
        projectName={project?.record.name ?? t.app.openingProject}
        save={session?.save ?? { status: "saving", revision: 0 }}
        tool={activeTool}
        onDelete={() => {
          if (selectedEntityId !== null) {
            workspace.deleteEntity(selectedEntityId);
            workspace.selectEntity(null);
          }
        }}
        onDuplicate={() => {
          if (selectedEntityId !== null) sceneLayout.duplicateSelection();
        }}
        onExport={() => void workspace.exportArchive()}
        onImport={openModelPicker}
        onModeChange={workspace.setMode}
        onOpenProjectMenu={() => setProjectMenuOpen((open) => !open)}
        onRedo={workspace.redo}
        onSave={() => void workspace.save().catch(() => undefined)}
        onToolChange={workspace.setTool}
        onUndo={workspace.undo}
      />

      {projectMenuOpen && project !== null && (
        <ProjectMenu
          canConfigureScene={workspace.canEdit}
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
          onSceneSettings={() => {
            if (!workspace.canEdit || projectDocumentKey === null) return;
            setProjectMenuOpen(false);
            setSceneSettingsKey(projectDocumentKey);
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
                workspace.execute({ type: "set-entity-lock", entityId, locked })
              }
              onSelect={sceneLayout.selectFromTree}
              onVisibilityChange={(entityId, visible) =>
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
              backgroundPreview={resolvedSceneBackgroundPreview}
              dataRuntimeEnabled={session?.mode === "run"}
              canvasLabel={t.app.viewport.canvasLabel}
              assetResolver={workspace.assetResolver}
              className="studio-viewer"
              initialTool={activeTool}
              key={project.record.id}
              primaryEntityId={session?.primaryEntityId ?? null}
              selectedEntityIds={session?.selectedEntityIds ?? []}
              source={project.document}
              themeBackground={themeBackground}
              transformSettings={sceneLayout.transformSettings}
              onDiagnostic={(diagnostic) =>
                workspace.addDiagnostic(`${diagnostic.code} ${diagnostic.message}`)
              }
              onEvent={dataBinding.handleViewerEvent}
              onReady={(event) => {
                setSceneBackgroundPreview((current) =>
                  releaseSceneBackgroundPreviewOnReady(
                    current,
                    sceneBackgroundStateKey(project.record.id, event.documentId),
                    event.revision,
                  ),
                );
                const viewer = viewerRef.current;
                if (viewer === null) return;
                viewer.setTool(activeTool);
                sceneLayout.handleReady();
              }}
              onSelectionChange={sceneLayout.handleSelectionChange}
              onTransformPreview={sceneLayout.handleTransformPreview}
              onTransformCommit={sceneLayout.handleTransformCommit}
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
            onTransformChange={(entityId, transform) => {
              const entity = project?.document.entities.find((item) => item.id === entityId);
              if (entity !== undefined) {
                sceneLayout.handleTransformCommit({
                  type: "transform-commit",
                  entityId,
                  before: entity.transform,
                  after: transform,
                });
              }
            }}
          />
        )}

        <section className="studio-diagnostics" aria-label={t.app.diagnostics.label}>
          <div className="diagnostics-title">
            <TriangleAlert size={14} /> {t.app.diagnostics.label}
            <span>{workspace.diagnostics.length}</span>
          </div>
          <div className="diagnostics-stream mono">
            {workspace.diagnostics.length === 0
              ? t.app.diagnostics.ready
              : workspace.diagnostics.join(" · ")}
          </div>
        </section>
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

      {sceneSettingsOpen && project !== null && (
        <SceneBackgroundSettingsDialog
          initialSettings={{
            backgroundMode: project.document.environment.backgroundMode,
            background: project.document.environment.background,
          }}
          key={projectDocumentKey ?? undefined}
          themeBackground={themeBackground}
          onApply={(settings: SceneBackgroundSettings) => {
            const outcome = workspace.execute(
              createSetSceneBackgroundCommand(
                {
                  backgroundMode: project.document.environment.backgroundMode,
                  background: project.document.environment.background,
                },
                settings,
              ),
            );
            if (outcome.status === "rejected" || outcome.status === "unavailable") return false;
            if (outcome.status === "changed") {
              setSceneSettingsKey(null);
              setSceneBackgroundPreview(
                holdSceneBackgroundPreviewUntilReady(
                  sceneBackgroundStateKey(project.record.id, project.document.id),
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
          onPreview={handleSceneBackgroundPreview}
        />
      )}

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
