import { defineConfig } from "vitest/config";

export default defineConfig({
  root: import.meta.dirname,
  resolve: {
    alias: {
      three: new URL(
        "../../packages/runtime/node_modules/three/build/three.module.js",
        import.meta.url,
      ).pathname,
    },
  },
  test: {
    include: ["hotspot-surface-index-candidate.test.ts"],
  },
});
