/**
 * Dev page (/engine-compare.html): runs the positions from
 * public/engine-compare/node-results.json through the browser engine and compares moves.
 */
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserDefender } from "../engine/stockfish-browser";
import type { EngineConfig } from "../engine/types";

interface NodeResults {
  config: EngineConfig;
  node: string;
  platform: string;
  results: { puzzleId: string; fen: string; move: string }[];
}

function ComparePage() {
  const [data, setData] = useState<NodeResults | null>(null);
  const [browserMoves, setBrowserMoves] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let stop = () => {};
    void (async () => {
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}engine-compare/node-results.json`);
        if (!res.ok) throw new Error('node-results.json not found. Run "pnpm engine:node-results" first.');
        const loaded = (await res.json()) as NodeResults;
        if (cancelled) return;
        setData(loaded);
        const defender = createBrowserDefender(loaded.config);
        stop = () => defender.terminate();
        for (const row of loaded.results) {
          const move = await defender.reply(row.fen);
          if (cancelled) return;
          setBrowserMoves((prev) => [...prev, move]);
        }
        defender.terminate();
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
      stop();
      setBrowserMoves([]);
    };
  }, []);

  if (error) return <p style={{ color: "#b00020" }}>Error: {error}</p>;
  if (!data) return <p>Loading…</p>;

  const done = browserMoves.length;
  const mismatches = data.results.filter((r, i) => i < done && browserMoves[i] !== r.move).length;
  const finished = done === data.results.length;

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: 24, maxWidth: 1100 }}>
      <h1>Engine determinism: browser vs Node</h1>
      <p>
        {data.config.engineVersion}, net {data.config.netFile}, nodes {data.config.nodes}, hash {data.config.hashMb} MB.
        Node side: {data.node} on {data.platform}. Browser: {navigator.userAgent}
      </p>
      <p id="summary" style={{ fontWeight: 700, color: mismatches ? "#b00020" : finished ? "#1b7f3b" : "#555" }}>
        {finished
          ? mismatches === 0
            ? `PASS: all ${done} positions match`
            : `FAIL: ${mismatches} of ${done} positions differ`
          : `Running… ${done}/${data.results.length}`}
      </p>
      <table style={{ borderCollapse: "collapse", fontFamily: "ui-monospace, monospace", fontSize: 13 }}>
        <thead>
          <tr>{["#", "puzzle", "FEN", "Node", "browser", ""].map((h) => <th key={h} style={{ textAlign: "left", padding: "4px 10px" }}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {data.results.map((r, i) => {
            const b = browserMoves[i];
            return (
              <tr key={r.fen} style={{ borderTop: "1px solid #ddd" }}>
                <td style={{ padding: "4px 10px" }}>{i + 1}</td>
                <td style={{ padding: "4px 10px" }}>{r.puzzleId}</td>
                <td style={{ padding: "4px 10px" }}>{r.fen}</td>
                <td style={{ padding: "4px 10px" }}>{r.move}</td>
                <td style={{ padding: "4px 10px" }}>{b ?? "…"}</td>
                <td style={{ padding: "4px 10px" }}>{b === undefined ? "" : b === r.move ? "match" : "MISMATCH"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ComparePage />
  </StrictMode>,
);
