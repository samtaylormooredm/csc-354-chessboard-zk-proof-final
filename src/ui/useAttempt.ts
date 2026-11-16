import { useCallback, useEffect, useRef, useState } from "react";
import { createBrowserDefender } from "../engine/stockfish-browser";
import type { UciDefender } from "../engine/uci";
import {
  loadingAttempt,
  playDefenderMove,
  playPlayerMove,
  playSetupMove,
  startAttempt,
  type AttemptState,
} from "../game/attempt";
import type { Puzzle } from "../game/types";

/** How long the starting position is shown before the opponent's setup move is played. */
const SETUP_MOVE_DELAY_MS = 700;

/**
 * Drives the attempt state machine from src/game for one puzzle at a time: plays the setup
 * move after a short pause, and asks the Stockfish defender for a reply whenever the state
 * is DefenderThinking. All rules live in src/game; this hook only sequences the transitions.
 */
export function useAttempt(puzzle: Puzzle | null) {
  const [state, setState] = useState<AttemptState>(loadingAttempt);
  const [engineError, setEngineError] = useState<string | null>(null);
  const [attemptNumber, setAttemptNumber] = useState(0);

  // One engine worker for the lifetime of the page, plus the in-flight request so React's
  // StrictMode double effect does not search the same position twice.
  const engine = useRef<{ defender: UciDefender; fen?: string; reply?: Promise<string> } | null>(null);
  const requestReply = useCallback((p: Puzzle, fen: string): Promise<string> => {
    engine.current ??= { defender: createBrowserDefender(p.engine) };
    const e = engine.current;
    if (e.fen !== fen || !e.reply) {
      e.fen = fen;
      e.reply = e.defender.reply(fen);
    }
    return e.reply;
  }, []);
  useEffect(
    () => () => {
      engine.current?.defender.terminate();
      engine.current = null;
    },
    [],
  );

  // (Re)start whenever the puzzle changes or Retry is pressed.
  useEffect(() => {
    setEngineError(null);
    if (!puzzle) {
      setState(loadingAttempt());
      return;
    }
    try {
      setState(startAttempt(puzzle));
    } catch (err) {
      setEngineError(`Bad puzzle data: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [puzzle, attemptNumber]);

  // SetupMove -> PlayerToMove after a pause, so the opponent's move is seen being played.
  useEffect(() => {
    if (state.phase !== "SetupMove") return;
    const timer = setTimeout(() => setState((s) => (s === state ? playSetupMove(s) : s)), SETUP_MOVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [state]);

  // DefenderThinking -> ask the engine -> PlayerToMove | Ended.
  useEffect(() => {
    if (state.phase !== "DefenderThinking") return;
    let cancelled = false;
    requestReply(state.puzzle, state.fen).then(
      (move) => {
        if (!cancelled) setState((s) => (s === state ? playDefenderMove(s, move) : s));
      },
      (err: unknown) => {
        if (cancelled) return;
        engine.current = null; // a failed engine is not reused
        setEngineError(err instanceof Error ? err.message : String(err));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [state, requestReply]);

  /** Plays a player move. Illegal moves are ignored (the board only offers legal ones). */
  const move = useCallback((uci: string) => {
    setState((s) => {
      if (s.phase !== "PlayerToMove") return s;
      try {
        return playPlayerMove(s, uci);
      } catch {
        return s;
      }
    });
  }, []);

  const retry = useCallback(() => setAttemptNumber((n) => n + 1), []);

  return { state, move, retry, engineError, attemptNumber };
}
