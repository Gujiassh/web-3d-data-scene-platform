import { defineConfig } from "vitest/config";

export default defineConfig({
  root: import.meta.dirname,
  test: {
    environment: "node",
    fileParallelism: false,
    include: ["*.test.ts"],
  },
});
