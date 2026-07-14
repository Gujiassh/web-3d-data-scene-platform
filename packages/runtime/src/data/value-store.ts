import { diagnostic } from "../diagnostics";
import type {
  ConnectionStatus,
  DataEnvelope,
  DataQuality,
  Diagnostic,
  JsonValue,
  PatchEnvelope,
} from "../types";
import { cloneJson, getJsonPointer, setJsonPointer } from "./json-pointer";

export interface SourceHealthOptions {
  staleAfterMs: number;
  offlineAfterMs: number;
}

interface SourceState extends SourceHealthOptions {
  connection: ConnectionStatus;
  activeStreamId: string | null;
  retiredStreamIds: Set<string>;
  sequence: number;
  value: JsonValue | undefined;
  quality: DataQuality;
  sourceTime: string | undefined;
  lastAcceptedAt: number | null;
}

export interface SourceSnapshot {
  sourceId: string;
  connection: ConnectionStatus;
  streamId: string | null;
  sequence: number | null;
  value: JsonValue | undefined;
  quality: DataQuality;
  sourceTime: string | undefined;
}

export interface ValueStoreUpdate {
  accepted: boolean;
  changedPointers: readonly string[];
  connectionChanged: boolean;
  diagnostics: readonly Diagnostic[];
}

export class RuntimeValueStore {
  readonly #sources = new Map<string, SourceState>();

  registerSource(sourceId: string, options: SourceHealthOptions): void {
    const existing = this.#sources.get(sourceId);
    if (existing !== undefined) {
      existing.staleAfterMs = options.staleAfterMs;
      existing.offlineAfterMs = options.offlineAfterMs;
      return;
    }
    this.#sources.set(sourceId, {
      ...options,
      connection: "connecting",
      activeStreamId: null,
      retiredStreamIds: new Set(),
      sequence: -1,
      value: undefined,
      quality: "bad",
      sourceTime: undefined,
      lastAcceptedAt: null,
    });
  }

  accept(envelope: DataEnvelope, now: number): ValueStoreUpdate {
    const state = this.#sources.get(envelope.sourceId);
    if (state === undefined) {
      return rejected(
        diagnostic(
          "DATASOURCE_STREAM_UNKNOWN",
          "adapter",
          "warning",
          `Envelope references unregistered source ${envelope.sourceId}`,
          { sourceId: envelope.sourceId, action: "Register the SceneDocument data source first." },
        ),
      );
    }

    if (envelope.kind === "connection") {
      const nextStatus =
        envelope.status === "online" && state.activeStreamId === null
          ? "connecting"
          : envelope.status;
      const changed = state.connection !== nextStatus;
      state.connection = nextStatus;
      state.sourceTime = envelope.sourceTime;
      return { accepted: true, changedPointers: [], connectionChanged: changed, diagnostics: [] };
    }

    if (envelope.kind === "snapshot") {
      if (state.retiredStreamIds.has(envelope.streamId)) {
        return rejected(retiredStream(envelope.sourceId, envelope.streamId));
      }
      if (state.activeStreamId === envelope.streamId && envelope.sequence <= state.sequence) {
        return rejected(outOfOrder(envelope.sourceId));
      }
      if (state.activeStreamId !== null && state.activeStreamId !== envelope.streamId) {
        state.retiredStreamIds.add(state.activeStreamId);
      }

      const connectionChanged = state.connection !== "online";
      state.activeStreamId = envelope.streamId;
      state.sequence = envelope.sequence;
      state.value = cloneJson(envelope.value);
      state.quality = envelope.quality;
      state.sourceTime = envelope.sourceTime;
      state.lastAcceptedAt = now;
      state.connection = "online";
      return {
        accepted: true,
        changedPointers: [""],
        connectionChanged,
        diagnostics: [],
      };
    }

    return this.#acceptPatch(state, envelope, now);
  }

  #acceptPatch(state: SourceState, envelope: PatchEnvelope, now: number): ValueStoreUpdate {
    if (state.activeStreamId !== envelope.streamId || state.value === undefined) {
      const value = state.retiredStreamIds.has(envelope.streamId)
        ? retiredStream(envelope.sourceId, envelope.streamId)
        : diagnostic(
            "DATASOURCE_STREAM_UNKNOWN",
            "adapter",
            "warning",
            `Patch stream ${envelope.streamId} has no accepted Snapshot`,
            { sourceId: envelope.sourceId, action: "Send a Snapshot before Patch envelopes." },
          );
      return rejected(value);
    }
    if (envelope.sequence <= state.sequence) return rejected(outOfOrder(envelope.sourceId));

    let nextValue = state.value;
    for (const change of envelope.changes) {
      const patched = setJsonPointer(nextValue, change.pointer, change.value);
      if (patched === null) {
        return rejected(
          diagnostic(
            "DATASOURCE_PATCH_INVALID",
            "adapter",
            "warning",
            `Patch contains invalid or shape-changing pointer ${change.pointer}`,
            {
              sourceId: envelope.sourceId,
              action: "Send a new Snapshot when the value shape changes.",
            },
          ),
        );
      }
      nextValue = patched;
    }

    const connectionChanged = state.connection !== "online";
    state.value = nextValue;
    state.sequence = envelope.sequence;
    state.quality = envelope.quality;
    state.sourceTime = envelope.sourceTime;
    state.lastAcceptedAt = now;
    state.connection = "online";
    return {
      accepted: true,
      changedPointers: envelope.changes.map((change) => change.pointer),
      connectionChanged,
      diagnostics: [],
    };
  }

  updateHealth(sourceId: string, now: number): ValueStoreUpdate {
    const state = this.#sources.get(sourceId);
    if (state === undefined || state.lastAcceptedAt === null) return unchanged();
    if (
      state.connection === "error" ||
      state.connection === "offline" ||
      state.connection === "connecting"
    ) {
      return unchanged();
    }

    const elapsed = now - state.lastAcceptedAt;
    const next =
      elapsed >= state.offlineAfterMs
        ? "offline"
        : elapsed >= state.staleAfterMs
          ? "stale"
          : "online";
    if (state.connection === next) return unchanged();
    state.connection = next;
    return { accepted: true, changedPointers: [], connectionChanged: true, diagnostics: [] };
  }

  getValue(sourceId: string, pointer: string): JsonValue | undefined {
    const value = this.#sources.get(sourceId)?.value;
    return value === undefined ? undefined : getJsonPointer(value, pointer);
  }

  getSource(sourceId: string): SourceSnapshot | undefined {
    const state = this.#sources.get(sourceId);
    if (state === undefined) return undefined;
    return {
      sourceId,
      connection: state.connection,
      streamId: state.activeStreamId,
      sequence: state.activeStreamId === null ? null : state.sequence,
      value: state.value === undefined ? undefined : cloneJson(state.value),
      quality: state.quality,
      sourceTime: state.sourceTime,
    };
  }

  getConnections(): Readonly<Record<string, ConnectionStatus>> {
    return Object.freeze(
      Object.fromEntries(
        [...this.#sources].map(([sourceId, state]) => [sourceId, state.connection]),
      ),
    );
  }

  sourceIds(): readonly string[] {
    return [...this.#sources.keys()];
  }
}

function rejected(value: Diagnostic): ValueStoreUpdate {
  return { accepted: false, changedPointers: [], connectionChanged: false, diagnostics: [value] };
}

function unchanged(): ValueStoreUpdate {
  return { accepted: false, changedPointers: [], connectionChanged: false, diagnostics: [] };
}

function retiredStream(sourceId: string, streamId: string): Diagnostic {
  return diagnostic(
    "DATASOURCE_STREAM_RETIRED",
    "adapter",
    "warning",
    `Envelope from retired stream ${streamId} was ignored`,
    { sourceId, action: "Discard delayed messages from replaced connections." },
  );
}

function outOfOrder(sourceId: string): Diagnostic {
  return diagnostic(
    "DATASOURCE_PATCH_OUT_OF_ORDER",
    "adapter",
    "warning",
    "Envelope sequence is duplicate or lower than the active sequence",
    { sourceId, action: "Ensure sequence increases monotonically within a stream." },
  );
}
