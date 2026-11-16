/**
 * Browser adapter: runs the pinned single-threaded Stockfish WASM build in a Web Worker.
 * The engine files are served at <base>/engine/ by the plugin in vite.config.ts.
 */
import { DEFAULT_ENGINE_CONFIG, ENGINE_FILE_BASENAME } from "./config";
import type { EngineConfig } from "./types";
import { UciDefender, type UciTransport } from "./uci";

function createWorkerTransport(): UciTransport {
  const worker = new Worker(`${import.meta.env.BASE_URL}engine/${ENGINE_FILE_BASENAME}.js`);
  let onLine: (line: string) => void = () => {};
  let onError: (error: Error) => void = () => {};

  worker.onmessage = (event: MessageEvent<unknown>) => {
    for (const line of String(event.data).split("\n")) onLine(line.trimEnd());
  };
  worker.onerror = (event) => {
    onError(new Error(`Stockfish worker failed: ${event.message || "could not load engine"}`));
  };

  return {
    send(command) {
      worker.postMessage(command);
    },
    onLine(handler) {
      onLine = handler;
    },
    onError(handler) {
      onError = handler;
    },
    terminate() {
      worker.terminate();
    },
  };
}

/** Creates the deterministic Stockfish defender for the browser. Call terminate() when done. */
export function createBrowserDefender(config: EngineConfig = DEFAULT_ENGINE_CONFIG): UciDefender {
  return new UciDefender(createWorkerTransport(), config);
}
