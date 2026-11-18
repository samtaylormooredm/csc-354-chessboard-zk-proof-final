/** Test helpers. Not used by the app. */
import { Chess } from "chess.js";
import { DEFAULT_ENGINE_CONFIG } from "../engine/config";
import type { Defender } from "../engine/types";
import { moveToUci } from "./moves";
import type { Puzzle } from "./types";

export function makePuzzle(fields: Pick<Puzzle, "startFen" | "setupMove" | "par"> & Partial<Puzzle>): Puzzle {
  return { id: "test1", tier: "easy", rating: 1000, engine: { ...DEFAULT_ENGINE_CONFIG }, ...fields };
}

/** Deterministic stand-in defender: plays the alphabetically first legal UCI move. */
export class FirstLegalMoveDefender implements Defender {
  readonly seen: string[] = [];
  reply(fen: string): Promise<string> {
    this.seen.push(fen);
    const moves = new Chess(fen).moves({ verbose: true }).map(moveToUci).sort();
    const first = moves[0];
    return first === undefined
      ? Promise.reject(new Error(`no legal moves in ${fen}`))
      : Promise.resolve(first);
  }
}

/** Defender that plays a fixed list of replies in order, whatever the position. */
export class ListDefender implements Defender {
  private i = 0;
  constructor(private readonly moves: readonly string[]) {}
  reply(): Promise<string> {
    const move = this.moves[this.i++];
    return move === undefined ? Promise.reject(new Error("ListDefender ran out of moves")) : Promise.resolve(move);
  }
}

/** Scholar's mate: after ...Nf6?? White mates with Qxf7#. Par 1. */
export const SCHOLARS = makePuzzle({
  id: "schol",
  startFen: "r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3",
  setupMove: "g8f6",
  par: 1,
});

/** K+Q vs K. After ...Kh8: Qe8 is mate, Qf7 is stalemate. */
export const KQK = makePuzzle({
  id: "kqk01",
  startFen: "6k1/4Q3/6K1/8/8/8/8/8 b - - 0 1",
  setupMove: "g8h8",
  par: 1,
});

/** K+Q vs K with the white king far away: Qg7+ hangs the queen, leaving K vs K. */
export const HANGING_QUEEN = makePuzzle({
  id: "hangq",
  startFen: "7k/8/8/8/8/8/1Q6/K7 b - - 0 1",
  setupMove: "h8g8",
  par: 2,
});

/** Start position after 1...e5 with White (the player) able to walk into fool's mate. */
export const FOOLS = makePuzzle({
  id: "fools",
  startFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1",
  setupMove: "e7e5",
  par: 2,
});
