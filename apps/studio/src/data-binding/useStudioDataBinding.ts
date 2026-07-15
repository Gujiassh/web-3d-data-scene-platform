import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";

import type { DocumentCommand, SceneDocument } from "@web3d/document";
import type { AuthoringViewerEvent, DataAdapter } from "@web3d/runtime";

import { createMockAdapterPlan, type UnsupportedDataSource } from "./mock-scenarios";
import { createStudioPreviewState, reduceStudioPreview } from "./preview-state";
import { resolveSelectedRootTarget } from "./selected-target";
import type { StudioPreviewAction } from "./types";
import type { StudioCommandOutcome } from "../workspace/command-outcome";

interface UseStudioDataBindingOptions {
  readonly document: SceneDocument | null;
  readonly mode: "edit" | "run";
  readonly selectedEntityId: string | null;
  readonly execute: (command: DocumentCommand) => StudioCommandOutcome;
}

export function useStudioDataBinding(options: UseStudioDataBindingOptions) {
  const [preview, dispatchPreview] = useReducer(
    reduceStudioPreview,
    false,
    createStudioPreviewState,
  );
  const targetResolution = useMemo(
    () =>
      options.document === null
        ? ({ status: "no-selection" } as const)
        : resolveSelectedRootTarget(options.document, options.selectedEntityId),
    [options.document, options.selectedEntityId],
  );
  const runSources =
    options.mode === "run" && options.document !== null ? options.document.dataSources : [];
  const adapterSourcesRef = useRef(runSources);
  adapterSourcesRef.current = runSources;
  const adapterKey = semanticDataAdapterKey(runSources);
  const adapterPlan = useMemo(() => {
    return createMockAdapterPlan(adapterSourcesRef.current);
  }, [adapterKey, options.document?.id]);
  const adapters: Readonly<Record<string, DataAdapter>> = adapterPlan.adapters;
  const unsupportedSourceIds = useMemo(
    () => new Set(adapterPlan.unsupportedSources.map((source) => source.sourceId)),
    [adapterPlan.unsupportedSources],
  );

  useEffect(() => {
    dispatchPreview({ type: options.mode === "run" ? "started" : "stopped" });
    if (options.mode !== "run" || adapterPlan.unsupportedSources.length === 0) return;
    const timer = globalThis.setTimeout(() => {
      for (const action of unsupportedSourcePreviewActions(adapterPlan.unsupportedSources)) {
        dispatchPreview(action);
      }
    }, 0);
    return () => globalThis.clearTimeout(timer);
  }, [adapterPlan.unsupportedSources, options.document?.id, options.mode]);

  const handleViewerEvent = useCallback(
    (event: AuthoringViewerEvent): void => {
      if (options.mode !== "run") return;
      if (event.type === "connection-change") {
        dispatchPreview({
          type: "connection-changed",
          sourceId: event.sourceId,
          status: unsupportedSourceIds.has(event.sourceId) ? "error" : event.status,
        });
      }
      if (event.type === "alarm") {
        dispatchPreview({
          type: "alarm-changed",
          transition: event.transition,
          alarm: event.alarm,
        });
      }
      if (event.type === "diagnostic") {
        dispatchPreview({ type: "diagnostic-added", diagnostic: event.diagnostic });
      }
      if (event.type === "binding-state-change") {
        if (event.transition === "updated") {
          dispatchPreview({ type: "binding-state-changed", state: event.state });
        } else {
          dispatchPreview({ type: "binding-state-cleared", bindingId: event.bindingId });
        }
      }
    },
    [options.mode, unsupportedSourceIds],
  );

  return {
    adapters,
    preview,
    targetResolution,
    execute: options.execute,
    handleViewerEvent,
  };
}

export function unsupportedSourcePreviewActions(
  sources: readonly UnsupportedDataSource[],
): readonly StudioPreviewAction[] {
  return sources.flatMap((source) => [
    { type: "connection-changed", sourceId: source.sourceId, status: "error" },
    { type: "diagnostic-added", diagnostic: source.diagnostic },
  ]);
}

export function semanticDataAdapterKey(sources: SceneDocument["dataSources"]): string {
  return JSON.stringify(
    [...sources]
      .sort((left, right) => left.id.localeCompare(right.id, "en"))
      .map((source) => ({
        id: source.id,
        adapter: source.adapter,
        ...(source.adapter === "mock"
          ? {
              scenario: source.options.scenario,
              defaultSpeed: source.options.defaultSpeed ?? null,
            }
          : {}),
      })),
  );
}
