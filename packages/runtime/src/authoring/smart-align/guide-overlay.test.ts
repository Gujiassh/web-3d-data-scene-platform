import { LineSegments, Scene } from "three";
import { describe, expect, it, vi } from "vitest";

import { SmartAlignGuideOverlay } from "./guide-overlay";
import type { SmartAlignCandidate } from "./oracle";

describe("SmartAlignGuideOverlay", () => {
  it("owns one disposable guide per axis and clears without removing the scene helper", () => {
    const scene = new Scene();
    const requestRender = vi.fn();
    const overlay = new SmartAlignGuideOverlay(scene, requestRender);
    const group = scene.getObjectByName("smart-align-guides")!;

    expect(group.visible).toBe(false);
    overlay.update([candidate("x"), candidate("y")]);
    expect(group.visible).toBe(true);
    expect(group.getObjectByName("smart-align-guide-x")?.visible).toBe(true);
    expect(group.getObjectByName("smart-align-guide-y")?.visible).toBe(true);
    expect(group.getObjectByName("smart-align-guide-z")?.visible).toBe(false);
    const xGuide = group.getObjectByName("smart-align-guide-x");
    expect(xGuide).toBeInstanceOf(LineSegments);
    expect((xGuide as LineSegments).geometry.getAttribute("position").count).toBe(6);

    overlay.clear();
    expect(group.visible).toBe(false);
    expect((xGuide as LineSegments).geometry.getAttribute("position")).toBeUndefined();
    expect(scene.getObjectByName("smart-align-guides")).toBe(group);
    overlay.dispose();
    expect(scene.getObjectByName("smart-align-guides")).toBeUndefined();
    expect(requestRender).toHaveBeenCalledTimes(2);
    expect(() => overlay.update([])).toThrow("disposed");
  });
});

function candidate(axis: "x" | "y" | "z"): SmartAlignCandidate {
  return {
    axis,
    movingAnchor: "center",
    referenceAnchor: "center",
    referenceEntityId: "reference",
    referenceCoordinate: 2,
    delta: 0.1,
    relationRank: 0,
    guideStart: [2, 0, 0],
    guideEnd: [2, 4, 1],
  };
}
