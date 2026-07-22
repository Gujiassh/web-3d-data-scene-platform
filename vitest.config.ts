import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      reporter: ["text", "json-summary", "html"],
    },
    include: [
      "packages/**/*.test.ts",
      "packages/**/*.test.mjs",
      "apps/**/*.test.ts",
      "examples/**/*.test.ts",
      "benchmarks/009-release-performance/**/*.test.ts",
      "scripts/release/**/*.test.mjs",
    ],
    reporters: ["default"],
  },
});
