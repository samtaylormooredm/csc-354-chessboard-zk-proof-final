/**
 * Verifier CLI: replays a submitted solution against the deterministic Stockfish defender.
 *
 *   pnpm verify --puzzle <id> --moves "e2e4 d1h5 ..."   [--json]
 *
 * Uses the same replay() as the UI and the Node Stockfish adapter.
 * Exit code: 0 = mate, 1 = not a mate (failed or incomplete), 2 = invalid input or error.
 */
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { createNodeDefender } from "../src/engine/stockfish-node";
import { canonicalSolution } from "../src/game/canonical";
import { IllegalMoveError } from "../src/game/moves";
import { replay, ReplayError } from "../src/game/replay";
import { TIERS, type Puzzle } from "../src/game/types";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const USAGE = 'Usage: pnpm verify --puzzle <id> --moves "e2e4 d1h5 ..." [--json]';

class UsageError extends Error {}

async function findPuzzle(id: string): Promise<Puzzle> {
  for (const tier of TIERS) {
    const puzzles = JSON.parse(await readFile(resolve(ROOT, `public/puzzles/${tier}.json`), "utf8")) as Puzzle[];
    const puzzle = puzzles.find((p) => p.id === id);
    if (puzzle) return puzzle;
  }
  throw new UsageError(`Unknown puzzle id "${id}" (ids are case-sensitive).`);
}

async function main(): Promise<number> {
  let values: { puzzle?: string; moves?: string; json?: boolean };
  try {
    ({ values } = parseArgs({
      // pnpm may forward a literal "--" before the script's own arguments.
      args: process.argv.slice(2).filter((arg) => arg !== "--"),
      options: { puzzle: { type: "string" }, moves: { type: "string" }, json: { type: "boolean" } },
    }));
  } catch (err) {
    throw new UsageError(err instanceof Error ? err.message : String(err));
  }
  if (!values.puzzle || values.moves === undefined) throw new UsageError("Both --puzzle and --moves are required.");

  const puzzle = await findPuzzle(values.puzzle);
  // Moves are split on whitespace but otherwise taken literally: no case-folding or other
  // "fixing", because the canonical string must be exactly what was submitted.
  const moves = values.moves.trim() === "" ? [] : values.moves.trim().split(/\s+/);

  const defender = createNodeDefender(puzzle.engine);
  let outcome;
  try {
    outcome = await replay(puzzle, moves, defender);
  } finally {
    defender.terminate();
  }
  const canonical = canonicalSolution(puzzle, moves);

  if (values.json) {
    console.log(JSON.stringify({ puzzleId: puzzle.id, par: puzzle.par, engine: puzzle.engine, ...outcome, canonical }, null, 2));
  } else {
    const result = outcome.failReason ? `${outcome.result} (${outcome.failReason})` : outcome.result;
    console.log(`puzzle:            ${puzzle.id} (${puzzle.tier}, rating ${puzzle.rating}, par ${puzzle.par})`);
    console.log(`engine:            ${puzzle.engine.engineVersion}, ${puzzle.engine.netFile}, nodes ${puzzle.engine.nodes}, hash ${puzzle.engine.hashMb} MB`);
    console.log(`result:            ${result}`);
    console.log(`player move count: ${outcome.playerMoveCount}`);
    console.log(`full line:         ${outcome.fullLineUci.join(" ")}`);
    console.log(`canonical:         ${canonical}`);
  }
  return outcome.result === "mate" ? 0 : 1;
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    if (err instanceof UsageError) console.error(`${err.message}\n${USAGE}`);
    else if (err instanceof IllegalMoveError || err instanceof ReplayError) console.error(`rejected: ${err.message}`);
    else console.error(err);
    process.exit(2);
  },
);
