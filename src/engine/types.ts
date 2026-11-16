/**
 * The opponent in a puzzle attempt. Given a position (FEN, defender to move) it returns the
 * defender's reply as a UCI move (e.g. "e7e5", "a7a8q").
 *
 * Implementations MUST be a pure function of the FEN (and their fixed config): the same FEN
 * always produces the same move, on any machine. No move history, no clocks, no randomness.
 */
export interface Defender {
  reply(fen: string): Promise<string>;
}

/**
 * Everything that determines the engine's reply. Stored on every puzzle record so a verifier
 * knows exactly which engine setup a solution was played against.
 */
export interface EngineConfig {
  /** Exact Stockfish build identifier (npm package version + flavor). */
  engineVersion: string;
  /** NNUE network file embedded in that build (the engine's default EvalFile). */
  netFile: string;
  /** Fixed node budget per reply ("go nodes N"). */
  nodes: number;
  /** Transposition table size in MB. */
  hashMb: number;
  /** Always 1: multi-threaded search is not reproducible. */
  threads: 1;
}
