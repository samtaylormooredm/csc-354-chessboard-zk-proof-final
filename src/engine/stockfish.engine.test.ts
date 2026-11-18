/**
 * Determinism tests against the real engine (slow; run with `pnpm test:engine`).
 */
import { afterAll, describe, expect, it } from "vitest";
import { DEFAULT_ENGINE_CONFIG } from "./config";
import { createNodeDefender } from "./stockfish-node";
import type { UciDefender } from "./uci";

// Quiet middlegame positions on purpose: with several reasonable moves, any leak of state or
// timing into the search would show up as a different choice.
const FEN_A = "r1bq1rk1/pp2bppp/2n1pn2/3p4/3P1B2/2NBPN2/PP3PPP/R2QK2R w KQ - 4 9";
const FEN_B = "r2q1rk1/1b2bppp/p1np1n2/1p2p3/4P3/1BN1BN2/PPP1QPPP/2KR3R w - - 2 12";
const FEN_C = "2r3k1/pp3ppp/2n1b3/3pP3/3P4/P1N2N2/1P3PPP/2R3K1 b - - 0 20";

const engines: UciDefender[] = [];
function engine(config = DEFAULT_ENGINE_CONFIG): UciDefender {
  const e = createNodeDefender(config);
  engines.push(e);
  return e;
}
afterAll(() => engines.forEach((e) => e.terminate()));

describe("Stockfish defender determinism (Node)", () => {
  it("uses the documented default config", () => {
    expect(DEFAULT_ENGINE_CONFIG).toEqual({
      engineVersion: "stockfish.js-19.0.1-lite-single",
      netFile: "nn-61e7af4bb97d.nnue",
      nodes: 1_000_000,
      hashMb: 16,
      threads: 1,
    });
  });

  it("gives the same move for the same FEN queried 5 times", async () => {
    const e = engine();
    const moves: string[] = [];
    for (let i = 0; i < 5; i++) moves.push(await e.reply(FEN_A));
    expect(moves[0]).toMatch(/^[a-h][1-8][a-h][1-8][qrbn]?$/);
    expect(new Set(moves).size, moves.join(" ")).toBe(1);
  });

  it("is not affected by what was searched before (no state carried between replies)", async () => {
    const e = engine();
    const a1 = await e.reply(FEN_A);
    const b1 = await e.reply(FEN_B);
    const c1 = await e.reply(FEN_C);
    const a2 = await e.reply(FEN_A);
    const c2 = await e.reply(FEN_C);
    const b2 = await e.reply(FEN_B);
    expect([a2, b2, c2]).toEqual([a1, b1, c1]);
  });

  it("gives the same moves from a brand-new engine instance", async () => {
    const first = engine();
    const second = engine();
    for (const fen of [FEN_A, FEN_B, FEN_C]) {
      expect(await second.reply(fen), fen).toBe(await first.reply(fen));
    }
  });

  it("answers concurrent requests in order with the same results", async () => {
    const e = engine();
    const sequential = [await e.reply(FEN_A), await e.reply(FEN_B)];
    expect(await Promise.all([e.reply(FEN_A), e.reply(FEN_B)])).toEqual(sequential);
  });

  it("refuses a config for a different engine build or net", async () => {
    expect(() => createNodeDefender({ ...DEFAULT_ENGINE_CONFIG, engineVersion: "stockfish-other" })).toThrow();
    const wrongNet = engine({ ...DEFAULT_ENGINE_CONFIG, netFile: "nn-000000000000.nnue" });
    await expect(wrongNet.reply(FEN_A)).rejects.toThrow(/NNUE net/);
  });

  it("returns the mating move when one exists and fails cleanly when there is no move", async () => {
    const e = engine();
    expect(await e.reply("r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4")).toBe("h5f7");
    await expect(e.reply("r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4")).rejects.toThrow();
  });
});
