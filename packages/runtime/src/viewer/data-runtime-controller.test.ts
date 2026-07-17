import type { SceneDocument } from "@web3d/document";
import { Group, Mesh, MeshBasicMaterial } from "three";
import { describe, expect, it, vi } from "vitest";

import type { BindingStateChangeEvent, Diagnostic, ViewerEvent } from "../types";
import { ViewerDataRuntimeController } from "./data-runtime-controller";
import type { RuntimeGeneration, RuntimeTarget } from "./runtime-generation";

describe("ViewerDataRuntimeController", () => {
  it("preserves value, rule, alarm, cleanup, and duplicate-event ordering", () => {
    const events: string[] = [];
    const diagnostics: Diagnostic[] = [];
    const material = new MeshBasicMaterial({ color: "#9CA8A1" });
    const target: RuntimeTarget = {
      object: new Mesh(undefined, material),
      materials: [material],
      baseline: { visible: true, colors: [material.color.clone()] },
    };
    const controller = createController(events, diagnostics, () => 0);
    controller.attach(document(), generation(target));

    expect(controller.getSnapshot()).toEqual({ connections: {}, alarms: [], bindingStates: [] });
    controller.enable();
    expect(events).toEqual([
      "binding:updated:status-rules:fallback",
      "alarm:opened:status-rules:fallback",
      "render",
    ]);

    events.length = 0;
    controller.acceptEnvelope({
      kind: "snapshot",
      sourceId: "source-1",
      streamId: "stream-1",
      sequence: 1,
      sourceTime: "10:00",
      quality: "good",
      value: { status: "fault" },
    });
    expect(events).toEqual([
      "connection:online",
      "binding:updated:status-fault",
      "alarm:cleared:status-rules:fallback",
      "alarm:opened:status-fault",
      "render",
    ]);
    expect(material.color.getHexString()).toBe("b93632");

    events.length = 0;
    controller.acceptEnvelope({
      kind: "snapshot",
      sourceId: "source-1",
      streamId: "stream-1",
      sequence: 2,
      sourceTime: "10:00",
      quality: "good",
      value: { status: "fault" },
    });
    expect(events).toEqual(["render"]);

    events.length = 0;
    controller.disable();
    expect(events).toEqual(["alarm:cleared:status-fault", "binding:cleared:binding-1", "render"]);
    expect(controller.getSnapshot()).toEqual({ connections: {}, alarms: [], bindingStates: [] });
    expect(material.color.getHexString()).toBe("9ca8a1");
    expect(diagnostics).toEqual([]);
    material.dispose();
  });

  it("owns deterministic stale and offline health transitions", () => {
    let now = 0;
    const events: string[] = [];
    const material = new MeshBasicMaterial({ color: "#9CA8A1" });
    const target: RuntimeTarget = {
      object: new Mesh(undefined, material),
      materials: [material],
      baseline: { visible: true, colors: [material.color.clone()] },
    };
    const controller = createController(events, [], () => now);
    controller.attach(document(), generation(target));
    controller.enable();
    controller.acceptEnvelope({
      kind: "snapshot",
      sourceId: "source-1",
      streamId: "stream-1",
      sequence: 1,
      quality: "good",
      value: { status: "running" },
    });
    events.length = 0;

    now = 9;
    controller.updateHealth();
    expect(events).toEqual([]);

    now = 10;
    controller.updateHealth();
    expect(events).toEqual(["connection:stale", "binding:updated:status-running", "render"]);

    events.length = 0;
    now = 20;
    controller.updateHealth();
    expect(events).toEqual([
      "connection:offline",
      "binding:updated:status-offline",
      "alarm:opened:status-offline",
      "render",
    ]);
    material.dispose();
  });

  it("refreshes document authority without resetting live binding state", () => {
    const events: string[] = [];
    const material = new MeshBasicMaterial({ color: "#9CA8A1" });
    const target: RuntimeTarget = {
      object: new Mesh(undefined, material),
      materials: [material],
      baseline: { visible: true, colors: [material.color.clone()] },
    };
    const controller = createController(events, [], () => 0);
    const initial = document();
    const runtimeGeneration = generation(target);
    controller.attach(initial, runtimeGeneration);
    controller.enable();
    controller.acceptEnvelope({
      kind: "snapshot",
      sourceId: "source-1",
      streamId: "stream-1",
      sequence: 1,
      quality: "good",
      value: { status: "fault" },
    });
    const before = controller.getSnapshot();
    events.length = 0;

    controller.refreshDocumentAuthority(
      { ...initial, revision: initial.revision + 1 },
      runtimeGeneration,
    );

    expect(controller.getSnapshot()).toEqual(before);
    expect(events).toEqual([]);
    controller.acceptEnvelope({
      kind: "snapshot",
      sourceId: "source-1",
      streamId: "stream-1",
      sequence: 2,
      quality: "good",
      value: { status: "running" },
    });
    expect(controller.getSnapshot().bindingStates[0]?.ruleId).toBe("status-running");
    material.dispose();
  });
});

function createController(
  events: string[],
  diagnostics: Diagnostic[],
  now: () => number,
): ViewerDataRuntimeController {
  return new ViewerDataRuntimeController({
    emitAuthoring: (event) => events.push(authoringEvent(event)),
    emitViewer: (event) => events.push(viewerEvent(event)),
    now,
    recordDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
    requestRender: () => events.push("render"),
  });
}

function authoringEvent(event: BindingStateChangeEvent): string {
  return event.transition === "updated"
    ? `binding:updated:${event.state.ruleId}`
    : `binding:cleared:${event.bindingId}`;
}

function viewerEvent(event: Extract<ViewerEvent, { type: "alarm" | "connection-change" }>): string {
  return event.type === "connection-change"
    ? `connection:${event.status}`
    : `alarm:${event.transition}:${event.alarm.ruleId}`;
}

function document(): SceneDocument {
  return {
    schemaVersion: "1.3.0",
    id: "scene-1",
    name: "Scene",
    revision: 0,
    assets: [],
    entities: [],
    targets: [],
    dataSources: [
      {
        id: "source-1",
        name: "Source",
        adapter: "mock",
        staleAfterMs: 10,
        offlineAfterMs: 20,
        options: { scenario: "test" },
      },
    ],
    bindings: [
      {
        id: "binding-1",
        targetId: "target-1",
        sourceId: "source-1",
        pointer: "/status",
        ruleSetId: "status-rules",
        writes: ["color", "alarm"],
        enabled: true,
      },
    ],
    ruleSets: [
      {
        id: "status-rules",
        name: "Status",
        rules: [
          {
            id: "status-offline",
            priority: 300,
            when: { fact: "connection", operator: "eq", expected: "offline" },
            effects: [
              { type: "color", value: "#5B6762" },
              { type: "alarm", level: "warning", message: "Offline" },
            ],
          },
          {
            id: "status-fault",
            priority: 200,
            when: { fact: "value", operator: "eq", expected: "fault" },
            effects: [
              { type: "color", value: "#B93632" },
              { type: "alarm", level: "critical", message: "Fault" },
            ],
          },
          {
            id: "status-running",
            priority: 100,
            when: { fact: "value", operator: "eq", expected: "running" },
            effects: [
              { type: "color", value: "#2E7D4D" },
              { type: "alarm", level: "none", message: "" },
            ],
          },
        ],
        fallback: [
          { type: "color", value: "#A96800" },
          { type: "alarm", level: "info", message: "Unknown" },
        ],
      },
    ],
    annotations: [],
    views: [],
    environment: {
      backgroundMode: "custom",
      background: "#FFFFFF",
      grid: false,
      unit: "m",
      upAxis: "Y",
      lighting: standardLighting(),
    },
  };
}

function generation(target: RuntimeTarget): RuntimeGeneration {
  return {
    root: new Group(),
    authoredLights: {
      stage: vi.fn(() => ({ commit: vi.fn(), dispose: vi.fn() })),
      setAuthoringMode: vi.fn(),
      entityForObject: vi.fn(),
      dispose: vi.fn(),
    },
    entities: new Map(),
    targets: new Map([["target-1", target]]),
    diagnostics: [],
    entityForObject: vi.fn(),
    targetForObject: vi.fn(),
    dispose: vi.fn(),
  };
}

function standardLighting(): SceneDocument["environment"]["lighting"] {
  return {
    fill: { skyColor: "#FFFFFF", groundColor: "#65706A", intensity: 1.8 },
    key: {
      color: "#FFFFFF",
      intensity: 2.2,
      directionToLight: [0.37904902178945177, 0.7580980435789035, 0.5306686305052324],
    },
  };
}
