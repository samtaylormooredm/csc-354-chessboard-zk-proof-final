/**
 * Browser-vs-Node determinism check, Node half.
 *
 *   pnpm engine:node-results      # writes public/engine-compare/node-results.json
 *   pnpm dev                      # then open http://localhost:5173/engine-compare.html
 *
 * The page runs the same 20 positions through the browser Web Worker engine and shows, per
 * position, whether its move equals the move recorded here.
 *
 * 14 positions are real defender positions (for generated puzzles, the position after the
 * first player move of the Lichess solution). Forced mates can end the search early, so 6
 * quiet opening/middlegame positions are added that always use the full node budget.
 */
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Chess } from "chess.js";
import { DEFAULT_ENGINE_CONFIG } from "../src/engine/config";
import { createNodeDefender } from "../src/engine/stockfish-node";
import { applyUciMove } from "../src/game/moves";
import type { Puzzle, Tier } from "../src/game/types";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PER_TIER: Record<Tier, number> = { easy: 5, medium: 5, hard: 4 };
const QUIET_FENS = [
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  "r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3",
  "rnbq1rk1/ppp1ppbp/3p1np1/8/2PPP3/2N2N2/PP2BPPP/R1BQK2R b KQ - 3 6",
  "r1bq1rk1/pp2bppp/2n1pn2/3p4/3P1B2/2NBPN2/PP3PPP/R2QK2R w KQ - 4 9",
  "r2q1rk1/1b2bppp/p1np1n2/1p2p3/4P3/1BN1BN2/PPP1QPPP/2KR3R w - - 2 12",
  "2r3k1/pp3ppp/2n1b3/3pP3/3P4/P1N2N2/1P3PPP/2R3K1 b - - 0 20",
];

function positions(): { puzzleId: string; fen: string }[] {
  const lines = JSON.parse(readFileSync(resolve(ROOT, "data/lichess-lines.json"), "utf8")) as Record<string, string>;
  const out: { puzzleId: string; fen: string }[] = [];
  for (const tier of ["easy", "medium", "hard"] as const) {
    const puzzles = JSON.parse(readFileSync(resolve(ROOT, `public/puzzles/${tier}.json`), "utf8")) as Puzzle[];
    for (const puzzle of puzzles.slice(0, PER_TIER[tier])) {
      const line = lines[puzzle.id]!.split(" ");
      const chess = new Chess(puzzle.startFen);
      applyUciMove(chess, line[0]!);
      applyUciMove(chess, line[1]!);
      out.push({ puzzleId: puzzle.id, fen: chess.fen() });
    }
  }
  QUIET_FENS.forEach((fen, i) => out.push({ puzzleId: `quiet${i + 1}`, fen }));
  return out;
}

async function main(): Promise<void> {
  const defender = createNodeDefender(DEFAULT_ENGINE_CONFIG);
  const results: { puzzleId: string; fen: string; move: string }[] = [];
  try {
    for (const [i, p] of positions().entries()) {
      const t0 = Date.now();
      const move = await defender.reply(p.fen);
      results.push({ ...p, move });
      console.log(`${String(i + 1).padStart(2)}/20  ${p.puzzleId.padEnd(6)}  ${move.padEnd(5)}  ${String(Date.now() - t0).padStart(5)} ms  ${p.fen}`);
    }
  } finally {
    defender.terminate();
  }
  const out = resolve(ROOT, "public/engine-compare/node-results.json");
  await mkdir(dirname(out), { recursive: true });
  await writeFile(
    out,
    JSON.stringify({ config: DEFAULT_ENGINE_CONFIG, node: process.version, platform: `${process.platform}-${process.arch}`, results }, null, 1) + "\n",
  );
  console.log(`\nWrote ${out}\nNow run "pnpm dev" and open /engine-compare.html`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
