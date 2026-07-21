import { defineConfig } from "vite";

export default defineConfig({
  build: {
    emptyOutDir: true,
    lib: { entry: "src/index.ts", fileName: () => "index.js", formats: ["es"] },
    minify: false,
    rolldownOptions: {
      external: ["@web3d/document", /^three(?:\/.*)?$/],
    },
    target: "es2022",
  },
});
