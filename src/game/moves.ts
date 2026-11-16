import type { Chess, Move, Square } from "chess.js";

/** Strict UCI move syntax: lowercase, from-square, to-square, optional promotion piece. */
const UCI_MOVE = /^[a-h][1-8][a-h][1-8][qrbn]?$/;

export class IllegalMoveError extends Error {
  readonly uci: string;
  readonly fen: string;
  constructor(uci: string, fen: string, why: string) {
    super(`Illegal move "${uci}" (${why}) in position ${fen}`);
    this.name = "IllegalMoveError";
    this.uci = uci;
    this.fen = fen;
  }
}

export function isUciSyntax(move: string): boolean {
  return UCI_MOVE.test(move);
}

export function moveToUci(move: Pick<Move, "from" | "to" | "promotion">): string {
  return `${move.from}${move.to}${move.promotion ?? ""}`;
}

/**
 * Plays a UCI move on `chess`, or throws IllegalMoveError.
 *
 * Matching is EXACT against the legal move list: a promotion must name its piece ("e7e8q")
 * and a non-promotion must not ("e2e4q" is rejected). That guarantees one legal move has
 * exactly one spelling, which the canonical solution string relies on.
 */
export function applyUciMove(chess: Chess, uci: string): Move {
  if (!isUciSyntax(uci)) throw new IllegalMoveError(uci, chess.fen(), "not a UCI move");
  const from = uci.slice(0, 2) as Square;
  const legal = chess.moves({ verbose: true, square: from }).find((m) => moveToUci(m) === uci);
  if (!legal) throw new IllegalMoveError(uci, chess.fen(), "not legal here");
  return chess.move({ from: legal.from, to: legal.to, promotion: legal.promotion });
}
