import { defineConfig } from "vite";

export default defineConfig({
  build: {
    lib: {
      entry: "src/index.ts",
      formats: ["es"],
      fileName: () => "saltwatch-card.js",
    },
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
    minify: "esbuild",
  },
  test: {
    environment: "happy-dom",
    include: ["src/**/*.test.ts"],
  },
});
