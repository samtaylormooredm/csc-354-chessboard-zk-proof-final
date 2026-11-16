import { defineConfig } from "vitest/config";

/** Slow tests that run the real Stockfish WASM engine in Node: `pnpm test:engine`. */
export default defineConfig({
  test: {
    include: ["src/**/*.engine.test.ts"],
    testTimeout: 300_000,
    hookTimeout: 60_000,
  },
});
