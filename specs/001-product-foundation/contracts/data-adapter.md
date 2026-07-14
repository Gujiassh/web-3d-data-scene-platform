# Data Adapter Contract

> Status: MVP v1 design

## Responsibility

A DataAdapter turns an external source into ordered, validated envelopes. It does not know about
Three.js, entities, materials, alarms, or Studio UI.

```ts
interface DataAdapter {
  readonly sourceId: string;
  start(context: AdapterContext): Promise<void>;
  subscribe(listener: (envelope: DataEnvelope) => void): () => void;
  stop(): Promise<void>;
}

interface AdapterContext {
  signal: AbortSignal;
  now(): number;
  emitDiagnostic(diagnostic: Diagnostic): void;
}
```

`start` and `stop` are idempotent. `stop` must release sockets, timers and listeners. Credentials
and endpoint URLs are supplied when the host creates the adapter and are not read from
SceneDocument.

Viewer subscribes before calling `start`. An adapter must not emit before `start`, and every
envelope emitted after `start` must reach all currently registered listeners in order. A listener
added after the stream is online immediately receives the current Connection envelope followed by
the latest accepted Snapshot before new Patch envelopes. This prevents a late subscriber from
starting with an incomplete value store.

## Envelope Types

### Connection

```ts
interface ConnectionEnvelope {
  kind: "connection";
  sourceId: string;
  status: "connecting" | "online" | "stale" | "offline" | "error";
  sourceTime?: string;
  detailCode?: string;
}
```

### Snapshot

```ts
interface SnapshotEnvelope {
  kind: "snapshot";
  sourceId: string;
  streamId: string;
  sequence: number;
  sourceTime?: string;
  quality: "good" | "uncertain" | "bad";
  value: JsonValue;
}
```

### Patch

```ts
interface PatchEnvelope {
  kind: "patch";
  sourceId: string;
  streamId: string;
  sequence: number;
  sourceTime?: string;
  quality: "good" | "uncertain" | "bad";
  changes: Array<{ pointer: string; value: JsonValue }>;
}
```

Paths use RFC 6901 JSON Pointer. Patch removal is not supported in MVP; a source sends a new
Snapshot when document shape changes.

## Ordering

1. A new connection stream starts with a Snapshot and a new `streamId`.
2. Runtime ignores Patch envelopes until that stream's Snapshot is accepted.
3. `sequence` must increase monotonically inside a stream.
4. Duplicate or lower sequences are ignored and diagnosed.
5. An unknown streamId Patch is ignored.
6. A newer Snapshot atomically replaces the source value store.

This prevents delayed messages from an old socket from overwriting a recovered connection.

## Connection Health

- `online`: a valid Snapshot for the active stream has been accepted.
- `stale`: no valid data envelope arrived within `staleAfterMs`; last values remain available.
- `offline`: the adapter explicitly disconnected or exceeded `offlineAfterMs`.
- `error`: configuration or protocol failure requires user/developer action.

Scene rules receive `value`, `quality` and `connection` facts. Connection health is not hidden in
a magic value path.

The adapter's `sourceId` must equal the SceneDocument DataSource ID used to register it. Viewer
rejects mismatches before starting the adapter.

## Frame Coalescing

Runtime may coalesce multiple Patch envelopes received before the next render. For each JSON
Pointer, the highest accepted sequence wins. Connection envelopes and Alarm transitions are not
dropped. The normalized value store is updated before rules execute.

## MVP Adapters

### MockAdapter

- Runs deterministic scenarios from local fixture data.
- Supports pause, resume, speed and named fault injection.
- Uses a seeded clock; tests do not depend on wall time.

### WebSocketAdapter

- Host supplies URL, protocols and authentication material.
- Adapter requires a Snapshot after each successful connection.
- Reconnect uses bounded exponential backoff with jitter.
- Stopping the adapter cancels pending reconnect attempts.

## Diagnostics

Adapters emit flat diagnostics with source ID and stable code. They must redact URLs, headers,
tokens and message payloads that may contain sensitive data.
