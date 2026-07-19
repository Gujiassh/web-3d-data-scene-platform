import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { Annotation, DocumentCommand, SceneDocument, SurfaceAnchor } from "@web3d/document";
import type { AuthoringSceneHandle } from "@web3d/react";
import type {
  AuthoringViewerEvent,
  HotspotActivationEvent,
  HotspotActionResultCode,
  HotspotPlacementRejectionReason,
  HotspotScreenAnchor,
  HotspotSessionCancellationReason,
  HotspotSessionEvidence,
  HotspotSurfaceHitEvidence,
  HotspotUnresolvedReason,
  HotspotViewState,
} from "@web3d/runtime";

import type { StudioCommandOutcome } from "../workspace/command-outcome";
import { nextAnnotationId } from "./annotation-id";

type Execute = (command: DocumentCommand) => StudioCommandOutcome;
const EMPTY_ANNOTATIONS: readonly Annotation[] = [];

export type HotspotStatusCode =
  | "surface-ready"
  | "placement-active"
  | "title-required"
  | "created"
  | "renamed"
  | "reposition-active"
  | "repositioned"
  | "updated"
  | "hidden"
  | "shown"
  | "lock-enabled"
  | "unlocked"
  | "locked"
  | "command-rejected"
  | "unavailable"
  | "removed"
  | HotspotUnresolvedReason
  | HotspotPlacementRejectionReason
  | HotspotSessionCancellationReason
  | HotspotActionResultCode;

interface CommonOptions {
  readonly document: SceneDocument | null;
  readonly projectId: string | null;
  readonly viewerRef: React.RefObject<AuthoringSceneHandle | null>;
  readonly clearEntitySelection: () => void;
  readonly addDiagnostic: (message: string) => void;
  readonly defaultTitle: (index: number) => string;
  readonly locale: "en" | "zh-CN";
}

export type UseStudioHotspotsOptions =
  | (CommonOptions & { readonly mode: "edit"; readonly execute: Execute })
  | (CommonOptions & { readonly mode: "run" });

export interface HotspotTitleEditorState {
  readonly kind: "create" | "rename";
  readonly session: HotspotSessionEvidence | null;
  readonly annotationId: string | null;
  readonly hit: HotspotSurfaceHitEvidence | null;
  readonly screenAnchor: HotspotScreenAnchor;
  readonly initialTitle: string;
}

export type HotspotRunContent =
  | {
      readonly annotationId: string;
      readonly title: string;
      readonly kind: "plain-text";
      readonly value: string;
    }
  | {
      readonly annotationId: string;
      readonly title: string;
      readonly kind: "host-content";
    };

export type HotspotFocusRequest =
  | { readonly sequence: number; readonly target: "add" }
  | { readonly sequence: number; readonly target: "row"; readonly annotationId: string };

export interface HotspotListItem {
  readonly annotation: Annotation;
  readonly state: HotspotViewState;
}

interface StudioHotspotsBase {
  readonly mode: "edit" | "run";
  readonly items: readonly HotspotListItem[];
  readonly orderedIds: readonly string[];
  readonly selectedId: string | null;
  readonly selected: Annotation | null;
  readonly selectedViewState: HotspotViewState | null;
  readonly titleEditor: HotspotTitleEditorState | null;
  readonly popoverAnchor: HotspotScreenAnchor | null;
  readonly runContent: HotspotRunContent | null;
  readonly status: HotspotStatusCode | null;
  readonly focusRequest: HotspotFocusRequest | null;
  readonly placementActive: boolean;
  readonly inspectorOpen: boolean;
  readonly select: (
    annotationId: string,
    openPopover?: boolean,
    fallbackAnchor?: HotspotScreenAnchor,
  ) => void;
  readonly clearSelection: () => void;
  readonly clearFocusRequest: (sequence: number) => void;
  readonly focus: (annotationId: string) => void;
  readonly activate: (annotationId: string) => void;
  readonly handlePlacementPreview: (
    event: Extract<AuthoringViewerEvent, { type: "hotspot-placement-preview" }>,
  ) => void;
  readonly handleSessionStart: (
    event: Extract<AuthoringViewerEvent, { type: "hotspot-session-start" }>,
  ) => void;
  readonly handlePlacementAccept: (
    event: Extract<AuthoringViewerEvent, { type: "hotspot-placement-accept" }>,
  ) => void;
  readonly handleSessionCancel: (
    event: Extract<AuthoringViewerEvent, { type: "hotspot-session-cancel" }>,
  ) => void;
  readonly handleSelectionRequest: (
    event: Extract<AuthoringViewerEvent, { type: "hotspot-selection-request" }>,
  ) => void;
  readonly handleActivation: (event: HotspotActivationEvent) => void;
  readonly handleContent: (
    event: Extract<AuthoringViewerEvent, { type: "hotspot-content" }>,
  ) => void;
  readonly handleHostContent: (
    event: Extract<AuthoringViewerEvent, { type: "hotspot-host-content-request" }>,
  ) => void;
  readonly closeRunContent: () => void;
  readonly handleViewerReady: () => void;
}

export interface StudioHotspotsRun extends StudioHotspotsBase {
  readonly mode: "run";
}

export interface StudioHotspotsEdit extends StudioHotspotsBase {
  readonly mode: "edit";
  readonly startPlacement: () => void;
  readonly cancelDraft: () => void;
  readonly confirmTitle: (title: string) => void;
  readonly startRename: (annotationId: string, fallbackAnchor?: HotspotScreenAnchor) => void;
  readonly startReposition: (annotationId: string) => void;
  readonly toggleVisibility: (annotationId: string) => void;
  readonly toggleLock: (annotationId: string) => void;
  readonly remove: (annotationId: string) => void;
  readonly update: (before: Annotation, after: Annotation) => boolean;
  readonly closePopover: () => void;
  readonly openInspector: () => void;
  readonly closeInspector: () => void;
}

export type StudioHotspots = StudioHotspotsEdit | StudioHotspotsRun;

export function useStudioHotspots(options: UseStudioHotspotsOptions): StudioHotspots {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeSession, setActiveSession] = useState<HotspotSessionEvidence | null>(null);
  const activeSessionRef = useRef<HotspotSessionEvidence | null>(null);
  const [titleEditor, setTitleEditor] = useState<HotspotTitleEditorState | null>(null);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [popoverFallbackAnchor, setPopoverFallbackAnchor] = useState<HotspotScreenAnchor | null>(
    null,
  );
  const [selectedViewState, setSelectedViewState] = useState<HotspotViewState | null>(null);
  const [runContent, setRunContent] = useState<HotspotRunContent | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [viewStateRevision, setViewStateRevision] = useState(0);
  const [status, setStatus] = useState<HotspotStatusCode | null>(null);
  const [focusRequest, setFocusRequest] = useState<HotspotFocusRequest | null>(null);
  const focusSequenceRef = useRef(0);
  const pendingProxyFocusRef = useRef<{
    readonly annotationId: string;
    readonly attempts: number;
  } | null>(null);
  const authorityRef = useRef({ projectId: options.projectId, document: options.document });
  authorityRef.current = { projectId: options.projectId, document: options.document };

  const annotations = options.document?.annotations ?? EMPTY_ANNOTATIONS;
  const listedAnnotations = useMemo(
    () =>
      options.mode === "run" ? annotations.filter((annotation) => annotation.visible) : annotations,
    [annotations, options.mode],
  );
  const orderedIds = useMemo(
    () =>
      [...listedAnnotations]
        .sort(
          (left, right) =>
            left.title.localeCompare(right.title, options.locale) ||
            left.id.localeCompare(right.id),
        )
        .map((annotation) => annotation.id),
    [listedAnnotations, options.locale],
  );
  const items = useMemo(
    () =>
      orderedIds.flatMap((annotationId) => {
        const annotation = listedAnnotations.find((candidate) => candidate.id === annotationId);
        if (annotation === undefined) return [];
        return [{ annotation, state: readViewState(options.viewerRef.current, annotationId) }];
      }),
    [listedAnnotations, options.viewerRef, orderedIds, selectedViewState, viewStateRevision],
  );
  const selected = annotations.find((annotation) => annotation.id === selectedId) ?? null;

  const clearSelection = useCallback(() => {
    setSelectedId(null);
    setSelectedViewState(null);
    setPopoverOpen(false);
    setPopoverFallbackAnchor(null);
    setInspectorOpen(false);
  }, []);

  const requestFocus = useCallback((target: "add" | { readonly annotationId: string }) => {
    const sequence = ++focusSequenceRef.current;
    setFocusRequest(
      target === "add"
        ? { sequence, target }
        : { sequence, target: "row", annotationId: target.annotationId },
    );
  }, []);

  const clearFocusRequest = useCallback((sequence: number) => {
    setFocusRequest((current) => (current?.sequence === sequence ? null : current));
  }, []);

  const updateActiveSession = useCallback((session: HotspotSessionEvidence | null) => {
    activeSessionRef.current = session;
    setActiveSession(session);
  }, []);

  const finishDraft = useCallback(() => {
    const sessionId = titleEditor?.session?.sessionId ?? activeSessionRef.current?.sessionId;
    if (sessionId !== undefined) options.viewerRef.current?.finishHotspotDraft(sessionId);
    options.viewerRef.current?.cancelHotspotSession();
    updateActiveSession(null);
    setTitleEditor(null);
  }, [options.viewerRef, titleEditor?.session?.sessionId, updateActiveSession]);
  const finishDraftRef = useRef(finishDraft);
  finishDraftRef.current = finishDraft;

  const attemptPendingProxyFocus = useCallback(() => {
    const pending = pendingProxyFocusRef.current;
    if (pending === null) return;
    const focused = options.viewerRef.current?.focusHotspotProxy(pending.annotationId) === true;
    if (focused || pending.attempts >= 3) {
      pendingProxyFocusRef.current = null;
      return;
    }
    pendingProxyFocusRef.current = { ...pending, attempts: pending.attempts + 1 };
  }, [options.viewerRef]);
  const attemptPendingProxyFocusRef = useRef(attemptPendingProxyFocus);
  attemptPendingProxyFocusRef.current = attemptPendingProxyFocus;

  useEffect(() => {
    pendingProxyFocusRef.current = null;
    finishDraftRef.current();
    clearSelection();
    setRunContent(null);
    // Authority changes invalidate every transient authoring surface.
  }, [options.projectId, options.document?.id, options.mode]);

  useEffect(() => {
    finishDraftRef.current();
    setPopoverOpen(false);
    attemptPendingProxyFocusRef.current();
    // A revision invalidates hit evidence but not stable hotspot selection.
  }, [options.document?.revision]);

  useEffect(() => {
    if (selectedId !== null && !annotations.some((annotation) => annotation.id === selectedId)) {
      clearSelection();
    }
  }, [annotations, clearSelection, selectedId]);

  useEffect(() => {
    if (selectedId === null) return;
    let frame = 0;
    const refresh = (): void => {
      const next = readViewState(options.viewerRef.current, selectedId);
      setSelectedViewState((current) => (sameViewState(current, next) ? current : next));
      frame = requestAnimationFrame(refresh);
    };
    refresh();
    return () => cancelAnimationFrame(frame);
  }, [options.viewerRef, selectedId]);

  const select = useCallback(
    (annotationId: string, openPopover = false, fallbackAnchor?: HotspotScreenAnchor) => {
      if (
        !annotations.some(
          (annotation) =>
            annotation.id === annotationId && (options.mode === "edit" || annotation.visible),
        )
      ) {
        return;
      }
      options.clearEntitySelection();
      setFocusRequest(null);
      setSelectedId(annotationId);
      setSelectedViewState(readViewState(options.viewerRef.current, annotationId));
      setPopoverOpen(openPopover && options.mode === "edit");
      setPopoverFallbackAnchor(fallbackAnchor ?? null);
    },
    [annotations, options],
  );

  const focus = useCallback(
    (annotationId: string) => {
      void options.viewerRef.current?.focusHotspot(annotationId).catch((error: unknown) => {
        options.addDiagnostic(errorMessage(error));
      });
    },
    [options],
  );

  const activate = useCallback(
    (annotationId: string) => {
      if (options.mode !== "run") return;
      const annotation = annotations.find((candidate) => candidate.id === annotationId);
      const state = readViewState(options.viewerRef.current, annotationId);
      if (
        annotation === undefined ||
        !annotation.visible ||
        state.availability !== "available" ||
        state.resolution !== "resolved"
      ) {
        setStatus(
          state.resolution === "unresolved" && state.unresolvedReason !== null
            ? state.unresolvedReason
            : "unavailable",
        );
        return;
      }
      void options.viewerRef.current
        ?.activateHotspot(annotationId, "list")
        .catch((error: unknown) => {
          options.addDiagnostic(errorMessage(error));
        });
    },
    [annotations, options],
  );

  const handlePlacementPreview = useCallback(
    (event: Extract<AuthoringViewerEvent, { type: "hotspot-placement-preview" }>) => {
      if (event.session.sessionId !== activeSessionRef.current?.sessionId) return;
      setStatus(event.result.status === "valid" ? "surface-ready" : event.result.reason);
    },
    [],
  );

  const handleSessionStart = useCallback(
    (event: Extract<AuthoringViewerEvent, { type: "hotspot-session-start" }>) => {
      const authority = authorityRef.current;
      const annotation = authority.document?.annotations.find(
        (candidate) => candidate.id === event.session.annotationId,
      );
      if (
        options.mode !== "edit" ||
        event.origin !== "direct-pointer" ||
        event.session.kind !== "reposition" ||
        annotation === undefined ||
        annotation.locked ||
        event.session.authority.documentId !== authority.document?.id ||
        event.session.authority.documentRevision !== authority.document?.revision ||
        event.session.authority.projectId !== authority.projectId
      ) {
        options.viewerRef.current?.cancelHotspotSession();
        if (annotation?.locked) setStatus("locked");
        return;
      }
      select(annotation.id);
      updateActiveSession(event.session);
      setStatus("reposition-active");
    },
    [options.mode, options.viewerRef, select, updateActiveSession],
  );

  const handlePlacementAccept = useCallback(
    (event: Extract<AuthoringViewerEvent, { type: "hotspot-placement-accept" }>) => {
      const authority = authorityRef.current;
      if (
        event.session.sessionId !== activeSessionRef.current?.sessionId ||
        event.session.authority.documentId !== authority.document?.id ||
        event.session.authority.documentRevision !== authority.document?.revision ||
        event.session.authority.projectId !== authority.projectId
      ) {
        options.viewerRef.current?.finishHotspotDraft(event.session.sessionId);
        return;
      }
      if (event.session.kind === "reposition" && event.session.annotationId !== null) {
        if (options.mode !== "edit") return;
        const before = authority.document.annotations.find(
          (annotation) => annotation.id === event.session.annotationId,
        );
        if (before?.locked) {
          setStatus("locked");
        } else if (before !== undefined) {
          const outcome = options.execute({
            type: "update-annotation",
            before,
            after: { ...before, anchor: surfaceAnchor(event.hit) },
          });
          if (outcome.status === "changed") {
            select(before.id);
            setStatus("repositioned");
          } else if (isCommandFailure(outcome)) {
            setStatus("command-rejected");
          }
        }
        options.viewerRef.current?.finishHotspotDraft(event.session.sessionId);
        updateActiveSession(null);
        return;
      }
      const screenAnchor = event.screenAnchor;
      if (screenAnchor === null) {
        options.viewerRef.current?.finishHotspotDraft(event.session.sessionId);
        updateActiveSession(null);
        setStatus("no-surface");
        return;
      }
      setTitleEditor({
        kind: "create",
        session: event.session,
        annotationId: null,
        hit: event.hit,
        screenAnchor,
        initialTitle: options.defaultTitle(nextTitleIndex(authority.document.annotations)),
      });
      setStatus("title-required");
    },
    [options, select, updateActiveSession],
  );

  const handleSessionCancel = useCallback(
    (event: Extract<AuthoringViewerEvent, { type: "hotspot-session-cancel" }>) => {
      if (event.session.sessionId !== activeSessionRef.current?.sessionId) return;
      updateActiveSession(null);
      setTitleEditor(null);
      setStatus(event.rejectionReason ?? event.reason);
      if (event.requiresAcknowledgment) {
        options.viewerRef.current?.acknowledgeHotspotCancellation(event.session.sessionId);
      }
    },
    [options.viewerRef, updateActiveSession],
  );

  const handleSelectionRequest = useCallback(
    (event: Extract<AuthoringViewerEvent, { type: "hotspot-selection-request" }>) => {
      select(event.annotationId, true);
    },
    [select],
  );

  const handleContent = useCallback(
    (event: Extract<AuthoringViewerEvent, { type: "hotspot-content" }>) => {
      setRunContent({
        annotationId: event.annotationId,
        title: event.title,
        kind: "plain-text",
        value: event.text,
      });
    },
    [],
  );
  const handleHostContent = useCallback(
    (event: Extract<AuthoringViewerEvent, { type: "hotspot-host-content-request" }>) => {
      setRunContent({
        annotationId: event.annotationId,
        title: event.title,
        kind: "host-content",
      });
    },
    [],
  );

  const base: StudioHotspotsBase = {
    mode: options.mode,
    items,
    orderedIds,
    selectedId,
    selected,
    selectedViewState,
    titleEditor,
    popoverAnchor: popoverOpen
      ? preferredScreenAnchor(selectedViewState, popoverFallbackAnchor)
      : null,
    runContent,
    status,
    focusRequest,
    placementActive: activeSession !== null || titleEditor?.kind === "create",
    inspectorOpen,
    select,
    clearSelection,
    clearFocusRequest,
    focus,
    activate,
    handlePlacementPreview,
    handleSessionStart,
    handlePlacementAccept,
    handleSessionCancel,
    handleSelectionRequest,
    handleActivation: (event) => setStatus(event.result),
    handleContent,
    handleHostContent,
    closeRunContent: () => setRunContent(null),
    handleViewerReady: () => {
      setViewStateRevision((value) => value + 1);
      attemptPendingProxyFocus();
    },
  };

  if (options.mode === "run") return { ...base, mode: "run" };

  const execute = options.execute;
  const update = (before: Annotation, after: Annotation): boolean => {
    const authoritative = annotations.find((annotation) => annotation.id === before.id);
    if (authoritative === undefined || authoritative.locked || after.id !== authoritative.id) {
      if (authoritative?.locked) setStatus("locked");
      return false;
    }
    const outcome = execute({ type: "update-annotation", before: authoritative, after });
    const changed = outcome.status === "changed";
    if (changed) setStatus("updated");
    else if (isCommandFailure(outcome)) setStatus("command-rejected");
    return changed;
  };
  const startPlacement = (): void => {
    finishDraft();
    clearSelection();
    try {
      updateActiveSession(options.viewerRef.current?.startHotspotPlacement() ?? null);
      setStatus("placement-active");
    } catch (error) {
      options.addDiagnostic(errorMessage(error));
    }
  };
  const confirmTitle = (rawTitle: string): void => {
    const editor = titleEditor;
    if (editor === null || rawTitle.trim().length === 0) return;
    const title = rawTitle;
    if (editor.kind === "create" && editor.hit !== null && editor.session !== null) {
      const document = authorityRef.current.document;
      if (document === null) {
        setStatus("unavailable");
        return;
      }
      const annotation: Annotation = {
        id: nextAnnotationId(document),
        title,
        visible: true,
        locked: false,
        anchor: surfaceAnchor(editor.hit),
        content: { kind: "plain-text", text: "" },
        action: { type: "show-content" },
      };
      const outcome = execute({ type: "add-annotation", after: annotation });
      if (outcome.status !== "changed") {
        setStatus("command-rejected");
        return;
      }
      pendingProxyFocusRef.current = { annotationId: annotation.id, attempts: 0 };
      options.clearEntitySelection();
      setSelectedId(annotation.id);
      setSelectedViewState(null);
      setStatus("created");
      options.viewerRef.current?.finishHotspotDraft(editor.session.sessionId);
    } else if (editor.kind === "rename" && editor.annotationId !== null) {
      const before = annotations.find((annotation) => annotation.id === editor.annotationId);
      if (before === undefined) {
        setStatus("unavailable");
        return;
      }
      if (before.locked) {
        setStatus("locked");
        return;
      }
      const outcome = execute({
        type: "update-annotation",
        before,
        after: { ...before, title },
      });
      if (isCommandFailure(outcome)) {
        setStatus("command-rejected");
        return;
      }
      if (outcome.status === "changed") setStatus("renamed");
      requestFocus({ annotationId: editor.annotationId });
    } else {
      setStatus("unavailable");
      return;
    }
    setTitleEditor(null);
    updateActiveSession(null);
  };
  const startRename = (annotationId: string, fallbackAnchor?: HotspotScreenAnchor): void => {
    const annotation = annotations.find((candidate) => candidate.id === annotationId);
    if (annotation?.locked) {
      setStatus("locked");
      return;
    }
    const state = readViewState(options.viewerRef.current, annotationId);
    const effectiveFallback = fallbackAnchor ?? popoverFallbackAnchor;
    const screenAnchor = preferredScreenAnchor(state, effectiveFallback);
    if (annotation === undefined || screenAnchor === null) {
      setStatus(
        state.resolution === "unresolved" && state.unresolvedReason !== null
          ? state.unresolvedReason
          : "unavailable",
      );
      return;
    }
    setPopoverOpen(false);
    setPopoverFallbackAnchor(effectiveFallback);
    setTitleEditor({
      kind: "rename",
      session: null,
      annotationId,
      hit: null,
      screenAnchor,
      initialTitle: annotation.title,
    });
  };
  const startReposition = (annotationId: string): void => {
    const annotation = annotations.find((candidate) => candidate.id === annotationId);
    if (annotation?.locked) {
      setStatus("locked");
      return;
    }
    if (annotation === undefined) return;
    try {
      setPopoverOpen(false);
      updateActiveSession(options.viewerRef.current?.startHotspotReposition(annotationId) ?? null);
      setStatus("reposition-active");
    } catch (error) {
      options.addDiagnostic(errorMessage(error));
    }
  };
  const permittedMutation = (
    annotationId: string,
    apply: (annotation: Annotation) => Annotation,
    nextStatus: HotspotStatusCode,
  ): void => {
    const before = annotations.find((annotation) => annotation.id === annotationId);
    if (before === undefined) return;
    const outcome = execute({ type: "update-annotation", before, after: apply(before) });
    if (outcome.status === "changed") {
      setStatus(nextStatus);
    } else if (isCommandFailure(outcome)) setStatus("command-rejected");
  };

  return {
    ...base,
    mode: "edit",
    startPlacement,
    cancelDraft: () => {
      const editor = titleEditor;
      finishDraft();
      if (editor?.kind === "create") requestFocus("add");
      else if (editor?.annotationId !== null && editor?.annotationId !== undefined) {
        requestFocus({ annotationId: editor.annotationId });
      }
    },
    confirmTitle,
    startRename,
    startReposition,
    toggleVisibility: (id) => {
      const annotation = annotations.find((candidate) => candidate.id === id);
      if (annotation === undefined) return;
      permittedMutation(
        id,
        (value) => ({ ...value, visible: !value.visible }),
        annotation.visible ? "hidden" : "shown",
      );
    },
    toggleLock: (id) => {
      const annotation = annotations.find((candidate) => candidate.id === id);
      if (annotation === undefined) return;
      permittedMutation(
        id,
        (value) => ({ ...value, locked: !value.locked }),
        annotation.locked ? "unlocked" : "lock-enabled",
      );
    },
    remove: (id) => {
      const before = annotations.find((annotation) => annotation.id === id);
      if (before === undefined) return;
      if (before.locked) {
        setStatus("locked");
        return;
      }
      const index = orderedIds.indexOf(id);
      const nextId = orderedIds[index + 1] ?? orderedIds[index - 1] ?? null;
      const outcome = execute({ type: "remove-annotation", before });
      if (outcome.status === "changed") {
        clearSelection();
        if (nextId === null) requestFocus("add");
        else requestFocus({ annotationId: nextId });
        setStatus("removed");
      } else if (isCommandFailure(outcome)) setStatus("command-rejected");
    },
    update,
    closePopover: () => setPopoverOpen(false),
    openInspector: () => {
      setPopoverOpen(false);
      setInspectorOpen(true);
    },
    closeInspector: () => setInspectorOpen(false),
  };
}

function isCommandFailure(
  outcome: StudioCommandOutcome,
): outcome is Extract<StudioCommandOutcome, { status: "rejected" | "unavailable" }> {
  return outcome.status === "rejected" || outcome.status === "unavailable";
}

function readViewState(
  viewer: AuthoringSceneHandle | null,
  annotationId: string,
): HotspotViewState {
  return (
    viewer?.getHotspotViewState(annotationId) ?? {
      annotationId,
      availability: "unavailable",
      unavailableReason: "annotation-not-found",
      resolution: "unresolved",
      unresolvedReason: null,
      markerVisible: false,
      screenAnchor: null,
    }
  );
}

function surfaceAnchor(hit: HotspotSurfaceHitEvidence): SurfaceAnchor {
  return {
    kind: "surface",
    entityId: hit.entityId,
    assetHash: hit.assetHash,
    nodeIndex: hit.nodeIndex,
    nodeLocalPosition: hit.nodeLocalPosition,
    nodeLocalNormal: hit.nodeLocalNormal,
  };
}

function nextTitleIndex(annotations: readonly Annotation[]): number {
  const used = new Set(
    annotations.flatMap((annotation) => {
      const match = annotation.title.match(/(?:Hotspot|热点)\s+(\d+)$/u);
      return match?.[1] === undefined ? [] : [Number(match[1])];
    }),
  );
  let candidate = 1;
  while (used.has(candidate)) candidate += 1;
  return candidate;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sameViewState(left: HotspotViewState | null, right: HotspotViewState): boolean {
  return (
    left !== null &&
    left.annotationId === right.annotationId &&
    left.availability === right.availability &&
    left.resolution === right.resolution &&
    left.unresolvedReason === right.unresolvedReason &&
    left.markerVisible === right.markerVisible &&
    left.screenAnchor?.clientX === right.screenAnchor?.clientX &&
    left.screenAnchor?.clientY === right.screenAnchor?.clientY
  );
}

function preferredScreenAnchor(
  state: HotspotViewState | null,
  fallback: HotspotScreenAnchor | null,
): HotspotScreenAnchor | null {
  if (
    fallback !== null &&
    (state === null ||
      state.availability !== "available" ||
      state.resolution !== "resolved" ||
      !state.markerVisible)
  ) {
    return fallback;
  }
  return state?.screenAnchor ?? fallback;
}
