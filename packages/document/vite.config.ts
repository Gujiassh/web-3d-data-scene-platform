import { defineConfig } from "vite";

export default defineConfig({
  build: {
    emptyOutDir: true,
    lib: { entry: "src/index.ts", fileName: () => "index.js", formats: ["es"] },
    minify: false,
    rolldownOptions: {
      external: [/^ajv(?:\/.*)?$/, "fflate"],
    },
    target: "es2022",
  },
});
