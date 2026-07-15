import type { Locale } from "@web3d/demo-support/i18n";

export interface StudioFormatters {
  readonly formatCount: (value: number) => string;
  readonly formatBytes: (bytes: number) => string;
  readonly formatDateTime: (value: string) => string;
  readonly safeFileStem: (name: string, fallback: string) => string;
}

export function createStudioFormatters(locale: Locale): StudioFormatters {
  const countFormatter = new Intl.NumberFormat(locale);
  const decimalFormatter = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  const dateFormatter = new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return {
    formatCount(value) {
      return countFormatter.format(value);
    },
    formatBytes(bytes) {
      if (bytes < 1024) return `${countFormatter.format(bytes)} B`;
      if (bytes < 1024 * 1024) return `${decimalFormatter.format(bytes / 1024)} KiB`;
      return `${decimalFormatter.format(bytes / (1024 * 1024))} MiB`;
    },
    formatDateTime(value) {
      const date = new Date(value);
      return Number.isNaN(date.valueOf()) ? value : dateFormatter.format(date);
    },
    safeFileStem(name, fallback) {
      return (
        name
          .trim()
          .replace(/[^A-Za-z0-9._-]+/gu, "-")
          .replace(/^-+|-+$/gu, "") || fallback
      );
    },
  };
}
