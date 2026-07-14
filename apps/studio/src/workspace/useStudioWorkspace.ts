import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  createDocumentHistory,
  executeHistoryCommand,
  exportCanonicalSceneJson,
  exportSceneArchive,
  importCanonicalSceneJson,
  importSceneArchive,
  redoHistoryCommand,
  undoHistoryCommand,
  type DocumentCommand,
  type DocumentHistoryState,
  type SceneAsset,
  type SceneDocument,
  type Transform,
} from "@web3d/document";
import { inspectGltf, type AssetResolver, type GltfInspectionSummary } from "@web3d/runtime";

import {
  createAutosaveController,
  createIndexedDbProjectRepository,
  type AutosaveController,
  type ProjectRecord,
  type StudioProjectRepository,
  type StudioProjectSnapshot,
} from "../project";
import {
  buildDuplicateSubtreeCommand,
  buildImportAssetCommand,
  createBrowserIdFactory,
} from "../session/command-builders";
import { createNewStudioProject } from "../session/new-project";
import {
  assertCanEdit,
  createStudioSession,
  isDirty,
  isExportOutdated,
  reduceStudioSession,
  type AuthoringTool,
  type StudioMode,
  type StudioSessionState,
} from "../session/session-state";
import type { ModelImportSummary } from "../features/ImportDialog";

export type ModelImportState =
  | { readonly status: "inspecting"; readonly fileName: string }
  | { readonly status: "ready"; readonly summary: ModelImportSummary }
  | { readonly status: "committing"; readonly summary: ModelImportSummary }
  | { readonly status: "failed"; readonly fileName: string; readonly message: string };

interface ImportCandidate {
  readonly bytes: ArrayBuffer;
  readonly inspection: GltfInspectionSummary;
}

interface InterceptableNavigationEvent extends Event {
  readonly canIntercept: boolean;
  readonly navigationType: string;
  intercept(options: { readonly handler: () => Promise<void> }): void;
}

export interface StudioWorkspace {
  readonly loading: boolean;
  readonly project: StudioProjectSnapshot | null;
  readonly history: DocumentHistoryState | null;
  readonly session: StudioSessionState | null;
  readonly recent: readonly ProjectRecord[];
  readonly diagnostics: readonly string[];
  readonly importState: ModelImportState | null;
  readonly assetResolver: AssetResolver;
  readonly dirty: boolean;
  readonly exportOutdated: boolean;
  readonly canEdit: boolean;
  readonly execute: (command: DocumentCommand) => void;
  readonly undo: () => void;
  readonly redo: () => void;
  readonly save: () => Promise<void>;
  readonly setMode: (mode: StudioMode) => void;
  readonly setTool: (tool: AuthoringTool) => void;
  readonly selectEntity: (entityId: string | null, extend?: boolean) => void;
  readonly transformEntity: (entityId: string, before: Transform, after: Transform) => void;
  readonly duplicateEntity: (entityId: string) => void;
  readonly deleteEntity: (entityId: string) => void;
  readonly inspectModel: (file: File) => Promise<void>;
  readonly confirmImport: () => Promise<void>;
  readonly closeImport: () => void;
  readonly createProject: () => Promise<void>;
  readonly openProject: (projectId: string) => Promise<void>;
  readonly deleteProject: (projectId: string) => Promise<void>;
  readonly importJson: (file: File) => Promise<void>;
  readonly importArchive: (file: File) => Promise<void>;
  readonly exportJson: () => Promise<void>;
  readonly exportArchive: () => Promise<void>;
  readonly addDiagnostic: (message: string) => void;
}

export function useStudioWorkspace(): StudioWorkspace {
  const repositoryRef = useRef<StudioProjectRepository | null>(null);
  const autosaveRef = useRef<AutosaveController | null>(null);
  const importCandidateRef = useRef<ImportCandidate | null>(null);
  const projectRef = useRef<StudioProjectSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [project, setProject] = useState<StudioProjectSnapshot | null>(null);
  const [history, setHistory] = useState<DocumentHistoryState | null>(null);
  const [session, setSession] = useState<StudioSessionState | null>(null);
  const [recent, setRecent] = useState<readonly ProjectRecord[]>([]);
  const [diagnostics, setDiagnostics] = useState<readonly string[]>([]);
  const [importState, setImportState] = useState<ModelImportState | null>(null);

  const addDiagnostic = useCallback((message: string) => {
    setDiagnostics((current) => [...current.slice(-11), message]);
  }, []);

  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  useEffect(() => {
    let active = true;
    const repository = createIndexedDbProjectRepository();
    repositoryRef.current = repository;
    const autosave = createAutosaveController({
      async save(snapshot) {
        const saved = await repository.save(snapshot);
        if (!active) return;
        setProject((current) =>
          current?.record.id === saved.record.id ? { ...current, record: saved.record } : current,
        );
        void repository.listRecent().then((items) => {
          if (active) setRecent(items);
        });
      },
      onStateChange(state) {
        if (!active) return;
        setSession((current) => {
          if (current === null) return current;
          if (state.status === "saving") {
            return reduceStudioSession(current, {
              type: "save-started",
              revision: state.revision,
            });
          }
          if (state.status === "saved") {
            return reduceStudioSession(current, {
              type: "save-succeeded",
              revision: state.revision,
            });
          }
          return reduceStudioSession(current, {
            type: "save-failed",
            revision: state.revision,
            message: state.message ?? "Local save failed.",
          });
        });
      },
    });
    autosaveRef.current = autosave;
    const flushBeforePageExit = (): void => {
      const current = projectRef.current;
      if (current !== null) void autosave.flush(current).catch(() => undefined);
    };
    const browserNavigation = (globalThis as typeof globalThis & { navigation?: EventTarget })
      .navigation;
    let allowReload = false;
    const flushBeforeNavigation = (event: Event): void => {
      const navigationEvent = event as InterceptableNavigationEvent;
      if (
        allowReload ||
        !navigationEvent.canIntercept ||
        navigationEvent.navigationType !== "reload" ||
        projectRef.current === null
      ) {
        return;
      }
      navigationEvent.intercept({
        async handler() {
          const current = projectRef.current;
          if (current !== null) await autosave.flush(current);
          allowReload = true;
          location.reload();
        },
      });
    };
    browserNavigation?.addEventListener("navigate", flushBeforeNavigation);
    window.addEventListener("pagehide", flushBeforePageExit);

    void initializeRepository(repository)
      .then(({ current, items }) => {
        if (!active) return;
        activateProject(current, setProject, setHistory, setSession);
        setRecent(items);
        setLoading(false);
      })
      .catch((error: unknown) => {
        if (!active) return;
        addDiagnostic(errorMessage(error));
        setLoading(false);
      });

    return () => {
      active = false;
      browserNavigation?.removeEventListener("navigate", flushBeforeNavigation);
      window.removeEventListener("pagehide", flushBeforePageExit);
      if (repositoryRef.current === repository) repositoryRef.current = null;
      if (autosaveRef.current === autosave) autosaveRef.current = null;
      importCandidateRef.current = null;
      void autosave.close().finally(() => repository.close());
    };
  }, [addDiagnostic]);

  useEffect(() => {
    if (project === null || session === null) return;
    if (project.document.revision <= session.save.revision) return;
    autosaveRef.current?.schedule(project);
  }, [project, session]);

  const execute = useCallback(
    (command: DocumentCommand) => {
      if (project === null || history === null || session === null) return;
      try {
        assertCanEdit(session);
        if (importState?.status === "committing") throw new Error("Import is being committed.");
        const nextHistory = executeHistoryCommand(history, command, { mode: session.mode });
        setHistory(nextHistory);
        setProject({ ...project, document: nextHistory.document });
        setSession(
          reduceStudioSession(session, {
            type: "document-changed",
            revision: nextHistory.document.revision,
          }),
        );
      } catch (error) {
        addDiagnostic(errorMessage(error));
      }
    },
    [addDiagnostic, history, importState?.status, project, session],
  );

  const undo = useCallback(() => {
    if (project === null || history === null || session === null) return;
    try {
      assertCanEdit(session);
      const next = undoHistoryCommand(history);
      if (next === history) return;
      setHistory(next);
      setProject({ ...project, document: next.document });
      setSession(
        reduceStudioSession(session, {
          type: "document-changed",
          revision: next.document.revision,
        }),
      );
    } catch (error) {
      addDiagnostic(errorMessage(error));
    }
  }, [addDiagnostic, history, project, session]);

  const redo = useCallback(() => {
    if (project === null || history === null || session === null) return;
    try {
      assertCanEdit(session);
      const next = redoHistoryCommand(history);
      if (next === history) return;
      setHistory(next);
      setProject({ ...project, document: next.document });
      setSession(
        reduceStudioSession(session, {
          type: "document-changed",
          revision: next.document.revision,
        }),
      );
    } catch (error) {
      addDiagnostic(errorMessage(error));
    }
  }, [addDiagnostic, history, project, session]);

  const save = useCallback(async () => {
    if (project === null) return;
    try {
      await requireAutosave(autosaveRef.current).flush(project);
    } catch (error) {
      addDiagnostic(errorMessage(error));
      throw error;
    }
  }, [addDiagnostic, project]);

  const setMode = useCallback(
    (mode: StudioMode) => {
      if (session !== null)
        setSession(reduceStudioSession(session, { type: "mode-changed", mode }));
    },
    [session],
  );

  const setTool = useCallback(
    (tool: AuthoringTool) => {
      if (session !== null)
        setSession(reduceStudioSession(session, { type: "tool-changed", tool }));
    },
    [session],
  );

  const selectEntity = useCallback(
    (entityId: string | null, extend = false) => {
      if (session === null) return;
      setSession(
        entityId === null
          ? reduceStudioSession(session, { type: "selection-cleared" })
          : reduceStudioSession(session, {
              type: "entity-selected",
              entityId,
              extend,
            }),
      );
    },
    [session],
  );

  const transformEntity = useCallback(
    (entityId: string, before: Transform, after: Transform) => {
      execute({ type: "transform-entity", entityId, before, after });
    },
    [execute],
  );

  const duplicateEntity = useCallback(
    (entityId: string) => {
      if (project === null) return;
      try {
        execute(buildDuplicateSubtreeCommand(project.document, entityId, createBrowserIdFactory()));
      } catch (error) {
        addDiagnostic(errorMessage(error));
      }
    },
    [addDiagnostic, execute, project],
  );

  const deleteEntity = useCallback(
    (entityId: string) => execute({ type: "delete-subtree", rootEntityId: entityId }),
    [execute],
  );

  const inspectModel = useCallback(async (file: File) => {
    setImportState({ status: "inspecting", fileName: file.name });
    importCandidateRef.current = null;
    try {
      const bytes = await file.arrayBuffer();
      const inspection = await inspectGltf(file.name, bytes);
      importCandidateRef.current = { bytes, inspection };
      setImportState({ status: "ready", summary: toImportSummary(inspection) });
    } catch (error) {
      setImportState({ status: "failed", fileName: file.name, message: errorMessage(error) });
    }
  }, []);

  const confirmImport = useCallback(async () => {
    const candidate = importCandidateRef.current;
    const repository = repositoryRef.current;
    if (
      candidate === null ||
      repository === null ||
      project === null ||
      history === null ||
      session === null
    ) {
      return;
    }
    const summary = toImportSummary(candidate.inspection);
    setImportState({ status: "committing", summary });
    try {
      assertCanEdit(session);
      const command = buildImportAssetCommand(
        project.document,
        {
          fileName: candidate.inspection.name,
          mediaType: candidate.inspection.mediaType,
          byteLength: candidate.inspection.byteLength,
          sha256: candidate.inspection.sha256,
          stats: candidate.inspection.stats,
          parentId: null,
        },
        createBrowserIdFactory(),
      );
      const nextHistory = executeHistoryCommand(history, command, { mode: session.mode });
      const alreadyStored = project.document.assets.some(
        (asset) => asset.sha256 === candidate.inspection.sha256,
      );
      const pendingAssets = alreadyStored
        ? project.assets
        : [
            ...project.assets,
            {
              sha256: candidate.inspection.sha256,
              mediaType: candidate.inspection.mediaType,
              blob: new Blob([candidate.bytes], { type: candidate.inspection.mediaType }),
            },
          ];
      const saved = await repository.save({
        ...project,
        document: nextHistory.document,
        assets: pendingAssets,
      });
      setHistory({ ...nextHistory, document: saved.document });
      setProject({ ...saved, assets: pendingAssets });
      let nextSession = reduceStudioSession(session, {
        type: "document-changed",
        revision: saved.document.revision,
      });
      nextSession = reduceStudioSession(nextSession, {
        type: "save-succeeded",
        revision: saved.document.revision,
      });
      nextSession = reduceStudioSession(nextSession, {
        type: "entity-selected",
        entityId: command.entity.id,
        extend: false,
      });
      setSession(nextSession);
      setRecent(await repository.listRecent());
      importCandidateRef.current = null;
      setImportState(null);
    } catch (error) {
      const message = errorMessage(error);
      addDiagnostic(message);
      setImportState({ status: "failed", fileName: summary.fileName, message });
    }
  }, [addDiagnostic, history, project, session]);

  const closeImport = useCallback(() => {
    importCandidateRef.current = null;
    setImportState(null);
  }, []);

  const switchToProject = useCallback(async (next: StudioProjectSnapshot) => {
    activateProject(next, setProject, setHistory, setSession);
    const repository = requireRepository(repositoryRef.current);
    setRecent(await repository.listRecent());
    importCandidateRef.current = null;
    setImportState(null);
  }, []);

  const createProject = useCallback(async () => {
    try {
      await flushBeforeSwitch(project, autosaveRef.current);
      const repository = requireRepository(repositoryRef.current);
      const now = new Date().toISOString();
      const next = createNewStudioProject({
        id: `project-${globalThis.crypto.randomUUID()}`,
        name: "Untitled Scene",
        createdAt: now,
      });
      await switchToProject(await repository.save(next));
    } catch (error) {
      addDiagnostic(errorMessage(error));
    }
  }, [addDiagnostic, project, switchToProject]);

  const openProject = useCallback(
    async (projectId: string) => {
      if (project?.record.id === projectId) return;
      try {
        await flushBeforeSwitch(project, autosaveRef.current);
        const repository = requireRepository(repositoryRef.current);
        await switchToProject(await repository.open(projectId));
      } catch (error) {
        addDiagnostic(errorMessage(error));
      }
    },
    [addDiagnostic, project, switchToProject],
  );

  const deleteProject = useCallback(
    async (projectId: string) => {
      if (project?.record.id === projectId) return;
      try {
        const repository = requireRepository(repositoryRef.current);
        await repository.delete(projectId);
        setRecent(await repository.listRecent());
      } catch (error) {
        addDiagnostic(errorMessage(error));
      }
    },
    [addDiagnostic, project?.record.id],
  );

  const importJson = useCallback(
    async (file: File) => {
      try {
        await flushBeforeSwitch(project, autosaveRef.current);
        const document = importCanonicalSceneJson(new Uint8Array(await file.arrayBuffer()));
        const repository = requireRepository(repositoryRef.current);
        const next = projectSnapshotForImportedDocument(document, []);
        await switchToProject(await repository.save(next));
      } catch (error) {
        addDiagnostic(errorMessage(error));
      }
    },
    [addDiagnostic, project, switchToProject],
  );

  const importArchive = useCallback(
    async (file: File) => {
      try {
        await flushBeforeSwitch(project, autosaveRef.current);
        const imported = await importSceneArchive(new Uint8Array(await file.arrayBuffer()));
        const assets = imported.assets.map((asset) => ({
          sha256: asset.sha256,
          mediaType: asset.mediaType,
          blob: new Blob([ownedArrayBuffer(asset.bytes)], { type: asset.mediaType }),
        }));
        const repository = requireRepository(repositoryRef.current);
        const next = projectSnapshotForImportedDocument(imported.document, assets);
        await switchToProject(await repository.save(next));
      } catch (error) {
        addDiagnostic(errorMessage(error));
      }
    },
    [addDiagnostic, project, switchToProject],
  );

  const markExported = useCallback(async () => {
    if (project === null || session === null) return;
    const repository = requireRepository(repositoryRef.current);
    const revision = project.document.revision;
    const saved = await repository.save({
      ...project,
      record: { ...project.record, lastExportedRevision: revision },
    });
    setProject({ ...saved, assets: project.assets });
    let nextSession = reduceStudioSession(session, { type: "save-succeeded", revision });
    nextSession = reduceStudioSession(nextSession, { type: "export-succeeded", revision });
    setSession(nextSession);
    setRecent(await repository.listRecent());
  }, [project, session]);

  const exportJson = useCallback(async () => {
    if (project === null) return;
    try {
      const bytes = exportCanonicalSceneJson(project.document);
      downloadBytes(bytes, `${safeFileName(project.document.name)}.scene.json`, "application/json");
      await markExported();
    } catch (error) {
      addDiagnostic(errorMessage(error));
    }
  }, [addDiagnostic, markExported, project]);

  const exportArchive = useCallback(async () => {
    if (project === null) return;
    try {
      const repository = requireRepository(repositoryRef.current);
      const bytes = await exportSceneArchive({
        document: project.document,
        createdAt: new Date().toISOString(),
        async resolveAssetBytes(sha256) {
          const blob = await repository.resolveAsset(`asset://${sha256}`);
          return new Uint8Array(await blob.arrayBuffer());
        },
      });
      downloadBytes(bytes, `${safeFileName(project.document.name)}.scene.zip`, "application/zip");
      await markExported();
    } catch (error) {
      addDiagnostic(errorMessage(error));
    }
  }, [addDiagnostic, markExported, project]);

  const assetResolver = useMemo<AssetResolver>(
    () => ({
      async resolve(asset: SceneAsset, signal: AbortSignal) {
        signal.throwIfAborted();
        const pending = project?.assets.find((candidate) => candidate.sha256 === asset.sha256);
        if (pending !== undefined) return pending.blob;
        const blob = await requireRepository(repositoryRef.current).resolveAsset(asset.uri);
        signal.throwIfAborted();
        return blob;
      },
    }),
    [project?.assets],
  );

  return {
    loading,
    project,
    history,
    session,
    recent,
    diagnostics,
    importState,
    assetResolver,
    dirty: session === null ? false : isDirty(session),
    exportOutdated: session === null ? true : isExportOutdated(session),
    canEdit: session?.mode === "edit" && importState?.status !== "committing",
    execute,
    undo,
    redo,
    save,
    setMode,
    setTool,
    selectEntity,
    transformEntity,
    duplicateEntity,
    deleteEntity,
    inspectModel,
    confirmImport,
    closeImport,
    createProject,
    openProject,
    deleteProject,
    importJson,
    importArchive,
    exportJson,
    exportArchive,
    addDiagnostic,
  };
}

async function initializeRepository(repository: StudioProjectRepository) {
  const items = await repository.listRecent();
  if (items[0] !== undefined) {
    return { current: await repository.open(items[0].id), items: await repository.listRecent() };
  }
  const now = new Date().toISOString();
  const initial = createNewStudioProject({
    id: "untitled-project",
    name: "Untitled Scene",
    createdAt: now,
  });
  const current = await repository.save(initial);
  return { current, items: await repository.listRecent() };
}

function activateProject(
  project: StudioProjectSnapshot,
  setProject: (value: StudioProjectSnapshot) => void,
  setHistory: (value: DocumentHistoryState) => void,
  setSession: (value: StudioSessionState) => void,
): void {
  setProject(project);
  setHistory(createDocumentHistory(project.document));
  setSession(createStudioSession(project.document.revision, project.record.lastExportedRevision));
}

async function flushBeforeSwitch(
  project: StudioProjectSnapshot | null,
  autosave: AutosaveController | null,
): Promise<void> {
  if (project === null) return;
  await requireAutosave(autosave).flush(project);
}

function projectSnapshotForImportedDocument(
  document: SceneDocument,
  assets: StudioProjectSnapshot["assets"],
): StudioProjectSnapshot {
  const now = new Date().toISOString();
  return {
    record: {
      id: `project-${globalThis.crypto.randomUUID()}`,
      name: document.name,
      createdAt: now,
      updatedAt: now,
      lastOpenedAt: now,
      lastSavedRevision: document.revision,
      lastExportedRevision: null,
    },
    document,
    assets,
  };
}

function toImportSummary(summary: GltfInspectionSummary): ModelImportSummary {
  return {
    fileName: summary.name,
    mediaType: summary.mediaType,
    byteLength: summary.byteLength,
    sha256: summary.sha256,
    nodeCount: summary.stats.nodeCount,
    meshCount: summary.stats.meshCount,
    materialCount: summary.stats.materialCount,
    triangleCount: summary.stats.triangleCount,
    warnings: summary.warnings,
  };
}

function requireRepository(value: StudioProjectRepository | null): StudioProjectRepository {
  if (value === null) throw new Error("Project repository is not ready.");
  return value;
}

function requireAutosave(value: AutosaveController | null): AutosaveController {
  if (value === null) throw new Error("Autosave is not ready.");
  return value;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function safeFileName(name: string): string {
  return (
    name
      .trim()
      .replace(/[^A-Za-z0-9._-]+/gu, "-")
      .replace(/^-+|-+$/gu, "") || "scene"
  );
}

function downloadBytes(bytes: Uint8Array, fileName: string, mediaType: string): void {
  const url = URL.createObjectURL(new Blob([ownedArrayBuffer(bytes)], { type: mediaType }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function ownedArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}
