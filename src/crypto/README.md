# src/crypto: hand-written by the team

**This folder is written by hand by the project team. Claude (and any other AI assistant)
must not implement it.**

It currently contains interfaces and stubs only. Every function throws
`new Error("NotImplemented")`:

| Function | Purpose |
| --- | --- |
| `commitSolution(canonical, playerId)` | Commit to a solution without revealing it |
| `verifyOpening(commitment, canonical, playerId, opening)` | Check an opening against a commitment |
| `commitMoveCount(k)` | Commit to the number of moves used |

Rules for AI assistants working in this repository:

- Do not fill in these stubs or add new cryptographic code here or anywhere else.
- Do not add cryptography libraries to the project.
- Do not generate salts, hashes, nonces, or keys anywhere (including tests and the UI).
- Changing the signatures is the team's call; ask first.

What the rest of the app provides to this folder:

- `canonicalSolution(puzzle, playerMovesUci)` in `src/game/canonical.ts` produces the exact
  string to commit to: `v1|<puzzleId>|<engineVersion>|<nodes>|<move1> <move2> ...`.
  Its format is pinned by tests in `src/game/canonical.test.ts`.
- `replay(puzzle, playerMovesUci, defender)` in `src/game/replay.ts` deterministically
  re-plays a solution; `pnpm verify` wraps it as a CLI.
- The UI calls `commitSolution(...)` from the "Submit solution" button. While the stub throws
  `NotImplemented`, the UI shows the canonical string instead.
