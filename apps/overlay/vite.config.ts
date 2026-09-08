import { defineConfig } from "vite";
export default defineConfig({
  root: "apps/overlay",
  base: "/overlay/",
  build: { outDir: "build", emptyOutDir: true },
});
