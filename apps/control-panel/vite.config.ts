import { defineConfig } from "vite";
export default defineConfig({
  root: "apps/control-panel",
  base: "/control/",
  build: { outDir: "build", emptyOutDir: true },
});
