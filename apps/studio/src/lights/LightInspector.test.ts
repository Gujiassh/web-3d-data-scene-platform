// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DocumentCommand, LightEntity } from "@web3d/document";

import { StudioI18nProvider } from "../i18n/I18nProvider";
import { LightInspector } from "./LightInspector";

describe("LightInspector", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("keeps the common slider at 100 while exact numeric brightness reaches 1000", () => {
    const execute = renderInspector(point());
    changeInput(input("Brightness"), "750");
    expect(input("Brightness slider").value).toBe("100");
    changeInput(input("Position X"), "4");
    submit();

    expect(execute).toHaveBeenCalledOnce();
    const command = execute.mock.calls[0]?.[0];
    expect(command).toMatchObject({
      type: "update-light-entity",
      before: { id: "light-a", light: { intensity: 25 } },
      after: {
        id: "light-a",
        transform: { position: [4, 2, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
        light: { kind: "point", intensity: 750 },
      },
    });
    expect(container.querySelector('input[aria-label="Rotation (degrees) X"]')).toBeNull();
    expect(container.textContent).not.toContain("Scale");
  });

  it("focuses the first invalid field and emits no command", () => {
    const execute = renderInspector(spot());
    changeInput(input("Brightness"), "1001");
    changeInput(input("Range"), "0");
    submit();

    expect(execute).not.toHaveBeenCalled();
    expect(input("Brightness").getAttribute("aria-invalid")).toBe("true");
    expect(input("Range").getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(input("Brightness"));
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("highlighted");
  });

  it("commits spot rotation and properties together through one complete update command", () => {
    const execute = renderInspector(spot());
    changeInput(input("Rotation (degrees) X"), "15");
    changeInput(input("Beam angle (degrees)"), "60");
    changeInput(input("Penumbra"), "0.5");
    submit();

    const command = execute.mock.calls[0]?.[0] as Extract<
      DocumentCommand,
      { type: "update-light-entity" }
    >;
    expect(command.type).toBe("update-light-entity");
    expect(command.after.light).toMatchObject({
      kind: "spot",
      angleRadians: Math.PI / 3,
      penumbra: 0.5,
    });
    expect(command.after.transform.rotation).not.toEqual(command.before.transform.rotation);
    expect(command.after.transform.scale).toEqual([1, 1, 1]);
  });

  function renderInspector(entity: LightEntity) {
    const execute = vi.fn<(command: DocumentCommand) => { status: "changed"; revision: number }>(
      () => ({
        status: "changed",
        revision: 2,
      }),
    );
    act(() =>
      root.render(
        createElement(
          StudioI18nProvider,
          null,
          createElement(LightInspector, { entity, editable: true, execute }),
        ),
      ),
    );
    return execute;
  }

  function input(label: string): HTMLInputElement {
    return container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
  }

  function submit(): void {
    act(() =>
      container
        .querySelector<HTMLFormElement>("form")!
        .dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true })),
    );
  }
});

function changeInput(element: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  if (setter === undefined) throw new Error("HTMLInputElement value setter is unavailable.");
  act(() => {
    setter.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

function point(): LightEntity {
  return {
    ...common(),
    light: { kind: "point", color: "#FFFFFF", intensity: 25, range: null },
  };
}

function spot(): LightEntity {
  return {
    ...common(),
    light: {
      kind: "spot",
      color: "#FFFFFF",
      intensity: 10,
      range: null,
      angleRadians: Math.PI / 4,
      penumbra: 1 / 3,
    },
  };
}

function common() {
  return {
    id: "light-a",
    type: "light" as const,
    parentId: null,
    name: "Light A",
    visible: true,
    locked: false,
    transform: { position: [0, 2, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
    metadata: {},
  } as const;
}
