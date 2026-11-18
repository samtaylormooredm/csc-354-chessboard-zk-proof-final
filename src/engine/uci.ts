import { ENGINE_ID_NAME, ENGINE_VERSION } from "./config";
import type { Defender, EngineConfig } from "./types";

/**
 * A line-based pipe to a UCI engine. The browser (Web Worker) and Node adapters each provide
 * one; everything else about talking to the engine lives in UciDefender and is shared, so the
 * exact same command sequence is sent in both environments.
 */
export interface UciTransport {
  send(command: string): void;
  /** Sets the handler that receives each output line of the engine (one line per call). */
  onLine(handler: (line: string) => void): void;
  /** Sets the handler for fatal transport errors (e.g. the worker failed to load). */
  onError(handler: (error: Error) => void): void;
  terminate(): void;
}

interface Waiter {
  matches: (line: string) => boolean;
  resolve: (line: string) => void;
  reject: (error: Error) => void;
}

/**
 * Deterministic Stockfish defender.
 *
 * Every reply runs the same sequence on a clean engine state:
 *   ucinewgame -> setoption Threads/Hash -> isready -> position fen <fen> -> go nodes <N>
 * so a reply depends only on (engine build, net, nodes, hash, fen). No clocks, no skill
 * limits, no carried-over hash or history.
 */
export class UciDefender implements Defender {
  private queue: Promise<unknown> = Promise.resolve();
  private handshake: Promise<void> | null = null;
  private waiter: Waiter | null = null;
  private seen: string[] = [];
  private fatal: Error | null = null;

  constructor(
    private readonly transport: UciTransport,
    readonly config: EngineConfig,
  ) {
    if (config.engineVersion !== ENGINE_VERSION) {
      throw new Error(
        `This build ships engine "${ENGINE_VERSION}" but the puzzle requires "${config.engineVersion}".`,
      );
    }
    if (config.threads !== 1) throw new Error("EngineConfig.threads must be 1");
    for (const [name, value] of [["nodes", config.nodes], ["hashMb", config.hashMb]] as const) {
      if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`EngineConfig.${name} must be a positive integer`);
    }
    transport.onLine((line) => this.handleLine(line));
    transport.onError((error) => this.fail(error));
  }

  /** Replies are computed one at a time, in the order they were requested. */
  reply(fen: string): Promise<string> {
    const run = this.queue.then(() => this.search(fen));
    this.queue = run.catch(() => undefined);
    return run;
  }

  terminate(): void {
    this.fail(new Error("engine terminated"));
    this.transport.terminate();
  }

  private handleLine(line: string): void {
    this.seen.push(line);
    const waiter = this.waiter;
    if (waiter?.matches(line)) {
      this.waiter = null;
      waiter.resolve(line);
    }
  }

  private fail(error: Error): void {
    this.fatal ??= error;
    const waiter = this.waiter;
    this.waiter = null;
    waiter?.reject(error);
  }

  /** Sends commands, then resolves with the first output line that matches. */
  private exchange(commands: readonly string[], matches: (line: string) => boolean): Promise<string> {
    if (this.fatal) return Promise.reject(this.fatal);
    return new Promise<string>((resolve, reject) => {
      this.seen = [];
      this.waiter = { matches, resolve, reject };
      for (const command of commands) this.transport.send(command);
    });
  }

  /** Runs once: checks that the engine really is the build and net the config names. */
  private async identify(): Promise<void> {
    await this.exchange(["uci"], (line) => line === "uciok");
    const lines = this.seen;
    const idName = lines.find((l) => l.startsWith("id name "))?.slice("id name ".length);
    const netFile = lines
      .find((l) => l.startsWith("option name EvalFile "))
      ?.match(/ default (\S+)/)?.[1];
    if (idName !== ENGINE_ID_NAME) {
      throw new Error(`Unexpected engine: "${idName ?? "?"}" (expected "${ENGINE_ID_NAME}")`);
    }
    if (netFile !== this.config.netFile) {
      throw new Error(`Unexpected NNUE net: "${netFile ?? "?"}" (expected "${this.config.netFile}")`);
    }
  }

  private async search(fen: string): Promise<string> {
    if (/[\r\n]/.test(fen)) throw new Error("FEN must be a single line");
    this.handshake ??= this.identify();
    await this.handshake;

    await this.exchange(
      [
        "ucinewgame",
        `setoption name Threads value ${this.config.threads}`,
        `setoption name Hash value ${this.config.hashMb}`,
        "isready",
      ],
      (line) => line === "readyok",
    );
    const best = await this.exchange(
      [`position fen ${fen}`, `go nodes ${this.config.nodes}`],
      (line) => line.startsWith("bestmove"),
    );
    const move = best.split(/\s+/)[1];
    if (!move || !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move)) {
      throw new Error(`Engine returned no move ("${best}") for ${fen}`);
    }
    return move;
  }
}
