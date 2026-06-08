import { defineConfig } from "vite";
import path from "path";

const defaultDevPort = 1420;
const devPort = Number(process.env.PORT ?? process.env.VITE_PORT ?? defaultDevPort);

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  css: {
    postcss: "./postcss.config.mjs",
  },
  server: {
    port: devPort,
    strictPort: true,
  },
  build: {
    target: "esnext",
    outDir: "dist",
  },
  esbuild: {
    jsx: "automatic",
  },
});
