import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  root: ".",
  build: {
    outDir: "dist",
    lib: {
      entry:   resolve(__dirname, "src/main.ts"),
      name:    "AutonHapp",
      formats: ["es"],
    },
    rollupOptions: {
      external: ["@holochain/client"],
    },
  },
  server: {
    port: 3000,
  },
});
