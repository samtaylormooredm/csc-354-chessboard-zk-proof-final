/**
 * Browser-vs-Node determinism check, Node half.
 *
 *   pnpm engine:node-results      # writes public/engine-compare/node-results.json
 *   pnpm dev                      # then open http://localhost:5173/engine-compare.html
 *
 * The page runs the same 20 positions through the browser Web Worker engine and shows, per
 * position, whether its move equals the move recorded here.
 *
 * The positions are real defender positions: for 20 generated puzzles, the position after
 * the first player move of the Lichess solution (or after the setup move if that mates).
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
const PER_TIER: Record<Tier, number> = { easy: 6, medium: 7, hard: 7 };

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
  return out;
}

async function main(): Promise<void> {
  const defender = createNodeDefender(DEFAULT_ENGINE_CONFIG);
  const results: { puzzleId: string; fen: string; move: string }[] = [];
  try {
    for (const [i, p] of positions().entries()) {
      const move = await defender.reply(p.fen);
      results.push({ ...p, move });
      console.log(`${String(i + 1).padStart(2)}/20  ${p.puzzleId}  ${move}  ${p.fen}`);
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
