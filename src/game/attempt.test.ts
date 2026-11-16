import { describe, expect, it } from "vitest";
import {
  AttemptPhaseError,
  loadingAttempt,
  playDefenderMove,
  playPlayerMove,
  playSetupMove,
  startAttempt,
} from "./attempt";
import { IllegalMoveError } from "./moves";
import { FOOLS, SCHOLARS } from "./testing";

describe("attempt state machine", () => {
  it("walks Loading -> SetupMove -> PlayerToMove -> DefenderThinking -> PlayerToMove -> Ended", () => {
    expect(loadingAttempt()).toEqual({ phase: "Loading" });

    const setup = startAttempt(SCHOLARS);
    expect(setup).toMatchObject({ phase: "SetupMove", playerColor: "w", fen: SCHOLARS.startFen, lineUci: [] });

    const toMove = playSetupMove(setup);
    expect(toMove).toMatchObject({ phase: "PlayerToMove", lineUci: ["g8f6"], lineSan: ["Nf6"], playerMovesUci: [] });

    const thinking = playPlayerMove(toMove, "a2a3");
    expect(thinking).toMatchObject({ phase: "DefenderThinking", playerMovesUci: ["a2a3"] });

    const toMoveAgain = playDefenderMove(thinking, "a7a6");
    expect(toMoveAgain).toMatchObject({
      phase: "PlayerToMove",
      lineUci: ["g8f6", "a2a3", "a7a6"],
      playerMovesUci: ["a2a3"],
    });

    const ended = playPlayerMove(toMoveAgain, "h5f7");
    expect(ended).toMatchObject({
      phase: "Ended",
      result: "mate",
      failReason: null,
      lineSan: ["Nf6", "a3", "a6", "Qxf7#"],
      playerMovesUci: ["a2a3", "h5f7"],
    });
  });

  it("gives the player the side to move after the setup move", () => {
    expect(startAttempt(FOOLS)).toMatchObject({ playerColor: "w" });
    const blackToPlay = { ...FOOLS, startFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", setupMove: "e2e4" };
    expect(startAttempt(blackToPlay)).toMatchObject({ playerColor: "b" });
  });

  it("refuses transitions from the wrong phase", () => {
    const setup = startAttempt(SCHOLARS);
    const toMove = playSetupMove(setup);
    expect(() => playPlayerMove(setup, "h5f7")).toThrow(AttemptPhaseError);
    expect(() => playPlayerMove(loadingAttempt(), "h5f7")).toThrow(AttemptPhaseError);
    expect(() => playDefenderMove(toMove, "a7a6")).toThrow(AttemptPhaseError);
    expect(() => playSetupMove(toMove)).toThrow(AttemptPhaseError);
    expect(() => playPlayerMove(playPlayerMove(toMove, "h5f7"), "a2a3")).toThrow(AttemptPhaseError);
  });

  it("does not mutate the previous state, and an illegal move leaves it usable", () => {
    const toMove = playSetupMove(startAttempt(SCHOLARS));
    const snapshot = JSON.stringify(toMove);
    expect(() => playPlayerMove(toMove, "h5h8")).toThrow(IllegalMoveError);
    playPlayerMove(toMove, "h5f7");
    expect(JSON.stringify(toMove)).toBe(snapshot);
  });

  it("rejects a puzzle with an invalid FEN", () => {
    expect(() => startAttempt({ ...SCHOLARS, startFen: "not a fen" })).toThrow();
  });
});
