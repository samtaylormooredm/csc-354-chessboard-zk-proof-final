/**
 * Node adapter: runs the pinned single-threaded Stockfish WASM build in a child Node process
 * and talks UCI over its stdin/stdout. One process per defender, so instances are fully
 * isolated from each other.
 * Node only (used by the verifier CLI, scripts and engine tests). Never import from the UI.
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { DEFAULT_ENGINE_CONFIG, ENGINE_FILE_BASENAME } from "./config";
import type { EngineConfig } from "./types";
import { UciDefender, type UciTransport } from "./uci";

const require = createRequire(import.meta.url);

function createNodeTransport(): UciTransport {
  const enginePath = join(dirname(require.resolve("stockfish/package.json")), "bin", `${ENGINE_FILE_BASENAME}.js`);
  // Plain `node <engine>`: the engine must not inherit loaders/flags from tsx or vitest.
  const child = spawn(process.execPath, [enginePath], {
    stdio: ["pipe", "pipe", "inherit"],
    env: { ...process.env, NODE_OPTIONS: "" },
  });

  let onLine: (line: string) => void = () => {};
  let onError: (error: Error) => void = () => {};
  let terminated = false;

  createInterface({ input: child.stdout, crlfDelay: Infinity }).on("line", (line) => onLine(line.trimEnd()));
  child.on("error", (err) => onError(err));
  child.on("exit", (code, signal) => {
    if (!terminated) onError(new Error(`Stockfish process exited unexpectedly (code ${code}, signal ${signal})`));
  });
  child.stdin.on("error", (err) => {
    if (!terminated) onError(err);
  });

  return {
    send(command) {
      child.stdin.write(`${command}\n`);
    },
    onLine(handler) {
      onLine = handler;
    },
    onError(handler) {
      onError = handler;
    },
    terminate() {
      terminated = true;
      child.kill();
    },
  };
}

/** Creates the deterministic Stockfish defender for Node. Call terminate() when done. */
export function createNodeDefender(config: EngineConfig = DEFAULT_ENGINE_CONFIG): UciDefender {
  return new UciDefender(createNodeTransport(), config);
}
