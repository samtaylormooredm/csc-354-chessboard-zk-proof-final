import { createReadStream, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";
import { ENGINE_FILE_BASENAME } from "./src/engine/config";

/**
 * Serves the pinned Stockfish build at /engine/<file> straight out of node_modules (dev) and
 * copies it into dist/engine (build). The file names are kept as-is because the engine's .js
 * loader looks for its .wasm next to itself by name.
 */
function stockfishEngine(): Plugin {
  const binDir = join(dirname(createRequire(import.meta.url).resolve("stockfish/package.json")), "bin");
  const files = [`${ENGINE_FILE_BASENAME}.js`, `${ENGINE_FILE_BASENAME}.wasm`];
  return {
    name: "stockfish-engine",
    configureServer(server) {
      server.middlewares.use("/engine", (req, res, next) => {
        const name = (req.url ?? "").split("?")[0]!.replace(/^\//, "");
        if (!files.includes(name)) return next();
        res.setHeader("Content-Type", name.endsWith(".wasm") ? "application/wasm" : "text/javascript");
        createReadStream(join(binDir, name)).pipe(res);
      });
    },
    generateBundle() {
      for (const name of files) {
        this.emitFile({ type: "asset", fileName: `engine/${name}`, source: readFileSync(join(binDir, name)) });
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), stockfishEngine()],
  build: {
    rollupOptions: {
      input: { main: "index.html", engineCompare: "engine-compare.html" },
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["src/**/*.engine.test.ts"],
  },
});
