import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ScriptedDefender } from "../engine/scripted";
import { IllegalMoveError } from "./moves";
import { replay, ReplayError } from "./replay";
import { FirstLegalMoveDefender, FOOLS, HANGING_QUEEN, KQK, ListDefender, SCHOLARS } from "./testing";
import { TIERS, type Puzzle } from "./types";

const never = new ListDefender([]);

describe("replay", () => {
  it("reports mate when the player checkmates", async () => {
    expect(await replay(SCHOLARS, ["h5f7"], never)).toEqual({
      result: "mate",
      failReason: null,
      playerMoveCount: 1,
      fullLineUci: ["g8f6", "h5f7"],
    });
  });

  it("reports incomplete when no moves or not enough moves are given", async () => {
    expect(await replay(SCHOLARS, [], never)).toMatchObject({
      result: "incomplete",
      playerMoveCount: 0,
      fullLineUci: ["g8f6"],
    });
    const r = await replay(SCHOLARS, ["a2a3"], new FirstLegalMoveDefender());
    expect(r.result).toBe("incomplete");
    expect(r.fullLineUci).toHaveLength(3);
  });

  it("fails on stalemate", async () => {
    expect(await replay(KQK, ["e7f7"], never)).toMatchObject({
      result: "failed",
      failReason: "stalemate",
      playerMoveCount: 1,
    });
    expect((await replay(KQK, ["e7e8"], never)).result).toBe("mate");
  });

  it("fails on a draw (insufficient material)", async () => {
    expect(await replay(HANGING_QUEEN, ["b2g7"], new FirstLegalMoveDefender())).toEqual({
      result: "failed",
      failReason: "draw",
      playerMoveCount: 1,
      fullLineUci: ["h8g8", "b2g7", "g8g7"],
    });
  });

  it("fails when the player gets mated", async () => {
    const r = await replay(FOOLS, ["f2f3", "g2g4"], new ListDefender(["b8c6", "d8h4"]));
    expect(r).toEqual({
      result: "failed",
      failReason: "player-mated",
      playerMoveCount: 2,
      fullLineUci: ["e7e5", "f2f3", "b8c6", "g2g4", "d8h4"],
    });
  });

  it("fails at the move cap (par + 3 player moves) without asking the defender again", async () => {
    const defender = new FirstLegalMoveDefender();
    // SCHOLARS has par 1, so the cap is 4 player moves.
    const shuffle = ["a2a3", "a3a4", "b2b3", "b3b4"];
    const r = await replay(SCHOLARS, shuffle, defender);
    expect(r).toMatchObject({ result: "failed", failReason: "move-cap", playerMoveCount: 4 });
    expect(defender.seen).toHaveLength(3);
    expect(r.fullLineUci).toHaveLength(1 + 4 + 3);
    expect((await replay(SCHOLARS, shuffle.slice(0, 3), new FirstLegalMoveDefender())).result).toBe("incomplete");
  });

  it("a mate on exactly the cap move still counts as mate", async () => {
    // Three waiting moves that keep Qxf7# available, then mate on move 4 (the cap).
    const defender = new ListDefender(["a7a6", "h7h6", "b7b6"]);
    const r = await replay(SCHOLARS, ["a2a3", "h2h3", "b2b3", "h5f7"], defender);
    expect(r).toMatchObject({ result: "mate", playerMoveCount: 4 });
  });

  it("rejects illegal and malformed moves", async () => {
    for (const bad of ["h5h8", "e1e3", "h5f7q", "H5F7", "h5-f7", "Qxf7#", "", "h5f7 "]) {
      await expect(replay(SCHOLARS, [bad], never), bad).rejects.toBeInstanceOf(IllegalMoveError);
    }
  });

  it("requires the promotion piece to be spelled out", async () => {
    const promo: Puzzle = { ...KQK, id: "promo", startFen: "8/4P3/8/8/8/k7/8/K7 b - - 0 1", setupMove: "a3b3" };
    await expect(replay(promo, ["e7e8"], never)).rejects.toBeInstanceOf(IllegalMoveError);
    const r = await replay(promo, ["e7e8q"], new FirstLegalMoveDefender());
    expect(r.fullLineUci.slice(0, 2)).toEqual(["a3b3", "e7e8q"]);
  });

  it("rejects moves given after the game has ended", async () => {
    await expect(replay(SCHOLARS, ["h5f7", "a2a3"], never)).rejects.toBeInstanceOf(ReplayError);
  });

  it("rejects an illegal defender move", async () => {
    await expect(replay(SCHOLARS, ["a2a3"], new ListDefender(["a1a8"]))).rejects.toBeInstanceOf(IllegalMoveError);
  });
});

describe("generated puzzles with ScriptedDefender", () => {
  const lines = JSON.parse(readFileSync("data/lichess-lines.json", "utf8")) as Record<string, string>;
  const puzzles = TIERS.flatMap(
    (tier) => JSON.parse(readFileSync(`public/puzzles/${tier}.json`, "utf8")) as Puzzle[],
  );

  it("has 100 puzzles per tier with the expected shape", () => {
    expect(puzzles).toHaveLength(300);
    for (const tier of TIERS) expect(puzzles.filter((p) => p.tier === tier)).toHaveLength(100);
    expect(new Set(puzzles.map((p) => p.id)).size).toBe(300);
    for (const p of puzzles) {
      expect(Object.keys(p)).toEqual(["id", "tier", "rating", "startFen", "setupMove", "par", "engine"]);
      if (p.tier === "easy") expect(p.rating < 1400 && p.par === 2, p.id).toBe(true);
      if (p.tier === "medium") expect(p.rating >= 1400 && p.rating < 1900 && p.par === 3, p.id).toBe(true);
      // Lichess tags every mate in 5 OR MORE as mateIn5, so hard pars above 5 do occur.
      if (p.tier === "hard") expect(p.rating >= 1900 && p.par >= 4, p.id).toBe(true);
    }
  });

  it("the Lichess solution mates in exactly par moves for every puzzle", async () => {
    for (const puzzle of puzzles) {
      const line = lines[puzzle.id]!.split(" ");
      expect(line[0], puzzle.id).toBe(puzzle.setupMove);
      const playerMoves = line.filter((_, i) => i % 2 === 1);
      const r = await replay(puzzle, playerMoves, new ScriptedDefender(puzzle.startFen, line));
      expect(r, puzzle.id).toEqual({
        result: "mate",
        failReason: null,
        playerMoveCount: puzzle.par,
        fullLineUci: line,
      });
    }
  });
});
