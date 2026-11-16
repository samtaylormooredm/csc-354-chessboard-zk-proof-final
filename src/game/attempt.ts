/**
 * Attempt state machine. Pure and synchronous: every transition takes a state and returns a
 * new one. The UI drives it step by step; replay() drives it in a loop. Both therefore apply
 * exactly the same rules.
 *
 *   Loading -> SetupMove -> PlayerToMove -> DefenderThinking -> PlayerToMove -> ... -> Ended
 */
import { Chess } from "chess.js";
import { applyUciMove } from "./moves";
import { moveCap, type Puzzle } from "./types";

export type AttemptResult = "mate" | "failed";

/** Why a failed attempt failed (extra detail for the UI and the verifier output). */
export type FailReason = "stalemate" | "draw" | "player-mated" | "move-cap";

export type Color = "w" | "b";

export interface AttemptProgress {
  puzzle: Puzzle;
  /** Side the player controls (the side to move after the setup move). */
  playerColor: Color;
  /** Current position. */
  fen: string;
  /** Every move played so far, setup move first, UCI. */
  lineUci: readonly string[];
  /** Same moves in SAN, for display. */
  lineSan: readonly string[];
  /** Only the player's moves, UCI. This is what canonicalSolution() encodes. */
  playerMovesUci: readonly string[];
}

export type AttemptState =
  | { phase: "Loading" }
  | ({ phase: "SetupMove" } & AttemptProgress)
  | ({ phase: "PlayerToMove" } & AttemptProgress)
  | ({ phase: "DefenderThinking" } & AttemptProgress)
  | ({ phase: "Ended"; result: AttemptResult; failReason: FailReason | null } & AttemptProgress);

export type ActiveAttemptState = Exclude<AttemptState, { phase: "Loading" }>;

export class AttemptPhaseError extends Error {
  constructor(expected: AttemptState["phase"], actual: AttemptState["phase"]) {
    super(`Expected attempt phase ${expected}, but it is ${actual}`);
    this.name = "AttemptPhaseError";
  }
}

export function loadingAttempt(): AttemptState {
  return { phase: "Loading" };
}

/** Rebuilds the full game (with history, so repetition is detected) for a state. */
export function chessOf(state: AttemptProgress): Chess {
  const chess = new Chess(state.puzzle.startFen);
  for (const move of state.lineUci) applyUciMove(chess, move);
  return chess;
}

/** Loading -> SetupMove. Throws if the puzzle's FEN is invalid. */
export function startAttempt(puzzle: Puzzle): AttemptState {
  const chess = new Chess(puzzle.startFen);
  return {
    phase: "SetupMove",
    puzzle,
    playerColor: chess.turn() === "w" ? "b" : "w",
    fen: chess.fen(),
    lineUci: [],
    lineSan: [],
    playerMovesUci: [],
  };
}

function expectPhase<P extends ActiveAttemptState["phase"]>(
  state: AttemptState,
  phase: P,
): Extract<ActiveAttemptState, { phase: P }> {
  if (state.phase !== phase) throw new AttemptPhaseError(phase, state.phase);
  return state as Extract<ActiveAttemptState, { phase: P }>;
}

function progressAfter(prev: AttemptProgress, uci: string, isPlayerMove: boolean) {
  const chess = chessOf(prev);
  const move = applyUciMove(chess, uci);
  const progress: AttemptProgress = {
    puzzle: prev.puzzle,
    playerColor: prev.playerColor,
    fen: chess.fen(),
    lineUci: [...prev.lineUci, uci],
    lineSan: [...prev.lineSan, move.san],
    playerMovesUci: isPlayerMove ? [...prev.playerMovesUci, uci] : prev.playerMovesUci,
  };
  return { chess, progress };
}

function ended(progress: AttemptProgress, result: AttemptResult, failReason: FailReason | null): AttemptState {
  return { phase: "Ended", result, failReason, ...progress };
}

/** SetupMove -> PlayerToMove: plays the opponent's first move (Lichess Moves[0]). */
export function playSetupMove(state: AttemptState): AttemptState {
  const prev = expectPhase(state, "SetupMove");
  const { progress } = progressAfter(prev, prev.puzzle.setupMove, false);
  return { phase: "PlayerToMove", ...progress };
}

/**
 * PlayerToMove -> DefenderThinking | Ended.
 * Throws IllegalMoveError (and leaves the state untouched) if the move is not legal.
 */
export function playPlayerMove(state: AttemptState, uci: string): AttemptState {
  const prev = expectPhase(state, "PlayerToMove");
  const { chess, progress } = progressAfter(prev, uci, true);
  if (chess.isCheckmate()) return ended(progress, "mate", null);
  if (chess.isStalemate()) return ended(progress, "failed", "stalemate");
  if (chess.isDraw()) return ended(progress, "failed", "draw");
  if (progress.playerMovesUci.length >= moveCap(prev.puzzle)) {
    return ended(progress, "failed", "move-cap");
  }
  return { phase: "DefenderThinking", ...progress };
}

/**
 * DefenderThinking -> PlayerToMove | Ended.
 * Throws IllegalMoveError if the defender produced an illegal move (an engine bug).
 */
export function playDefenderMove(state: AttemptState, uci: string): AttemptState {
  const prev = expectPhase(state, "DefenderThinking");
  const { chess, progress } = progressAfter(prev, uci, false);
  if (chess.isCheckmate()) return ended(progress, "failed", "player-mated");
  if (chess.isStalemate()) return ended(progress, "failed", "stalemate");
  if (chess.isDraw()) return ended(progress, "failed", "draw");
  return { phase: "PlayerToMove", ...progress };
}
