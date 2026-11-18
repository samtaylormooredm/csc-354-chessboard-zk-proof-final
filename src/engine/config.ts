import type { EngineConfig } from "./types";

/**
 * The engine build this project is pinned to: npm package `stockfish` 19.0.1 (nmrugg's
 * stockfish.js), "lite single-threaded" flavor. package.json pins the exact version.
 *
 * If any of these values change, engine replies change and previously recorded solutions no
 * longer verify. Bump `engineVersion` and rebuild the puzzle files when that happens.
 */
export const ENGINE_VERSION = "stockfish.js-19.0.1-lite-single";
export const ENGINE_NET_FILE = "nn-61e7af4bb97d.nnue";

/** Base name of the engine files inside `stockfish/bin` (".js" and ".wasm"). */
export const ENGINE_FILE_BASENAME = "stockfish-19-lite-single";

/** What the engine must report as `id name` for us to trust we loaded the right build. */
export const ENGINE_ID_NAME = "Stockfish 19 Lite WASM";

export const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  engineVersion: ENGINE_VERSION,
  netFile: ENGINE_NET_FILE,
  nodes: 1_000_000,
  hashMb: 16,
  threads: 1,
};
