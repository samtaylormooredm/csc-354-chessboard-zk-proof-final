import type { Defender } from "../engine/types";
import {
  playDefenderMove,
  playPlayerMove,
  playSetupMove,
  startAttempt,
  type AttemptResult,
  type FailReason,
} from "./attempt";
import type { Puzzle } from "./types";

export interface ReplayResult {
  /**
   * "mate" or "failed" once the game is over. "incomplete" means the given moves were all
   * legal but the game has not ended yet (not a valid solution, but not an error either).
   */
  result: AttemptResult | "incomplete";
  /** Set when result is "failed". */
  failReason: FailReason | null;
  /** Number of player moves played. */
  playerMoveCount: number;
  /** Every move of the game in order, UCI: setup move, player, defender, player, ... */
  fullLineUci: string[];
}

export class ReplayError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReplayError";
  }
}

/**
 * Replays the player's moves against `defender` from the puzzle's start.
 *
 * This is the single source of truth for "what happened": the UI steps through the same
 * transitions and the verifier calls this directly. It is pure apart from asking the
 * defender for replies, so with a deterministic defender the result is fully reproducible.
 *
 * Throws IllegalMoveError for an illegal or malformed move, and ReplayError if moves are
 * supplied after the game has already ended.
 */
export async function replay(
  puzzle: Puzzle,
  playerMovesUci: readonly string[],
  defender: Defender,
): Promise<ReplayResult> {
  let state = playSetupMove(startAttempt(puzzle));

  for (const [i, move] of playerMovesUci.entries()) {
    if (state.phase === "Ended") {
      throw new ReplayError(
        `Move ${i + 1} ("${move}") was given, but the game already ended after move ${i} (${state.result}).`,
      );
    }
    state = playPlayerMove(state, move);
    if (state.phase === "DefenderThinking") {
      state = playDefenderMove(state, await defender.reply(state.fen));
    }
  }

  if (state.phase === "Loading") throw new ReplayError("unreachable: attempt never started");
  return {
    result: state.phase === "Ended" ? state.result : "incomplete",
    failReason: state.phase === "Ended" ? state.failReason : null,
    playerMoveCount: state.playerMovesUci.length,
    fullLineUci: [...state.lineUci],
  };
}
