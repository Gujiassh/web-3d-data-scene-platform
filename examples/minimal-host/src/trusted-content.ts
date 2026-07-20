export interface TrustedContentField {
  readonly label: string;
  readonly value: string;
}

export interface TrustedContentRecord {
  readonly eyebrow: string;
  readonly title: string;
  readonly fields: readonly TrustedContentField[];
}

const trustedContent: Readonly<Record<string, TrustedContentRecord>> = {
  "inspection-card": {
    eyebrow: "Inspection",
    title: "Press 01",
    fields: [
      { label: "Work order", value: "WO-1842" },
      { label: "Result", value: "Ready" },
      { label: "Owner", value: "Line A" },
    ],
  },
};

export function resolveTrustedContent(key: string): TrustedContentRecord | null {
  return trustedContent[key] ?? null;
}
