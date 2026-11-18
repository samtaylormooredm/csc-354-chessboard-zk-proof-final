import { useEffect, useState } from "react";
import type { Puzzle, Tier } from "../game/types";
import { Board } from "./Board";
import { SidePanel } from "./SidePanel";
import { useAttempt } from "./useAttempt";

const PLAYER_ID = "player1";

export function App() {
  const [tier, setTier] = useState<Tier>("easy");
  const [puzzlesByTier, setPuzzlesByTier] = useState<Partial<Record<Tier, Puzzle[]>>>({});
  const [indexByTier, setIndexByTier] = useState<Record<Tier, number>>({ easy: 0, medium: 0, hard: 0 });
  const [loadError, setLoadError] = useState<string | null>(null);

  const puzzles = puzzlesByTier[tier];
  useEffect(() => {
    if (puzzles) return;
    let cancelled = false;
    setLoadError(null);
    fetch(`${import.meta.env.BASE_URL}puzzles/${tier}.json`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<Puzzle[]>;
      })
      .then(
        (list) => {
          if (!cancelled) setPuzzlesByTier((prev) => ({ ...prev, [tier]: list }));
        },
        (err: unknown) => {
          if (!cancelled) setLoadError(err instanceof Error ? err.message : String(err));
        },
      );
    return () => {
      cancelled = true;
    };
  }, [tier, puzzles]);

  const index = indexByTier[tier];
  const puzzle = puzzles?.[index] ?? null;
  const { state, move, retry, engineError, attemptNumber } = useAttempt(puzzle);

  // While a new puzzle is loading, `state` can briefly still belong to the previous one.
  const current = state.phase !== "Loading" && state.puzzle === puzzle ? state : null;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">♞</span>
          Mate Race
        </div>
      </header>

      <main className="layout">
        <section className="board-area">
          {current ? (
            <Board
              fen={current.fen}
              orientation={current.playerColor === "w" ? "white" : "black"}
              lastMove={current.lineUci[current.lineUci.length - 1] ?? null}
              interactive={current.phase === "PlayerToMove" && !engineError}
              onMove={move}
            />
          ) : (
            <div className="board board-placeholder">{loadError ? "Could not load puzzles" : "Loading…"}</div>
          )}
        </section>

        <SidePanel
          tier={tier}
          onTier={setTier}
          puzzle={puzzle}
          puzzleNumber={index + 1}
          puzzleCount={puzzles?.length ?? 0}
          state={current ?? { phase: "Loading" }}
          attemptKey={`${puzzle?.id ?? ""}:${attemptNumber}`}
          playerId={PLAYER_ID}
          loadError={loadError}
          engineError={engineError}
          onRetry={retry}
          onNext={() =>
            setIndexByTier((prev) => ({ ...prev, [tier]: (prev[tier] + 1) % Math.max(puzzles?.length ?? 1, 1) }))
          }
        />
      </main>
    </div>
  );
}
