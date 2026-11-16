# csc-354-chessboard-zk-proof-final

Chess puzzle competition for CSC 354. Players solve "mate in N" puzzles against a
deterministic Stockfish defender; fewest moves to checkmate wins. The cryptography
(commitments, zero-knowledge proofs) is written by hand by the team in `src/crypto` and is
currently stubbed out.

## Run it

```bash
pnpm install
pnpm dev            # http://localhost:5173
```

| Command | What it does |
| --- | --- |
| `pnpm test` | Fast unit tests (game logic, canonical format, all 300 puzzles with ScriptedDefender) |
| `pnpm test:engine` | Slow tests: real Stockfish determinism in Node |
| `pnpm typecheck` / `pnpm build` | Type check / production build into `dist/` |
| `pnpm build-puzzles` | Rebuild `public/puzzles/*.json` from the Lichess database (downloads ~310 MB into `.cache/`) |
| `pnpm verify --puzzle <id> --moves "e8e1 e1f1"` | Replay a solution; prints result, move count, full line, canonical string |
| `pnpm engine:node-results` | Record Node engine moves for 20 positions; then open `/engine-compare.html` in `pnpm dev` to compare with the browser |

`pnpm verify` exits 0 for a mate, 1 for failed/incomplete, 2 for rejected input (illegal move,
unknown puzzle, moves after the game ended). Add `--json` for machine-readable output.

## How it fits together

- `src/game` — pure TypeScript rules: attempt state machine, `replay()`, `canonicalSolution()`.
- `src/engine` — `Defender` interface, shared UCI driver, Stockfish adapters (browser Web
  Worker, Node child process), `ScriptedDefender` for tests.
- `src/crypto` — interfaces only; every function throws `NotImplemented`. Team-owned.
- `src/ui` — React app.
- `scripts` — puzzle builder, verifier CLI, engine comparison.

The canonical solution string the crypto commits to is

```
v1|<puzzleId>|<engineVersion>|<nodes>|<move1> <move2> ...
```

See `CLAUDE.md` for the project rules (no AI-written crypto, determinism, canonical format).

## Credits and licenses

- Puzzles: [Lichess puzzle database](https://database.lichess.org/#puzzles), CC0.
- Engine: [stockfish.js](https://github.com/nmrugg/stockfish.js) 19.0.1 (lite, single-threaded), GPL-3.0.
  A deployed build ships the engine files, so GPL terms apply to distribution.
- Board and pieces: [react-chessboard](https://github.com/Clariity/react-chessboard) default pieces, MIT.
  Rules: [chess.js](https://github.com/jhlywa/chess.js), BSD-2-Clause.
