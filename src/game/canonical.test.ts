import { describe, expect, it } from "vitest";
import { canonicalSolution } from "./canonical";
import type { Puzzle } from "./types";

/**
 * These strings are PINNED. The team's commitments are computed over them, so if one of
 * these expectations ever has to change, every existing commitment breaks. Change the
 * version prefix instead of editing an expectation.
 *
 * The engine values are written out literally (not imported from engine/config) on purpose.
 */
const puzzle: Pick<Puzzle, "id" | "engine"> = {
  id: "00sHx",
  engine: {
    engineVersion: "stockfish.js-19.0.1-lite-single",
    netFile: "nn-61e7af4bb97d.nnue",
    nodes: 1000000,
    hashMb: 16,
    threads: 1,
  },
};

describe("canonicalSolution (pinned format)", () => {
  it("encodes a two-move solution", () => {
    expect(canonicalSolution(puzzle, ["e2e4", "d1h5"])).toBe(
      "v1|00sHx|stockfish.js-19.0.1-lite-single|1000000|e2e4 d1h5",
    );
  });

  it("encodes a single move", () => {
    expect(canonicalSolution(puzzle, ["h5f7"])).toBe("v1|00sHx|stockfish.js-19.0.1-lite-single|1000000|h5f7");
  });

  it("encodes promotions with a lowercase piece letter", () => {
    expect(canonicalSolution(puzzle, ["e7e8q", "a2a1n", "h7g8r", "b7b8b"])).toBe(
      "v1|00sHx|stockfish.js-19.0.1-lite-single|1000000|e7e8q a2a1n h7g8r b7b8b",
    );
  });

  it("encodes castling as the king's move", () => {
    expect(canonicalSolution(puzzle, ["e1g1", "e8c8"])).toBe(
      "v1|00sHx|stockfish.js-19.0.1-lite-single|1000000|e1g1 e8c8",
    );
  });

  it("encodes an empty move list with nothing after the last separator", () => {
    expect(canonicalSolution(puzzle, [])).toBe("v1|00sHx|stockfish.js-19.0.1-lite-single|1000000|");
  });

  it("uses the puzzle's own engine version and node count", () => {
    const other = { id: "zzZ99", engine: { ...puzzle.engine, engineVersion: "sf-test", nodes: 250000 } };
    expect(canonicalSolution(other, ["a7a8q"])).toBe("v1|zzZ99|sf-test|250000|a7a8q");
  });

  it("is byte-exact: ASCII only, single spaces, no surrounding whitespace, case-sensitive id", () => {
    const s = canonicalSolution(puzzle, ["e2e4", "d1h5", "h5f7"]);
    expect(s).toMatch(/^v1\|[^|\s]+\|[^|\s]+\|[1-9][0-9]*\|[a-h][1-8][a-h][1-8][qrbn]?( [a-h][1-8][a-h][1-8][qrbn]?)*$/);
    expect(s).toBe(s.trim());
    expect([...s].every((ch) => ch.charCodeAt(0) < 128)).toBe(true);
    expect(s.split("|")).toHaveLength(5);
    expect(canonicalSolution({ ...puzzle, id: "00shx" }, ["e2e4"])).not.toBe(canonicalSolution(puzzle, ["e2e4"]));
  });

  it("rejects moves that are not strict lowercase UCI instead of normalising them", () => {
    for (const bad of ["E2E4", "e2-e4", "e2e4 ", " e2e4", "e2e4Q", "e2e4k", "Nf3", "O-O", "", "e2e4 d1h5", "i2i4", "e9e4"]) {
      expect(() => canonicalSolution(puzzle, [bad]), JSON.stringify(bad)).toThrow();
    }
  });

  it("rejects fields that would break the separators", () => {
    expect(() => canonicalSolution({ ...puzzle, id: "a|b" }, ["e2e4"])).toThrow();
    expect(() => canonicalSolution({ ...puzzle, id: "" }, ["e2e4"])).toThrow();
    expect(() => canonicalSolution({ ...puzzle, id: "a b" }, ["e2e4"])).toThrow();
    expect(() => canonicalSolution({ id: "x", engine: { ...puzzle.engine, engineVersion: "sf|19" } }, ["e2e4"])).toThrow();
    expect(() => canonicalSolution({ id: "x", engine: { ...puzzle.engine, nodes: 1.5 } }, ["e2e4"])).toThrow();
    expect(() => canonicalSolution({ id: "x", engine: { ...puzzle.engine, nodes: 0 } }, ["e2e4"])).toThrow();
  });
});
