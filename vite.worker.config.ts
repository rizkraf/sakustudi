import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const dir = path.dirname(fileURLToPath(import.meta.url));

/**
 * Bundles the BullMQ worker and the migrate/seed entrypoints into plain ESM
 * files the production image can run with Node (tsx is a dev-only
 * dependency). The `~` alias matches the app's tsconfig so imports resolve
 * identically in dev and prod.
 */
export default defineConfig({
  resolve: {
    alias: { "~": path.resolve(dir, "app") },
  },
  build: {
    ssr: true,
    emptyOutDir: false,
    outDir: "build/worker",
    rollupOptions: {
      input: {
        worker: path.resolve(dir, "worker/index.ts"),
        migrate: path.resolve(dir, "scripts/migrate.ts"),
        seed: path.resolve(dir, "scripts/seed.ts"),
      },
      output: { entryFileNames: "[name].js", format: "es" },
    },
  },
});
