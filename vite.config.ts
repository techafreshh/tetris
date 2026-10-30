import { defineConfig } from "vite";

export default defineConfig({
  build: {
    outDir: "dist"
  },
  server: {
    host: true,
    port: 5173
  },
  preview: {
    host: true,
    port: 4173
  }
});
