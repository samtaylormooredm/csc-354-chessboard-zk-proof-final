import { useState } from "react";
import { commitSolution, isNotImplemented } from "../crypto";
import type { ActiveAttemptState, AttemptState, FailReason } from "../game/attempt";
import { canonicalSolution } from "../game/canonical";
import { moveCap, TIERS, type Puzzle, type Tier } from "../game/types";

const TIER_LABEL: Record<Tier, string> = { easy: "Easy", medium: "Medium", hard: "Hard" };

const FAIL_TEXT: Record<FailReason, string> = {
  stalemate: "Stalemate. The defender has no legal move but is not in check.",
  draw: "Draw. The position can no longer be won.",
  "player-mated": "You were checkmated.",
  "move-cap": "You reached the move limit.",
};

interface SidePanelProps {
  tier: Tier;
  onTier: (tier: Tier) => void;
  puzzle: Puzzle | null;
  puzzleNumber: number;
  puzzleCount: number;
  state: AttemptState;
  attemptKey: string;
  playerId: string;
  loadError: string | null;
  engineError: string | null;
  onRetry: () => void;
  onNext: () => void;
}

export function SidePanel(props: SidePanelProps) {
  const { tier, onTier, puzzle, state, loadError, engineError, onRetry, onNext } = props;
  const active = state.phase === "Loading" ? null : state;
  const used = active?.playerMovesUci.length ?? 0;

  return (
    <aside className="panel">
      <div className="tiers" role="tablist" aria-label="Difficulty">
        {TIERS.map((t) => (
          <button key={t} type="button" role="tab" aria-selected={t === tier} className="tier" onClick={() => onTier(t)}>
            {TIER_LABEL[t]}
          </button>
        ))}
      </div>

      <div className="puzzle-id">
        {puzzle
          ? `Puzzle ${props.puzzleNumber} of ${props.puzzleCount}`
          : "Loading puzzles…"}
      </div>

      <Status state={state} loadError={loadError} engineError={engineError} />

      {puzzle && (
        <div className="move-summary">
          Your moves: <span data-testid="move-counter">{used}</span>
          {" · "}
          <span data-testid="par">Target: {puzzle.par}</span>
          {" · "}
          Limit: {moveCap(puzzle)}
        </div>
      )}

      {active?.phase === "Ended" && (
        <Outcome key={props.attemptKey} state={active} playerId={props.playerId} />
      )}

      <div className="actions">
        <button type="button" className="btn" onClick={onRetry} disabled={!puzzle}>
          Retry
        </button>
        <button type="button" className="btn btn-primary" onClick={onNext} disabled={!puzzle}>
          Next puzzle
        </button>
      </div>
      <details className="move-history" key={props.attemptKey}>
        <summary>Move history</summary>
        <MoveList state={active} />
      </details>
    </aside>
  );
}

function Status({ state, loadError, engineError }: Pick<SidePanelProps, "state" | "loadError" | "engineError">) {
  if (loadError) return <div className="status status-error">Could not load puzzles: {loadError}</div>;
  if (engineError) return <div className="status status-error">Engine error: {engineError}. Press Retry.</div>;
  switch (state.phase) {
    case "Loading":
      return <div className="status">Loading…</div>;
    case "SetupMove":
      return <div className="status">Opponent is moving…</div>;
    case "PlayerToMove":
      return (
        <div className="status status-turn">
          <span className={`turn-dot ${state.playerColor === "w" ? "white" : "black"}`} />
          {state.playerColor === "w" ? "White" : "Black"} to move and checkmate
        </div>
      );
    case "DefenderThinking":
      return (
        <div className="status status-thinking" role="status">
          <span className="spinner" aria-hidden="true" />
          Defender thinking...
        </div>
      );
    case "Ended":
      return (
        <div className={`status ${state.result === "mate" ? "status-win" : "status-fail"}`}>
          {state.result === "mate" ? "Checkmate!" : "Puzzle failed"}
        </div>
      );
  }
}

interface MoveRow {
  number: number;
  white?: { san: string; ply: number };
  black?: { san: string; ply: number };
}

function moveRows(state: ActiveAttemptState): MoveRow[] {
  const fields = state.puzzle.startFen.split(" ");
  let number = Number(fields[5]) || 1;
  let whiteToMove = fields[1] === "w";
  const rows: MoveRow[] = [];
  state.lineSan.forEach((san, ply) => {
    let row = rows[rows.length - 1];
    if (!row || whiteToMove) {
      row = { number };
      rows.push(row);
    }
    if (whiteToMove) row.white = { san, ply };
    else {
      row.black = { san, ply };
      number++;
    }
    whiteToMove = !whiteToMove;
  });
  return rows;
}

function MoveList({ state }: { state: ActiveAttemptState | null }) {
  const rows = state ? moveRows(state) : [];
  const last = state ? state.lineSan.length - 1 : -1;
  // Ply 0 is the opponent's setup move; after that the player has the odd plies.
  const cell = (m: MoveRow["white"]) =>
    m ? (
      <span className={`san ${m.ply % 2 === 1 ? "san-player" : "san-defender"} ${m.ply === last ? "san-last" : ""}`}>
        {m.san}
      </span>
    ) : (
      <span className="san san-empty">…</span>
    );
  return (
    <div className="moves" aria-label="Moves">
      {rows.length === 0 ? (
        <div className="moves-empty">No moves yet</div>
      ) : (
        <ol className="moves-list">
          {rows.map((row) => (
            <li key={row.number} className="moves-row">
              <span className="moves-number">{row.number}.</span>
              {cell(row.white)}
              {row.black || row.white?.ply !== last ? cell(row.black) : <span className="san" />}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

type Submission =
  | { kind: "idle" }
  | { kind: "pending" }
  | { kind: "stub"; canonical: string }
  | { kind: "committed"; commitment: string }
  | { kind: "error"; message: string };

function Outcome({ state, playerId }: { state: Extract<ActiveAttemptState, { phase: "Ended" }>; playerId: string }) {
  const [submission, setSubmission] = useState<Submission>({ kind: "idle" });
  const [copied, setCopied] = useState(false);
  const { puzzle } = state;
  const used = state.playerMovesUci.length;

  if (state.result === "failed") {
    return (
      <div className="outcome outcome-fail">
        <p>{state.failReason ? FAIL_TEXT[state.failReason] : "The attempt failed."}</p>
        <p className="outcome-sub">Press Retry to try again.</p>
      </div>
    );
  }

  async function submit() {
    const canonical = canonicalSolution(puzzle, state.playerMovesUci);
    setSubmission({ kind: "pending" });
    try {
      const { commitment } = await commitSolution(canonical, playerId);
      setSubmission({ kind: "committed", commitment });
    } catch (err) {
      // The crypto module is a stub for now: show what would have been committed.
      if (isNotImplemented(err)) setSubmission({ kind: "stub", canonical });
      else setSubmission({ kind: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  const diff = used - puzzle.par;
  return (
    <div className="outcome outcome-win">
      <p className="outcome-score" data-testid="score">
        Solved in <strong>{used}</strong> {used === 1 ? "move" : "moves"} · par {puzzle.par}
        <span className={`badge ${diff <= 0 ? "badge-good" : "badge-over"}`}>
          {diff === 0 ? "On par" : diff < 0 ? `${-diff} under par` : `${diff} over par`}
        </span>
      </p>

      {(submission.kind === "idle" || submission.kind === "pending" || submission.kind === "error") && (
        <button type="button" className="btn btn-primary btn-wide" onClick={submit} disabled={submission.kind === "pending"}>
          {submission.kind === "pending" ? "Submitting…" : "Submit solution"}
        </button>
      )}
      {submission.kind === "error" && <p className="outcome-error">Submit failed: {submission.message}</p>}

      {submission.kind === "stub" && (
        <div className="canonical">
          <p className="outcome-sub">
            Commitments are not implemented yet. This is the canonical solution string that will be committed:
          </p>
          <textarea readOnly rows={3} value={submission.canonical} onFocus={(e) => e.currentTarget.select()} aria-label="Canonical solution" />
          <button type="button" className="btn btn-wide" onClick={() => copy(submission.canonical)}>
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      )}

      {submission.kind === "committed" && (
        <div className="canonical">
          <p className="outcome-sub">Solution committed. Commitment:</p>
          <textarea readOnly rows={3} value={submission.commitment} onFocus={(e) => e.currentTarget.select()} aria-label="Commitment" />
          <button type="button" className="btn btn-wide" onClick={() => copy(submission.commitment)}>
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      )}
    </div>
  );
}
