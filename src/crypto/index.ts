/**
 * Cryptography interfaces: STUBS ONLY.
 *
 * This folder is hand-written by the team. Every function here throws
 * `new Error("NotImplemented")` until the team replaces it. See README.md in this folder.
 */

/** Result of a commitment: the public commitment and whatever is needed to open it later. */
export interface Commitment {
  /** Public value that can be published without revealing what was committed to. */
  commitment: string;
  /** Private opening information, kept by the committer. Its shape is up to the team. */
  opening: unknown;
}

/** The message every stub throws. Callers compare against this to detect a stub. */
export const NOT_IMPLEMENTED = "NotImplemented";

export function isNotImplemented(err: unknown): boolean {
  return err instanceof Error && err.message === NOT_IMPLEMENTED;
}

/**
 * Commits a player to a solution without revealing it.
 *
 * @param canonical the exact string from canonicalSolution() in src/game/canonical.ts
 *                  ("v1|<puzzleId>|<engineVersion>|<nodes>|<move1> <move2> ...")
 * @param playerId  identifies the committing player, so a commitment cannot be copied by
 *                  another player
 * @returns the public commitment and the private opening
 */
export function commitSolution(canonical: string, playerId: string): Promise<Commitment> {
  void canonical;
  void playerId;
  return Promise.reject(new Error(NOT_IMPLEMENTED));
}

/**
 * Checks that `opening` opens `commitment` to exactly this canonical solution for this player.
 *
 * @returns true if the opening is valid, false otherwise
 */
export function verifyOpening(
  commitment: string,
  canonical: string,
  playerId: string,
  opening: unknown,
): boolean {
  void commitment;
  void canonical;
  void playerId;
  void opening;
  throw new Error(NOT_IMPLEMENTED);
}

/**
 * Commits to a move count k (the number of player moves used), for later zero-knowledge
 * comparison of scores without revealing k.
 *
 * @param k number of player moves in the solution
 */
export function commitMoveCount(k: number): Promise<Commitment> {
  void k;
  return Promise.reject(new Error(NOT_IMPLEMENTED));
}
