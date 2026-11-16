/**
 * Builds public/puzzles/{easy,medium,hard}.json from the Lichess puzzle database (CC0).
 *
 *   pnpm build-puzzles                 # downloads the database into .cache/ if needed
 *   pnpm build-puzzles --input <path>  # use an existing lichess_db_puzzle.csv.zst
 *
 * The database is streamed and decompressed line by line; it is never held in memory.
 * Also writes data/lichess-lines.json (puzzle id -> full Lichess move line), which is used
 * only by tests and ScriptedDefender and is deliberately NOT served to the browser.
 */
import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { Chess } from "chess.js";
import { DEFAULT_ENGINE_CONFIG } from "../src/engine/config";
import { applyUciMove } from "../src/game/moves";
import type { Puzzle, Tier } from "../src/game/types";
import { decompressZstdFrames } from "./zstd-frames";

const DB_URL = "https://database.lichess.org/lichess_db_puzzle.csv.zst";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_INPUT = resolve(ROOT, ".cache/lichess_db_puzzle.csv.zst");
const PER_TIER = 100;
const EXPECTED_HEADER =
  "PuzzleId,FEN,Moves,Rating,RatingDeviation,Popularity,NbPlays,Themes,GameUrl,OpeningTags";

interface Candidate {
  id: string;
  tier: Tier;
  rating: number;
  fen: string;
  /** Full Lichess line, Moves[0] (the opponent's setup move) included. */
  line: string[];
}

function tierFor(rating: number, themes: ReadonlySet<string>): Tier | null {
  if (rating < 1400) return themes.has("mateIn2") ? "easy" : null;
  if (rating < 1900) return themes.has("mateIn3") ? "medium" : null;
  return themes.has("mateIn4") || themes.has("mateIn5") ? "hard" : null;
}

/**
 * Checks the Lichess line with the same rules code the game uses: every move legal, the
 * player moves last, and the last move is checkmate. Returns par, or null if the line is bad.
 */
function parOfLine(fen: string, line: readonly string[]): number | null {
  if (line.length < 2 || line.length % 2 !== 0) return null;
  try {
    const chess = new Chess(fen);
    for (const move of line) applyUciMove(chess, move);
    return chess.isCheckmate() ? line.length / 2 : null;
  } catch {
    return null;
  }
}

async function download(dest: string): Promise<void> {
  console.log(`Downloading ${DB_URL} ...`);
  await mkdir(dirname(dest), { recursive: true });
  const res = await fetch(DB_URL);
  if (!res.ok || !res.body) throw new Error(`Download failed: HTTP ${res.status}`);
  const tmp = `${dest}.part`;
  await pipeline(Readable.fromWeb(res.body as import("node:stream/web").ReadableStream), createWriteStream(tmp));
  await rename(tmp, dest);
  console.log(`Saved ${dest}`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const inputIdx = args.indexOf("--input");
  const input = inputIdx >= 0 ? resolve(args[inputIdx + 1] ?? "") : DEFAULT_INPUT;
  if (!existsSync(input)) {
    if (inputIdx >= 0) throw new Error(`Input file not found: ${input}`);
    await download(input);
  }

  const candidates: Record<Tier, Candidate[]> = { easy: [], medium: [], hard: [] };
  let rows = 0;

  const lines = createInterface({
    input: decompressZstdFrames(createReadStream(input)),
    crlfDelay: Infinity,
  });

  for await (const row of lines) {
    if (rows++ === 0) {
      // Newer dumps append columns (e.g. DailyDate); the first ten must be the known ones.
      const header = row.trim();
      if (header !== EXPECTED_HEADER && !header.startsWith(`${EXPECTED_HEADER},`)) {
        throw new Error(`Unexpected CSV header: ${row}`);
      }
      continue;
    }
    // The first eight columns never contain commas or quotes, so a plain split is exact.
    const cols = row.split(",");
    if (cols.length < 8) continue;
    const [id, fen, moves, ratingS, rdS, popS, playsS, themesS] = cols as [
      string, string, string, string, string, string, string, string,
    ];
    const rating = Number(ratingS);
    if (!(Number(rdS) < 100 && Number(popS) > 80 && Number(playsS) > 500)) continue;
    const tier = tierFor(rating, new Set(themesS.split(" ")));
    if (!tier) continue;

    candidates[tier].push({ id, tier, rating, fen, line: moves.split(" ") });
  }

  console.log(`Read ${rows - 1} puzzles.`);

  const lichessLines: Record<string, string> = {};
  await mkdir(resolve(ROOT, "public/puzzles"), { recursive: true });
  await mkdir(resolve(ROOT, "data"), { recursive: true });

  for (const tier of ["easy", "medium", "hard"] as const) {
    // Deterministic choice: plain code-unit order on PuzzleId (no locale involved), then the
    // first PER_TIER whose Lichess line checks out (legal moves ending in checkmate).
    const sorted = candidates[tier].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const chosen: Puzzle[] = [];
    let badLines = 0;
    for (const c of sorted) {
      if (chosen.length === PER_TIER) break;
      const par = parOfLine(c.fen, c.line);
      if (par === null) {
        badLines++;
        continue;
      }
      chosen.push({
        id: c.id,
        tier,
        rating: c.rating,
        startFen: c.fen,
        setupMove: c.line[0]!,
        par,
        engine: { ...DEFAULT_ENGINE_CONFIG },
      });
      lichessLines[c.id] = c.line.join(" ");
    }
    if (chosen.length < PER_TIER) {
      throw new Error(`Only ${chosen.length} puzzles passed the filters for tier "${tier}".`);
    }
    const out = resolve(ROOT, `public/puzzles/${tier}.json`);
    await writeFile(out, JSON.stringify(chosen, null, 1) + "\n");
    console.log(
      `${tier}: ${sorted.length} candidates, ${badLines} skipped for a bad line -> wrote ${chosen.length} to ${out}`,
    );
  }

  await writeFile(
    resolve(ROOT, "data/lichess-lines.json"),
    JSON.stringify(lichessLines, null, 1) + "\n",
  );
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
