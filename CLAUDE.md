# Chess Puzzle Competition (CSC 354 final project)

Players solve "mate in N" puzzles against a deterministic chess engine; fewest moves to
checkmate wins. The team will later hand-write cryptography (commitments, zero-knowledge
proofs) so solutions stay secret.

## Hard rules

### 1. No crypto. Ever.
- `src/crypto/` is **hand-written by the team**. Claude must NOT implement it.
- Do not implement any cryptography anywhere, do not add crypto libraries, and do not generate
  salts, hashes, or keys (no `crypto.subtle`, `node:crypto`, `randomBytes`, hashing packages...).
- `src/crypto` contains interfaces and stubs that `throw new Error("NotImplemented")`. Leave them.
- The UI catches `NotImplemented` and shows the canonical solution string instead.

### 2. Defender determinism
The defender's replies must be bit-for-bit reproducible on any machine (a verifier replays
solutions).
- Stockfish WASM, **single-threaded** build, `Threads = 1`. Same build + same NNUE net in the
  browser (Web Worker) and Node. The build and net are recorded in `EngineConfig`
  (`engineVersion`, `netFile`) and stored on every puzzle record.
- For **every** reply: `ucinewgame` -> set options (`Threads`, `Hash`) -> `position fen ...` ->
  `go nodes N`. Default `nodes = 1_000_000`, `hashMb = 16`.
- NEVER use `movetime`, `wtime/btime`, depth-by-time, `Skill Level`, or `UCI_LimitStrength`.
- Changing the engine build, net, nodes, or hash changes replies: it invalidates recorded
  solutions and requires a new `engineVersion`.

### 3. Canonical solution format (the crypto commits to this; it must never drift)
```
v1|<puzzleId>|<engineVersion>|<nodes>|<move1> <move2> ...
```
- Player moves only, UCI, lowercase, single spaces, no trailing whitespace.
- Exact outputs are pinned in `src/game/canonical.test.ts`. Do not change the format without a
  new version prefix and the team's agreement.

## Stack
Vite + React + TypeScript (strict), single package, pnpm. chess.js for rules, react-chessboard
(v5 API: single `options` prop) for the board, Vitest for tests, tsx for scripts.

## Layout
```
src/game/     pure TS, no React/DOM: puzzle types, attempt state machine, replay, canonical encoding
src/engine/   Defender interface, UCI protocol helper, Stockfish adapters (browser worker, Node), ScriptedDefender
src/crypto/   INTERFACES ONLY, stubs throw "NotImplemented" (team-owned)
src/ui/       React components
scripts/      build-puzzles.ts, verify.ts, engine comparison scripts
public/puzzles/  generated easy.json, medium.json, hard.json
```
`src/game` and `src/engine` must run identically in the browser and Node. Environment-specific
code lives only in `src/engine/stockfish-browser.ts` and `src/engine/stockfish-node.ts`.

## Puzzle data
- Source: Lichess puzzle DB (CC0), `lichess_db_puzzle.csv.zst`, streamed + decompressed.
- The CSV `FEN` is the position BEFORE the opponent's first move; `Moves[0]` is the opponent's
  move. Player starts from FEN + Moves[0].
- Tiers: easy (<1400, mateIn2), medium (1400-1899, mateIn3), hard (>=1900, mateIn4/5).
  Filter: RatingDeviation < 100, Popularity > 80, NbPlays > 500. First 100 per tier by PuzzleId
  (code-unit order).
- `par` = player moves in the Lichess solution. Move cap = par + 3 player moves.

## Game rules
- States: Loading -> SetupMove -> PlayerToMove -> DefenderThinking -> ... -> Ended(result).
- Results: `mate` (player checkmates) or `failed` (stalemate, draw, player mated, move cap).
- `replay()` in `src/game/replay.ts` is the single source of truth, shared by UI and verifier.

## Commands
- `pnpm dev` / `pnpm build` / `pnpm test` / `pnpm typecheck`
- `pnpm test:engine` (slow: real Stockfish determinism tests)
- `pnpm build-puzzles` (downloads the Lichess DB into `.cache/`)
- `pnpm verify --puzzle <id> --moves "e2e4 d1h5"`
- `pnpm engine:node-results` and the `/engine-compare.html` dev page compare browser vs Node.
