import { Chess } from "chess.js";
import { applyUciMove } from "../game/moves";
import type { Defender } from "./types";

/**
 * A defender that follows a fixed line (normally the Lichess solution) instead of an engine.
 * Used for fast tests. It only knows the positions on its script and throws anywhere else.
 */
export class ScriptedDefender implements Defender {
  private readonly replies = new Map<string, string>();

  /**
   * @param startFen position BEFORE the opponent's setup move (Puzzle.startFen)
   * @param line full line from that position: setup move, player, defender, player, ...
   */
  constructor(startFen: string, line: readonly string[]) {
    const chess = new Chess(startFen);
    line.forEach((move, i) => {
      // Index 0 is the setup move; after that the defender plays every even index.
      if (i >= 2 && i % 2 === 0) this.replies.set(chess.fen(), move);
      applyUciMove(chess, move);
    });
  }

  reply(fen: string): Promise<string> {
    const move = this.replies.get(fen);
    if (move === undefined) {
      return Promise.reject(new Error(`ScriptedDefender: position is not on the script: ${fen}`));
    }
    return Promise.resolve(move);
  }
}
