import { isUciSyntax } from "./moves";
import type { Puzzle } from "./types";

export const CANONICAL_VERSION = "v1";

/**
 * The exact string the team's cryptography commits to. DO NOT change this format: any
 * change needs a new version prefix. Exact outputs are pinned in canonical.test.ts.
 *
 *   v1|<puzzleId>|<engineVersion>|<nodes>|<move1> <move2> ...
 *
 * - player moves only, in order, UCI, lowercase, separated by single spaces
 * - no leading/trailing whitespace anywhere, no trailing newline
 * - <nodes> is a plain base-10 integer
 *
 * This checks syntax only. Whether the moves are legal and actually mate is replay()'s job.
 */
export function canonicalSolution(
  puzzle: Pick<Puzzle, "id" | "engine">,
  playerMovesUci: readonly string[],
): string {
  const { id, engine } = puzzle;
  for (const [name, field] of [["puzzle id", id], ["engineVersion", engine.engineVersion]] as const) {
    if (field === "" || /[|\s]/.test(field)) {
      throw new Error(`canonicalSolution: ${name} must be non-empty without "|" or whitespace: "${field}"`);
    }
  }
  if (!Number.isSafeInteger(engine.nodes) || engine.nodes <= 0) {
    throw new Error(`canonicalSolution: nodes must be a positive integer: ${engine.nodes}`);
  }
  for (const move of playerMovesUci) {
    if (!isUciSyntax(move)) {
      throw new Error(`canonicalSolution: not a lowercase UCI move: "${move}"`);
    }
  }
  return `${CANONICAL_VERSION}|${id}|${engine.engineVersion}|${engine.nodes}|${playerMovesUci.join(" ")}`;
}
