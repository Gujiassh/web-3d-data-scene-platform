import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      reporter: ["text", "json-summary", "html"],
    },
    include: ["packages/**/*.test.ts", "apps/**/*.test.ts"],
    reporters: ["default"],
  },
});
