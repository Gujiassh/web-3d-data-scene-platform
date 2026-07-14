import { useEffect, useRef, useState } from "react";
import { Box, FolderTree, TriangleAlert } from "lucide-react";

import { AuthoringScene, type AuthoringSceneHandle } from "@web3d/react";

import { AssetList } from "./features/AssetList";
import { EntityInspector } from "./features/EntityInspector";
import { ImportDialog } from "./features/ImportDialog";
import { ProjectMenu } from "./features/ProjectMenu";
import { SceneTree } from "./features/SceneTree";
import { StudioToolbar } from "./features/StudioToolbar";
import { resolveStudioShortcut } from "./session/shortcuts";
import { useStudioWorkspace } from "./workspace/useStudioWorkspace";

type LeftPanel = "scene" | "assets";

export function App() {
  const desktopViewport = useDesktopViewport();
  const workspace = useStudioWorkspace();
  const viewerRef = useRef<AuthoringSceneHandle>(null);
  const modelInputRef = useRef<HTMLInputElement>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const archiveInputRef = useRef<HTMLInputElement>(null);
  const [leftPanel, setLeftPanel] = useState<LeftPanel>("scene");
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);

  const selectedEntityId = workspace.session?.selectedEntityIds.at(-1) ?? null;
  const activeTool = workspace.session?.tool ?? "select";
  const selectedEntity =
    workspace.project?.document.entities.find((entity) => entity.id === selectedEntityId) ?? null;

  useEffect(() => {
    const viewer = viewerRef.current;
    if (viewer === null) return;
    viewer.setTool(activeTool);
    viewer.selectEntity(selectedEntityId);
  }, [activeTool, selectedEntityId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      const shortcut = resolveStudioShortcut({
        key: event.key,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        ...(target === null ? {} : { targetTagName: target.tagName }),
        ...(target === null ? {} : { targetEditable: target.isContentEditable }),
      });
      if (shortcut === null) return;
      event.preventDefault();
      if (shortcut.type === "undo") workspace.undo();
      if (shortcut.type === "redo") workspace.redo();
      if (shortcut.type === "save") void workspace.save().catch(() => undefined);
      if (shortcut.type === "duplicate" && workspace.canEdit && selectedEntityId !== null) {
        workspace.duplicateEntity(selectedEntityId);
      }
      if (shortcut.type === "delete" && workspace.canEdit && selectedEntityId !== null) {
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
  }, [selectedEntityId, workspace]);

  if (!desktopViewport) {
    return (
      <div className="studio-app">
        <div className="studio-size-gate">
          <Box size={22} />
          <strong>Studio requires a 1280px desktop viewport.</strong>
        </div>
      </div>
    );
  }

  const project = workspace.project;
  const session = workspace.session;
  const history = workspace.history;
  const openModelPicker = (): void => modelInputRef.current?.click();

  return (
    <div className="studio-app">
      <StudioToolbar
        canEdit={workspace.canEdit}
        canRedo={(history?.redoStack.length ?? 0) > 0}
        canUndo={(history?.undoStack.length ?? 0) > 0}
        exportOutdated={workspace.exportOutdated}
        hasSelection={selectedEntityId !== null}
        mode={session?.mode ?? "edit"}
        projectName={project?.record.name ?? "Opening project"}
        save={session?.save ?? { status: "saving", revision: 0 }}
        tool={activeTool}
        onDelete={() => {
          if (selectedEntityId !== null) {
            workspace.deleteEntity(selectedEntityId);
            workspace.selectEntity(null);
          }
        }}
        onDuplicate={() => {
          if (selectedEntityId !== null) workspace.duplicateEntity(selectedEntityId);
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
            void workspace.createProject();
          }}
          onOpen={(projectId) => {
            setProjectMenuOpen(false);
            void workspace.openProject(projectId);
          }}
        />
      )}

      <main className="studio-workspace">
        <aside className="studio-left" aria-label="Scene navigation">
          <div className="panel-tabs">
            <button
              className={leftPanel === "scene" ? "is-active" : ""}
              type="button"
              onClick={() => setLeftPanel("scene")}
            >
              <FolderTree size={14} /> Scene
            </button>
            <button
              className={leftPanel === "assets" ? "is-active" : ""}
              type="button"
              onClick={() => setLeftPanel("assets")}
            >
              <Box size={14} /> Assets
            </button>
          </div>
          {leftPanel === "scene" ? (
            <SceneTree
              editable={workspace.canEdit}
              entities={project?.document.entities ?? []}
              selectedEntityIds={session?.selectedEntityIds ?? []}
              onLockChange={(entityId, locked) =>
                workspace.execute({ type: "set-entity-lock", entityId, locked })
              }
              onSelect={(entityId, extend) => workspace.selectEntity(entityId, extend)}
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
              <strong>{session?.mode === "run" ? "Run mode" : "Local project"}</strong>
              <small data-testid="document-revision">
                revision {project?.document.revision ?? 0}
              </small>
            </span>
          </div>
        </aside>

        <section className="studio-viewport" aria-label="Studio 3D viewport">
          {workspace.loading || project === null ? (
            <div className="viewport-loading">Opening local project</div>
          ) : (
            <AuthoringScene
              ref={viewerRef}
              assetResolver={workspace.assetResolver}
              className="studio-viewer"
              initialTool={activeTool}
              key={project.record.id}
              source={project.document}
              onDiagnostic={(diagnostic) =>
                workspace.addDiagnostic(`${diagnostic.code} ${diagnostic.message}`)
              }
              onReady={() => {
                const viewer = viewerRef.current;
                if (viewer === null) return;
                viewer.setTool(activeTool);
                viewer.selectEntity(selectedEntityId);
              }}
              onSelectionChange={(event) => workspace.selectEntity(event.entityId)}
              onTransformCommit={(event) =>
                workspace.transformEntity(event.entityId, event.before, event.after)
              }
            />
          )}
          <div className="viewport-mode mono" data-testid="viewport-mode">
            {session?.mode.toUpperCase() ?? "EDIT"} / {activeTool.toUpperCase()} /{` `}
            {selectedEntityId ?? "NO SELECTION"}
          </div>
        </section>

        <EntityInspector
          editable={workspace.canEdit}
          entity={selectedEntity}
          onRename={(entityId, name) =>
            workspace.execute({ type: "rename-entity", entityId, name })
          }
          onTransformChange={(entityId, transform) => {
            const entity = project?.document.entities.find((item) => item.id === entityId);
            if (entity !== undefined)
              workspace.transformEntity(entityId, entity.transform, transform);
          }}
        />

        <section className="studio-diagnostics" aria-label="Diagnostics">
          <div className="diagnostics-title">
            <TriangleAlert size={14} /> Diagnostics
            <span>{workspace.diagnostics.length}</span>
          </div>
          <div className="diagnostics-stream mono">
            {workspace.diagnostics.length === 0
              ? "document=valid storage=indexeddb authoring=ready"
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
