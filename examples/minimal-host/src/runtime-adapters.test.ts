import { describe, expect, it } from "vitest";

import { createHostAdapters } from "./runtime-adapters";

describe("minimal-host adapter boundary", () => {
  it("creates only the explicitly supported manifest requirement", () => {
    const adapters = createHostAdapters([{ sourceId: "factory-telemetry", adapter: "mock" }]);

    expect(Object.keys(adapters)).toEqual(["factory-telemetry"]);
    expect(adapters["factory-telemetry"]?.sourceId).toBe("factory-telemetry");
  });

  it("rejects unknown source IDs and adapter kinds without guessing", () => {
    expect(() => createHostAdapters([{ sourceId: "other", adapter: "mock" }])).toThrow(
      "unsupported host adapter",
    );
    expect(() =>
      createHostAdapters([{ sourceId: "factory-telemetry", adapter: "websocket" }]),
    ).toThrow("unsupported host adapter");
  });
});
