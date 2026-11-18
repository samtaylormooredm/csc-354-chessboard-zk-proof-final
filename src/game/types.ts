import type { EngineConfig } from "../engine/types";

export type Tier = "easy" | "medium" | "hard";

export const TIERS: readonly Tier[] = ["easy", "medium", "hard"];

/** One record of public/puzzles/<tier>.json. */
export interface Puzzle {
  /** Lichess PuzzleId. */
  id: string;
  tier: Tier;
  /** Lichess puzzle rating. */
  rating: number;
  /**
   * Position BEFORE the opponent's first move (the FEN column of the Lichess database).
   * The player's starting position is `startFen` with `setupMove` applied.
   */
  startFen: string;
  /** The opponent's first move (Lichess Moves[0]), UCI. Animated when the puzzle loads. */
  setupMove: string;
  /** Number of PLAYER moves in the Lichess solution. */
  par: number;
  /** The defender configuration this puzzle is played against. */
  engine: EngineConfig;
}

/** How many player moves are allowed beyond par before the attempt fails. */
export const MOVE_CAP_OVER_PAR = 3;

export function moveCap(puzzle: Pick<Puzzle, "par">): number {
  return puzzle.par + MOVE_CAP_OVER_PAR;
}
