import { describe, expect, it } from "vitest";

import { resolveTrustedContent } from "./trusted-content";

describe("minimal-host trusted content", () => {
  it("maps the declared opaque key to host-owned content", () => {
    expect(resolveTrustedContent("inspection-card")).toEqual({
      eyebrow: "Inspection",
      title: "Press 01",
      fields: [
        { label: "Work order", value: "WO-1842" },
        { label: "Result", value: "Ready" },
        { label: "Owner", value: "Line A" },
      ],
    });
  });

  it("fails closed for an undeclared host key", () => {
    expect(resolveTrustedContent("missing-key")).toBeNull();
  });
});
